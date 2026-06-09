import { io, Socket as IOSocket } from 'socket.io-client';
import {
  IIncomingCallData,
  InitiateCallPayload,
  WebRTCSignalPayload,
} from '../types';
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

  currentRoute: string | undefined;

  private activeCallId: string | null = null;

  constructor() {
    this.socket = io(
      Platform.OS === 'ios' ? 'http://localhost:3000' : 'http://10.0.2.2:3000',
      {
        autoConnect: false,
        transports: ['websocket'],
        reconnection: true,
        timeout: 20000,
      },
    );

    this.socket.on('connect', () => {
      console.log('✅ Connected:', this.socket.id);
    });

    this.socket.on('disconnect', reason => {
      console.log('❌ Disconnected:', reason);
    });

    this.socket.on('connect_error', error => {
      console.log('🚨 Connection Error:', error.message);
    });

    this.socket.on(
      'call:accepted',
      async (data: { callId: string; calleeId: string }) => {
        console.log('✅ Call accepted:', data);

        this.activeCallId = data.callId;

        call.setActiveCall(data.callId);

        await webRtc.onCallAccepted?.(data.callId, data.calleeId);
      },
    );

    this.socket.on('call:ended', (data: { callId: string; reason: string }) => {
      if (this.activeCallId !== data.callId) return;

      this.cleanupCall();

      call.endCall(data.callId, data.reason);

      if (this.currentRoute === 'Caller' || this.currentRoute === 'Callee') {
        this.navigation?.canGoBack() && this.navigation.goBack();
      }
    });

    this.socket.on(
      'call:timeout',
      (data: { callId: string; reason: string }) => {
        if (this.activeCallId !== data.callId) return;

        this.cleanupCall();

        callKeep.endCall(data.callId);

        if (this.currentRoute === 'Caller' || this.currentRoute === 'Callee') {
          this.navigation?.canGoBack() && this.navigation.goBack();
        }
      },
    );

    this.socket.on('webrtc:signal', async (payload: WebRTCSignalPayload) => {
      if (!payload.callId) return;

      // 1. Ignore old calls immediately
      if (this.activeCallId && payload.callId !== this.activeCallId) {
        console.log('Ignoring stale signal:', payload.type);
        return;
      }

      // 2. Validate payload integrity
      if (payload.type === 'answer' && !payload.sdp) return;

      if (payload.type === 'candidate' && !payload.candidate) return;

      // 3. Forward safely to WebRTC layer
      await webRtc.handleSignal(payload);
    });
  }

  connect(userId: string) {
    this.socket.io.opts.query = { userId };
    this.socket.connect();
  }

  initiateCall(data: InitiateCallPayload) {
    this.activeCallId = data.callId;

    this.socket.emit('call:initiate', data);

    this.navigation?.navigate('Caller', data);
  }

  acceptCall(data: { callId: string }) {
    this.activeCallId = data.callId;

    this.socket.emit('call:accept', data);

    this.navigation?.navigate('Callee', data);
  }

  endCall(callId: string, reason = 'ended') {
    if (this.activeCallId !== callId) return;

    this.socket.emit('call:end', { callId, reason });

    this.cleanupCall();
  }

  sendSignal(data: WebRTCSignalPayload) {
    if (this.activeCallId && data.callId !== this.activeCallId) {
      console.log('Blocking signal from old call');
      return;
    }

    this.socket.emit('webrtc:signal', data);
  }

  onIncomingCall(callback: (data: IIncomingCallData) => void) {
    this.socket.on('call:incoming', callback);
  }

  private cleanupCall() {
    console.log('🧹 Cleaning socket call state');

    this.activeCallId = null;
  }
}

export const socket = new SocketService();
