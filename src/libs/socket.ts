import { io, Socket as IOSocket } from 'socket.io-client';
import { InitiateCallPayload, WebRTCSignalPayload } from '../types';
import type { NavigationProp } from '@react-navigation/native';
import { Platform } from 'react-native';
import { call, callKeep } from './call';
import { webRtc } from './web-rtc';

class SocketService {
  socket: IOSocket;

  navigation: Omit<
    NavigationProp<ReactNavigation.RootParamList>,
    'getState'
  > | null = null;

  currentRoute: string | undefined = undefined;

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
    });

    this.socket.on('connect_error', error => {
      console.log('🚨 Connection Error:', error.message);
    });

    this.socket.on('call:ended', (data: { callId: string; reason: string }) => {
      console.log('End call');
      call.endCall(data.callId, data.reason);
      if (this.navigation?.canGoBack()) this.navigation?.goBack();
    });

    this.socket.on(
      'call:timeout',
      (data: { callId: string; reason: string }) => {
        console.log('Call timeout');
        webRtc.endCall(data.callId);
        callKeep.endCall(data.callId);
        if (this.currentRoute === 'Callee' || this.currentRoute === 'Caller')
          if (this.navigation?.canGoBack()) this.navigation?.goBack();
      },
    );

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
    this.navigation?.navigate('Caller', data);
  }

  // backend: call:accept
  acceptCall(data: { callId: string }) {
    this.socket.emit('call:accept', data);
    this.navigation?.navigate('Callee', data);
  }

  // backend: call:end
  endCall(callId: string, reason: string = 'ended') {
    this.socket.emit('call:end', { callId, reason });
    // if (this.currentRoute === 'Callee' || this.currentRoute === 'Caller') {
    //   this.navigation?.goBack();
    // }
    // this.navigation?.goBack();
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
