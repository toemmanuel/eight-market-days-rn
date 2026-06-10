import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';

import InCallManager from 'react-native-incall-manager';
import { socket } from './socket';
import { CallType, WebRTCSignalPayload } from '../types';
import { log } from './shared';

const configuration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
};

enum CallState {
  IDLE = 'idle',
  CALLING = 'calling',
  RINGING = 'ringing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
  ENDED = 'ended',
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;

  private webRtcLog: Logger;

  constructor(private namespace: string = 'WEB-RTC') {
    this.webRtcLog = new Logger(this.namespace);
  }

  currentCallId: string | null = null;
  private currentPeerId: string | null = null;

  private myUserId: string | null = null;

  private callType: CallType = 'audio';
  private callState: CallState = CallState.IDLE;

  private lastProcessedAnswer = '';

  private processedSignals = new Set<string>();

  private pendingCandidates: RTCIceCandidate[] = [];

  private onRemoteStream: ((stream: MediaStream) => void) | null = null;
  private onStateChange: ((state: CallState) => void) | null = null;

  setOnRemoteStream(cb: (stream: MediaStream) => void) {
    this.onRemoteStream = cb;
  }

  setOnStateChange(cb: (state: CallState) => void) {
    this.onStateChange = cb;
  }

  private setState(state: CallState) {
    this.callState = state;
    this.onStateChange?.(state);
  }

  private async createLocalStream() {
    if (this.localStream) return this.localStream;

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    if (this.callType === 'audio') {
      stream.getVideoTracks().forEach(t => (t.enabled = false));
    }

    this.localStream = stream;
    return stream;
  }

  public getLocalStream() {
    return this.localStream;
  }

  public getRemoteStream() {
    return this.remoteStream;
  }

  private createPeer(peerId: string, callId: string) {
    if (this.peerConnection && this.currentCallId === callId) {
      this.webRtcLog.log('Peer already exists for this call');
      return this.peerConnection;
    }

    if (this.peerConnection) {
      this.webRtcLog.log(
        'Closing existing peerConnection before creating new one',
      );
      this.peerConnection.close();
      this.peerConnection = null;
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
    };

    pc.onconnectionstatechange = () => {
      this.log('Connection:', pc.connectionState);

      if (pc.connectionState === 'connected') {
        this.setState(CallState.CONNECTED);
      }

      if (pc.connectionState === 'failed') {
        this.setState(CallState.FAILED);
        this.safeCleanup();
      }

      if (pc.connectionState === 'closed') {
        this.setState(CallState.ENDED);
      }
    };

    this.peerConnection = pc;
    return pc;
  }

  async startCall(callId: string, calleeId: string, type: CallType) {
    try {
      if (this.peerConnection) this.safeCleanup();

      this.callType = type;
      this.setState(CallState.CALLING);

      InCallManager.start({ media: 'audio' });

      await this.createLocalStream();

      const pc = this.createPeer(calleeId, callId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('CALL_PAYLOAD::', {
        to: calleeId,
        from: this.getMyUserId(),
        callId,
        type: 'offer',
        sdp: offer,
      });

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

    const signalKey = `${callId}-${type}-${sdp?.sdp?.substring(0, 50)}`;
    if (this.processedSignals.has(signalKey)) {
      this.webRtcLog.log('Ignoring duplicate signal');
      return;
    }
    this.processedSignals.add(signalKey);

    // Clear old keys after 5 seconds
    setTimeout(() => this.processedSignals.delete(signalKey), 5000);

    if (this.currentCallId && this.currentCallId !== callId) {
      return; // ignore old calls
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

    this.setState(CallState.CONNECTING);
  }

  async handleOffer(callId: string, to: string, sdp: any, type: CallType) {
    try {
      this.callType = type;
      this.setState(CallState.RINGING);

      InCallManager.start({ media: 'audio' });

      await this.createLocalStream();

      const pc = this.createPeer(to, callId);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      await this.flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('FROM::', this.getMyUserId());
      console.log('TO::', to);

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
      this.setState(CallState.CONNECTING);
    } catch (e) {
      console.error(e);
    }
  }

  setMyUserId(userId: string) {
    console.log('[WebRTC] Setting user ID:', userId);
    console.trace(); // This will show where it's being called from
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
      console.log('ICE error', e);
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

    this.setState(CallState.ENDED);

    InCallManager.stop();
  }

  endCall() {
    this.safeCleanup();
  }
}

export const webRtc = new WebRTCService();
