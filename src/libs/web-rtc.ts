import {
  RTCPeerConnection,
  mediaDevices,
  MediaStream,
  RTCSessionDescription,
  RTCIceCandidate,
} from 'react-native-webrtc';

import { IIncomingCallData, WebRTCSignalPayload } from '../types';
import { socket } from './socket';

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

let mediaConstraints = {
  audio: true,
  video: {
    frameRate: 30,
    facingMode: 'user',
  },
};

class WebRTCService {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private pc: RTCPeerConnection | null = null;
  callData: IIncomingCallData | null = null;

  private streams: Map<string, MediaStream> = new Map();

  private localStreams: Map<string, MediaStream> = new Map();

  init() {
    const pc = new RTCPeerConnection(configuration);
    pc.addEventListener('connectionstatechange', (event: any) => {
      switch (this.pc?.connectionState) {
        case 'closed':
          // You can handle the call being disconnected here.

          break;
      }
    });

    pc.addEventListener('track', event => {
      // Grab the remote track from the connected participant.

      this.streams.set(this.callData?.callId || '', event.streams[0]);
    });
  }

  private getPeer(callId: string, calleeId?: string) {
    let pc = this.peers.get(callId);

    if (!pc) {
      pc = new RTCPeerConnection(configuration);

      this.registerPeerEvents(callId, pc, calleeId);

      this.peers.set(callId, pc);
    }

    this.pc = pc;

    return pc;
  }

  private registerPeerEvents(
    callId: string,
    pc: RTCPeerConnection,
    calleeId?: string,
  ) {
    // ICE candidates
    pc.onicecandidate = event => {
      if (event.candidate) {
        socket.sendSignal({
          to: calleeId || '',
          callId,
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    // Remote stream
    pc.ontrack = event => {
      this.streams.set(callId, event.streams[0]);
    };
  }

  async handleSignal(payload: WebRTCSignalPayload) {
    const { callId, type, to } = payload;

    switch (type) {
      case 'offer':
        await this.handleOffer(callId, to, payload.sdp);
        break;

      case 'answer':
        await this.handleAnswer(callId, payload.sdp);
        break;

      case 'candidate':
        await this.handleCandidate(callId, payload.candidate);
        break;
    }
  }

  async startCall(callId: string, calleeId: string) {
    const pc = this.getPeer(callId, calleeId);

    const stream = await mediaDevices.getUserMedia(mediaConstraints);

    this.localStreams.set(callId, stream);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.sendSignal({
      to: calleeId,
      callId,
      type: 'offer',
      sdp: offer,
    });
  }

  async handleOffer(callId: string, offerTo: string, sdp: any) {
    const pc = this.getPeer(callId);

    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    this.localStreams.set(callId, stream);

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.sendSignal({
      to: offerTo,
      callId,
      type: 'answer',
      sdp: answer,
    });
  }

  async handleAnswer(callId: string, sdp: any) {
    const pc = this.getPeer(callId);

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  async handleCandidate(callId: string, candidate: any) {
    const pc = this.getPeer(callId);

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.log('ICE error:', e);
    }
  }

  getRemoteStream(callId: string) {
    return this.streams.get(callId);
  }

  getLocalStream(callId: string) {
    return this.localStreams.get(callId);
  }

  endCall(callId: string) {
    const pc = this.peers.get(callId);

    pc?.close();

    this.peers.delete(callId);
    this.streams.delete(callId);
    this.localStreams.delete(callId);
  }
}

export const webRtc = new WebRTCService();
