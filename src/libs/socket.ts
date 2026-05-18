import { io, Socket as IOSocket } from 'socket.io-client';
import RNCallKeep from 'react-native-callkeep';
import { InitiateCallPayload, WebRTCSignalPayload } from '../types';
import { Platform } from 'react-native';
import { call } from './call';
import { webRtc } from './web-rtc';

class SocketService {
  socket: IOSocket;

  navigate: any = null;

  platform = Platform;
  url =
    Platform.OS === 'ios' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

  constructor() {
    // this.socket = io('http://192.168.0.218:3000', {
    //   autoConnect: false,
    // });

    this.socket = io(this.url, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected:', this.socket.id);
    });

    this.socket.on('disconnect', reason => {
      console.log('❌ Disconnected:', reason);
    });

    this.socket.on('call:accepted', (data: { callId: string }) => {
      console.log('Accepted Call:', data);
      call.setActiveCall(data.callId);

      // this.navigate('Caller', data);
    });

    this.socket.on('connect_error', error => {
      console.log('🚨 Connection Error:', error.message);
    });

    this.socket.on('call:end', (data: { callId: string }) => {
      console.log('End call');
    });
    this.socket.on('webrtc:signal', async (payload: WebRTCSignalPayload) => {
      await webRtc.handleSignal(payload);
    });
  }

  connect(userId: string) {
    this.socket.io.opts.query = { userId };
    this.socket.connect();
  }

  // call:initiate
  initiateCall(data: InitiateCallPayload) {
    this.socket.emit('call:initiate', data);
  }

  // backend: call:accept
  acceptCall(data: { callId: string }) {
    this.socket.emit('call:accept', data);
  }

  // backend: call:end
  endCall(callId: string) {
    this.socket.emit('call:end', { callId });
  }

  // backend: webrtc:signal
  sendSignal(data: WebRTCSignalPayload) {
    this.socket.emit('webrtc:signal', data);
  }

  onIncomingCall(callback: (data: any) => void) {
    this.socket.on('call:incoming', callback);
  }
}

export const socket = new SocketService();
