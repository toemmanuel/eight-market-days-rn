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

  currentCallId: string | null = null;
  private currentPeerId: string | null = null;

  private callType: CallType = 'audio';
  private callState: CallState = CallState.IDLE;

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

  private log(...args: any[]) {
    if (__DEV__) console.log('[WebRTC]', ...args);
  }

  // ---------------- MEDIA ----------------

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

  // ---------------- PEER ----------------

  private createPeer(peerId: string, callId: string) {
    if (this.peerConnection) {
      this.log('Reusing existing peerConnection');
    }

    const pc = new RTCPeerConnection(configuration);

    this.currentPeerId = peerId;
    this.currentCallId = callId;

    // add tracks ONCE
    this.localStream?.getTracks().forEach(track => {
      if (!this.peerConnection) {
        pc.addTrack(track, this.localStream!);
      }
    });

    pc.onicecandidate = event => {
      if (!event.candidate) return;

      socket.sendSignal({
        to: peerId,
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

  // ---------------- CALL FLOW ----------------

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

      socket.sendSignal({
        to: calleeId,
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
    const { callId, type } = payload;

    if (this.currentCallId && this.currentCallId !== callId) {
      return; // ignore old calls
    }

    switch (type) {
      case 'offer':
        return this.handleOffer(
          callId,
          payload.to!,
          payload.sdp,
          this.callType,
        );

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

  // ---------------- OFFER ----------------

  async handleOffer(callId: string, fromId: string, sdp: any, type: CallType) {
    try {
      this.callType = type;
      this.setState(CallState.RINGING);

      InCallManager.start({ media: 'audio' });

      await this.createLocalStream();

      const pc = this.createPeer(fromId, callId);

      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      await this.flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.sendSignal({
        to: fromId,
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

  // ---------------- ANSWER ----------------

  async handleAnswer(callId: string, sdp: any) {
    try {
      if (!this.peerConnection) return;
      if (this.currentCallId !== callId) return;

      if (this.peerConnection.signalingState !== 'have-local-offer') {
        this.log('Ignoring answer:', this.peerConnection.signalingState);
        return;
      }

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(sdp),
      );

      await this.flushCandidates();

      this.setState(CallState.CONNECTING);
    } catch (e) {
      console.error(e);
    }
  }

  // ---------------- CANDIDATES ----------------

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

  // ---------------- CLEANUP ----------------

  private safeCleanup() {
    this.log('Cleanup');

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
