import {
  RTCPeerConnection,
  mediaDevices,
  MediaStream,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { RTCSessionDescriptionInit } from 'react-native-webrtc/lib/typescript/RTCSessionDescription';

const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  public localStream: MediaStream | null = null;
  public remoteStream: MediaStream | null = null;

  roomId: string = '';

  // Initialize and bind core event listeners
  async init(onIceCandidate: (candidate: any) => void) {
    this.pc = new RTCPeerConnection(configuration);
  }

  async startLocalStream() {
    try {
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: true, // Switched to true for better testing, toggle as needed
      });

      this.localStream.getTracks().forEach(track => {
        if (this.pc && this.localStream) {
          this.pc.addTrack(track, this.localStream);
        }
      });

      return this.localStream;
    } catch (error) {
      console.error('Failed to get local stream:', error);
      throw error;
    }
  }

  async createOffer() {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const offer = await this.pc.createOffer({});
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(answer: RTCSessionDescriptionInit) {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate: any) {
    try {
      await this.pc?.addIceCandidate(candidate);
    } catch (e) {
      console.error('Error adding ICE candidate', e);
    }
  }

  dispose() {
    this.localStream?.getTracks().forEach(track => track.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
  }
}

export const webRtc = new WebRTCService();
