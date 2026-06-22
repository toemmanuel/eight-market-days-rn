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
  PendingCall,
  WebRTCSignalPayload,
} from '../types';
import { Logger } from './logger';

const configuration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

type PeerCloseReason = 'replaced' | 'ended' | 'failed';

type CallOffer = {
  callId: string;
  peerId: string;
  sdp: any;
  callType: CallType;
};

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private emitter = new EventEmitter();

  private currentCallId: string | null = null;
  private myUserId: string | null = null;

  private pendingCallData: PendingCall | null = null;

  private callType: CallType = 'audio';
  private callState: CALL_STATE = CALL_STATE.IDLE;
  private currentFacingMode: CurrentFacingMode = 'user';

  private candidateIntervalId: number | null = null;

  private lastProcessedAnswer = '';
  private processedSignals = new Set<string>();
  private candidate: RTCIceCandidate | null = null;

  constructor(private webRtcLog = new Logger('WEB-RTC')) {}

  private isCurrentPeer(pc: RTCPeerConnection, callId: string) {
    return this.peerConnection === pc && this.currentCallId === callId;
  }

  private resetCallData() {
    this.currentCallId = null;
    this.callType = 'audio';
    this.currentFacingMode = 'user';
    this.candidate = null;
    this.lastProcessedAnswer = '';
    this.processedSignals.clear();
    if (this.candidateIntervalId) clearInterval(this.candidateIntervalId);
  }

  private setState(state: CALL_STATE) {
    if (this.callState === state) return;

    this.callState = state;
    this.webRtcLog.info(`State changed -> ${state}`);
    this.emitter.emit('callState', state);
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
      stream.getVideoTracks().forEach(track => {
        track.enabled = false;
      });
    }

    this.localStream = stream;
    this.emitter.emit('localStream', stream);

    return stream;
  }

  public onCallStateChange(callback: (state: CALL_STATE) => void) {
    this.emitter.on('callState', callback);

    return () => {
      this.emitter.off('callState', callback);
    };
  }

  private async handleAnswerCall(callOffer: CallOffer) {
    const { sdp, callType, peerId, callId } = callOffer;
    try {
      this.callType = callType;
      // this.setState(CALL_STATE.CONNECTING);
      InCallManager.start({ media: callType });

      await this.createLocalStream();
      const pc = this.createPeer(peerId, callId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.peerConnection = pc;

      socket.sendSignal({
        to: peerId,
        from: this.getMyUserId(),
        callId,
        type: 'answer',
        sdp: answer,
      });

      this.pendingCallData = null;
    } catch (error) {
      this.webRtcLog.error('Failed to accept call', error);
      this.safeCleanup('failed');
    }
  }

  async onCallAccepted(callId: string, peerId: string) {
    console.log('Call ID::', callId);
    this.currentCallId = callId;
    this.setState(CALL_STATE.CONNECTING);
    if (!this.pendingCallData || this.pendingCallData.callId !== callId) {
      this.webRtcLog.warn('No pending call to accept');

      const intervalId = setInterval(() => {
        const callOffer = this.pendingCallData;

        if (callOffer) {
          this.handleAnswerCall(callOffer);
          clearInterval(intervalId);
        }
      }, 2000);

      return;
    }

    this.handleAnswerCall(this.pendingCallData);
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
    this.closePeerConnection('replaced');

    const pc = new RTCPeerConnection(configuration);
    const stream = this.localStream;

    this.peerConnection = pc;
    this.currentCallId = callId;

    if (!stream) {
      this.webRtcLog.warn('Creating peer connection without a local stream');
    } else {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate || !this.isCurrentPeer(pc, callId)) return;

      socket.sendSignal({
        to: peerId,
        from: this.getMyUserId(),
        callId,
        type: 'candidate',
        candidate,
      });
    };

    pc.ontrack = ({ streams }) => {
      if (!this.isCurrentPeer(pc, callId)) return;

      const [remoteStream] = streams;
      if (remoteStream) {
        this.emitter.emit('remoteStream', remoteStream);
      }
    };

    pc.onconnectionstatechange = () => {
      if (!this.isCurrentPeer(pc, callId)) return;

      this.webRtcLog.info(`Connection state -> ${pc.connectionState}`);

      if (pc.connectionState === 'connected') {
        this.setState(CALL_STATE.CONNECTED);
      }

      if (
        pc.connectionState === 'connecting' ||
        pc.connectionState === 'disconnected'
      ) {
        this.setState(CALL_STATE.CONNECTING);
      }

      if (pc.connectionState === 'failed') {
        this.setState(CALL_STATE.FAILED);
        this.safeCleanup('failed');
      }

      if (pc.connectionState === 'closed') {
        this.setState(CALL_STATE.ENDED);
        this.endCall();
      }
    };

    return pc;
  }

  private closePeerConnection(reason: PeerCloseReason = 'ended') {
    const pc = this.peerConnection;
    if (!pc) return;

    this.webRtcLog.log(`Closing peerConnection: ${reason}`);

    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();

    this.peerConnection = null;
  }

  async startCall(
    callId: string,
    callerId: string,
    calleeId: string,
    type: CallType,
  ) {
    try {
      this.safeCleanup();

      this.callType = type;
      this.setState(CALL_STATE.CALLING);
      InCallManager.start({ media: type });

      await this.createLocalStream();

      const pc = this.createPeer(calleeId, callId);
      const offer = await pc.createOffer();

      await pc.setLocalDescription(offer);

      socket.sendSignal({
        to: calleeId,
        from: callerId,
        callId,
        type: 'offer',
        sdp: offer,
      });

      return true;
    } catch (error) {
      this.webRtcLog.error('Failed to start call', error);
      this.safeCleanup('failed');
      return false;
    }
  }

  async handleSignal(payload: WebRTCSignalPayload) {
    const { callId, type, sdp, from, candidate } = payload;

    if (from === this.myUserId) return;

    if (type !== 'candidate' && this.hasProcessedSignal(callId, type, sdp)) {
      return;
    }

    if (type === 'offer' && this.callState === CALL_STATE.CALLING) {
      this.webRtcLog.warn('Received offer while already calling');
      return;
    }

    if (this.currentCallId && this.currentCallId !== callId) {
      if (this.callState === CALL_STATE.CONNECTED) return;
      this.safeCleanup();
    }

    switch (type) {
      case 'offer':
        return this.handleOffer(callId, from!, sdp, this.callType);
      case 'answer':
        return this.handleAnswer(callId, sdp);
      case 'candidate':
        return this.handleCandidate(callId, candidate);
    }
  }

  private hasProcessedSignal(callId: string, type: string, sdp: any) {
    const key = `${callId}-${type}-${sdp?.sdp?.slice(0, 100) ?? ''}`;

    if (this.processedSignals.has(key)) {
      this.webRtcLog.log('Ignoring duplicate signal');
      return true;
    }

    this.processedSignals.add(key);
    setTimeout(() => this.processedSignals.delete(key), 5000);

    return false;
  }

  async handleOffer(
    callId: string,
    peerId: string,
    sdp: any,
    callType: CallType,
  ) {
    const callOffer = { callId, peerId, sdp, callType };
    this.pendingCallData = callOffer;

    this.setState(CALL_STATE.RINGING);
  }

  async handleAnswer(callId: string, sdp: any) {
    const pc = this.peerConnection;
    if (!pc || this.currentCallId !== callId) return;

    const fingerprint = sdp?.sdp?.slice(0, 200) ?? '';
    if (this.lastProcessedAnswer === fingerprint) return;

    if (pc.signalingState !== 'have-local-offer') {
      this.webRtcLog.log('Ignoring answer:', pc.signalingState);
      return;
    }

    try {
      this.lastProcessedAnswer = fingerprint;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      if (this.candidate) await pc.addIceCandidate(this.candidate);
    } catch (error) {
      this.webRtcLog.error('Failed to handle answer', error);
    }
  }

  async handleCandidate(callId: string, candidate: any) {
    console.log('Loading candidate', this.currentCallId, callId);
    if (!candidate) return;

    const pc = this.peerConnection;
    const ice = new RTCIceCandidate(candidate);

    console.log('PC::', pc);

    if (!pc || !pc.remoteDescription) {
      this.candidate = ice;
      console.log('Setting candidate::', ice);
      const intervalId = setInterval(async () => {
        const candidate = ice;
        const pc = this.peerConnection;
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(candidate);
          clearInterval(intervalId);
        }
      }, 2000);
      return;
    }

    try {
      console.log('Candidate added..');
      await pc.addIceCandidate(ice);
    } catch (error) {
      this.webRtcLog.error('ICE candidate error', error);
    }
  }

  async switchCamera() {
    const stream = this.localStream;
    const pc = this.peerConnection;
    if (!stream) return;

    const [oldTrack] = stream.getVideoTracks();
    if (!oldTrack) return;

    const nextFacingMode =
      this.currentFacingMode === 'user' ? 'environment' : 'user';

    const newStream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: nextFacingMode },
    });

    const [newTrack] = newStream.getVideoTracks();
    if (!newTrack) return;

    newTrack.enabled = oldTrack.enabled;

    const sender = pc?.getSenders().find(s => s.track === oldTrack);
    await sender?.replaceTrack(newTrack);

    stream.removeTrack(oldTrack);
    oldTrack.stop();
    stream.addTrack(newTrack);

    this.currentFacingMode = nextFacingMode;
    this.emitter.emit('localStream', stream);
  }

  public toggleSpeaker(enabled: boolean) {
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

  public toggleCamera(enabled: boolean) {
    if (!this.localStream) return;

    const videoTracks = this.localStream.getVideoTracks();
    videoTracks.forEach(track => {
      track.enabled = enabled;
    });

    this.emitter.emit('cameraState', enabled);
  }

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

  private safeCleanup(reason: PeerCloseReason = 'ended') {
    this.webRtcLog.log('Cleanup');

    this.closePeerConnection(reason);

    clearInterval(this.candidateIntervalId);

    this.localStream?.getTracks().forEach(track => track.stop());
    this.localStream = null;

    this.pendingCallData = null;

    this.candidate = null;

    this.currentCallId = null;

    this.resetCallData();
    this.setState(CALL_STATE.ENDED);

    InCallManager.stop();
  }

  endCall() {
    if (this.currentCallId) {
      socket.endCall(this.currentCallId, 'ended');
    }

    this.safeCleanup();
  }

  setMyUserId(userId: string, force: boolean = false) {
    if (this.myUserId && this.myUserId !== userId && !force) {
      this.webRtcLog.error(
        `Attempted to change user ID from ${this.myUserId} to ${userId}. Ignoring.`,
      );
      return; // Or throw an error
    }

    this.webRtcLog.log('Setting user ID:', userId);
    this.myUserId = userId;
  }

  private getMyUserId() {
    if (!this.myUserId) {
      throw new Error('User ID not set');
    }

    return this.myUserId;
  }
}

export const webRtc = new WebRTCService();
