import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { EventEmitter } from 'events';

import InCallManager from 'react-native-incall-manager';
import { socket } from './socket';
import {
  CALL_STATE,
  CallType,
  CurrentFacingMode,
  WebRTCEvents,
  WebRTCSignalPayload,
} from '../types';
import { Logger } from './logger';

const configuration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private webRtcLog: Logger;

  private emitter = new EventEmitter();

  private currentFacingMode: CurrentFacingMode = 'user';

  constructor(private namespace: string = 'WEB-RTC') {
    this.webRtcLog = new Logger(this.namespace);
  }

  private isSpeakerEnabled: boolean = true;

  currentCallId: string | null = null;
  private currentPeerId: string | null = null;

  private myUserId: string | null = null;

  private callType: CallType = 'audio';
  private callState: CALL_STATE = CALL_STATE.IDLE;

  private lastProcessedAnswer = '';

  private processedSignals = new Set<string>();

  private pendingCandidates: RTCIceCandidate[] = [];

  private onRemoteStream: ((stream: MediaStream) => void) | null = null;

  private setState(state: CALL_STATE) {
    if (this.callState === state) return;

    this.callState = state;

    this.webRtcLog.info(`State changed → ${state}`);

    this.emitter.emit('callState', state);
  }

  public onCallStateChange(callback: (state: CALL_STATE) => void) {
    this.emitter.on('callState', callback);

    return () => {
      this.emitter.off('callState', callback);
    };
  }

  getCallState() {
    return this.callState;
  }

  private async createLocalStream() {
    if (this.localStream) {
      this.emitter.emit('localStream', this.localStream);
      return this.localStream;
    }

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    if (this.callType === 'audio') {
      stream.getVideoTracks().forEach(t => (t.enabled = false));
    }

    this.localStream = stream;

    this.emitter.emit('localStream', stream);

    return stream;
  }

  public getLocalStream() {
    return this.localStream;
  }

  public getRemoteStream() {
    return this.remoteStream;
  }

  public onRemoteStreamChange(callback: (stream: MediaStream) => void) {
    this.emitter.on('remoteStream', callback);

    return () => {
      this.emitter.off('remoteStream', callback);
    };
  }

  public onLocalStreamChange(callback: (stream: MediaStream | null) => void) {
    this.emitter.on('localStream', callback);

    if (this.localStream) {
      callback(this.localStream);
    }

    return () => {
      this.emitter.off('localStream', callback);
    };
  }

  public onMicrophoneStateChange(callback: (micState: boolean) => void) {
    this.emitter.on('microphoneState', callback);

    return () => {
      this.emitter.off('microphoneState', callback);
    };
  }

  public onCameraStateChange(callback: (micState: boolean) => void) {
    this.emitter.on('cameraState', callback);

    return () => {
      this.emitter.off('cameraState', callback);
    };
  }

  public onSpeakerChange(callback: (route: boolean) => void) {
    this.emitter.on('speakerState', callback);

    return () => {
      this.emitter.off('speakerState', callback);
    };
  }

  private createPeer(peerId: string, callId: string) {
    if (
      this.peerConnection &&
      this.currentCallId === callId &&
      this.callState !== CALL_STATE.ENDED &&
      this.callState !== CALL_STATE.FAILED
    ) {
      this.webRtcLog.log('Reusing existing peer connection');
      return this.peerConnection;
    }

    if (this.peerConnection) {
      this.webRtcLog.log(
        'Closing existing peerConnection before creating new one',
      );
      this.peerConnection.close();
      this.peerConnection = null;
      this.pendingCandidates = []; // Clear pending candidates
    }

    if (this.peerConnection && this.currentCallId === callId) {
      this.webRtcLog.log('Peer already exists for this call');
      return this.peerConnection;
    }

    const pc = new RTCPeerConnection(configuration);

    this.currentPeerId = peerId;
    this.currentCallId = callId;

    // add tracks ONCE
    this.localStream?.getTracks().forEach(track => {
      const hasTrack = pc.getSenders().some(sender => sender.track === track);
      if (!hasTrack) {
        pc.addTrack(track, this.localStream!);
      }
    });

    pc.onicecandidate = event => {
      if (!event.candidate) return;

      socket.sendSignal({
        to: peerId,
        from: this.getMyUserId(),
        callId,
        type: 'candidate',
        candidate: event.candidate,
      });
    };

    pc.ontrack = event => {
      const [stream] = event.streams;
      if (!stream) return;

      this.remoteStream = stream;
      this.onRemoteStream?.(stream);
      this.emitter.emit('remoteStream', stream);
    };

    pc.onconnectionstatechange = () => {
      this.webRtcLog.info(`Connection state → ${pc.connectionState}`);

      switch (pc.connectionState) {
        case 'new':
          break;

        case 'connecting':
          this.setState(CALL_STATE.CONNECTING);
          break;

        case 'connected':
          this.setState(CALL_STATE.CONNECTED);
          break;

        case 'disconnected':
          this.setState(CALL_STATE.CONNECTING);
          break;

        case 'failed':
          this.setState(CALL_STATE.FAILED);
          this.safeCleanup();
          break;

        case 'closed':
          this.setState(CALL_STATE.ENDED);
          socket.endCall(callId, 'ended');
          break;
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  async startCall(callId: string, calleeId: string, type: CallType) {
    try {
      if (this.peerConnection) this.safeCleanup();

      this.callType = type;
      this.setState(CALL_STATE.CALLING);

      InCallManager.start({ media: 'audio' });

      await this.createLocalStream();

      const pc = this.createPeer(calleeId, callId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.sendSignal({
        to: calleeId,
        from: this.getMyUserId(),
        callId,
        type: 'offer',
        sdp: offer,
      });

      return true;
    } catch (e) {
      console.error(e);
      this.safeCleanup();
      return false;
    }
  }

  async handleSignal(payload: WebRTCSignalPayload) {
    const { callId, type, sdp, from } = payload;

    if (from === this.myUserId) {
      this.webRtcLog.log('Ignoring signal from self');
      return;
    }

    // const signalKey = `${callId}-${type}-${sdp?.sdp?.substring(0, 50)}`;
    // if (this.processedSignals.has(signalKey)) {
    //   this.webRtcLog.log('Ignoring duplicate signal');
    //   return;
    // }
    // this.processedSignals.add(signalKey);

    // // Clear old keys after 5 seconds
    // setTimeout(() => this.processedSignals.delete(signalKey), 5000);

    // if (this.currentCallId && this.currentCallId !== callId) {
    //   return; // ignore old calls
    // }

    if (type !== 'candidate') {
      const signalKey = `${callId}-${type}-${sdp?.sdp?.substring(0, 100)}`;
      if (this.processedSignals.has(signalKey)) {
        this.webRtcLog.log('Ignoring duplicate signal');
        return;
      }
      this.processedSignals.add(signalKey);
      setTimeout(() => this.processedSignals.delete(signalKey), 5000);
    }

    if (type === 'offer') {
      if (this.callState === CALL_STATE.CALLING) {
        this.webRtcLog.warn('Received offer while calling - ignoring');
        return;
      }
    }

    if (this.currentCallId && this.currentCallId !== callId) {
      if (this.callState === CALL_STATE.CONNECTED) {
        this.webRtcLog.log(
          'Ignoring signal for different call ID - already connected',
        );
        return;
      }
      this.webRtcLog.log(
        `Switching from call ${this.currentCallId} to ${callId}`,
      );
      this.safeCleanup();
    }

    switch (type) {
      case 'offer':
        return this.handleOffer(callId, from!, payload.sdp, this.callType);

      case 'answer':
        return this.handleAnswer(callId, payload.sdp);

      case 'candidate':
        return this.handleCandidate(callId, payload.candidate);
    }
  }

  async onCallAccepted(callId: string, peerId: string) {
    this.currentCallId = callId;
    this.currentPeerId = peerId;

    InCallManager.start({
      media: this.callType === 'audio' ? 'audio' : 'video',
    });

    this.setState(CALL_STATE.CONNECTING);
  }

  async handleOffer(callId: string, to: string, sdp: any, type: CallType) {
    try {
      this.callType = type;
      this.setState(CALL_STATE.RINGING);

      InCallManager.start({ media: 'audio' });

      await this.createLocalStream();

      const pc = this.createPeer(to, callId);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      await this.flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.sendSignal({
        to: to,
        from: this.getMyUserId(),
        callId,
        type: 'answer',
        sdp: answer,
      });

      return true;
    } catch (e) {
      console.error(e);
      this.safeCleanup();
      return false;
    }
  }

  async handleAnswer(callId: string, sdp: any) {
    try {
      // Create a fingerprint of this answer
      const answerFingerprint = sdp?.sdp?.substring(0, 200) || '';

      if (this.lastProcessedAnswer === answerFingerprint) {
        this.webRtcLog.log('Duplicate answer detected, ignoring');
        return;
      }

      if (!this.peerConnection) return;
      if (this.currentCallId !== callId) return;

      const signalingState = this.peerConnection.signalingState;
      this.webRtcLog.log(`Handling answer, signaling state: ${signalingState}`);

      if (signalingState !== 'have-local-offer') {
        this.webRtcLog.log('Ignoring answer:', signalingState);
        return;
      }

      this.lastProcessedAnswer = answerFingerprint;

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(sdp),
      );

      await this.flushCandidates();
      this.setState(CALL_STATE.CONNECTING);
    } catch (e) {
      console.error(e);
    }
  }

  public toggleSpeaker(enabled: boolean) {
    this.isSpeakerEnabled = enabled;

    if (enabled) {
      InCallManager.setForceSpeakerphoneOn(true);
      InCallManager.setSpeakerphoneOn(true);
    } else {
      InCallManager.setForceSpeakerphoneOn(false);
      InCallManager.setSpeakerphoneOn(false);
    }

    this.emitter.emit('speakerState', enabled);
    this.webRtcLog.log(`Speaker ${enabled ? 'enabled' : 'disabled'}`);
  }

  public toggleMicrophone(enabled: boolean) {
    if (!this.localStream) return;

    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = enabled;
    });

    this.emitter.emit('microphoneState', enabled);
  }

  // Toggle camera (video track)
  public toggleCamera(enabled: boolean) {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = enabled;
    });

    this.emitter.emit('cameraState', enabled);
  }

  // Switch camera (front/back)
  public async switchCamera() {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    // Store current state
    const wasEnabled = videoTracks[0].enabled;

    // Stop current tracks
    videoTracks.forEach(track => {
      track.stop();
      this.localStream?.removeTrack(track);
    });

    // Get new stream with opposite camera
    const constraints = {
      audio: false,
      video: {
        facingMode: this.currentFacingMode === 'user' ? 'environment' : 'user',
      },
    };

    const newStream = await mediaDevices.getUserMedia(constraints);
    const newVideoTrack = newStream.getVideoTracks()[0];
    newVideoTrack.enabled = wasEnabled;

    this.localStream.addTrack(newVideoTrack);

    // Toggle facing mode
    this.currentFacingMode =
      this.currentFacingMode === 'user' ? 'environment' : 'user';

    this.emitter.emit('localStream', this.localStream);
    this.webRtcLog.log(`Switched to ${this.currentFacingMode} camera`);
  }

  // Get current track states
  public getMicrophoneState(): boolean {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    return audioTracks.length > 0 ? audioTracks[0].enabled : false;
  }

  public getCameraState(): boolean {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    return videoTracks.length > 0 ? videoTracks[0].enabled : false;
  }

  setMyUserId(userId: string) {
    this.webRtcLog.log('Setting user ID:', userId);
    this.myUserId = userId;
  }

  private getMyUserId(): string {
    if (!this.myUserId) {
      throw new Error('User ID not set');
    }
    return this.myUserId;
  }

  async handleCandidate(callId: string, candidate: any) {
    if (!this.peerConnection) return;
    if (this.currentCallId !== callId) return;

    try {
      const ice = new RTCIceCandidate(candidate);

      if (!this.peerConnection.remoteDescription) {
        this.pendingCandidates.push(ice);
        return;
      }

      await this.peerConnection.addIceCandidate(ice);
    } catch (e) {
      this.webRtcLog.error('ICE error', e);
    }
  }

  private async flushCandidates() {
    if (!this.peerConnection) return;

    while (this.pendingCandidates.length) {
      const c = this.pendingCandidates.shift();
      if (c) await this.peerConnection.addIceCandidate(c);
    }
  }

  private safeCleanup() {
    this.webRtcLog.log('Cleanup');

    try {
      this.peerConnection?.close();
    } catch {}

    this.localStream?.getTracks().forEach(t => t.stop());

    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;

    this.pendingCandidates = [];

    this.currentCallId = null;
    this.currentPeerId = null;

    this.setState(CALL_STATE.ENDED);

    InCallManager.stop();
  }

  endCall() {
    this.safeCleanup();
  }
}

export const webRtc = new WebRTCService();
