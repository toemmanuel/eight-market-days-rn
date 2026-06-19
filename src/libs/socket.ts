import { io, Socket as IOSocket } from 'socket.io-client';
import DeviceInfo from 'react-native-device-info';
import {
  CallType,
  IIncomingCallData,
  InitiateCallPayload,
  WebRTCSignalPayload,
} from '../types';
import type { NavigationProp } from '@react-navigation/native';
import { Platform } from 'react-native';
import { call, callKeep } from './call';
import { webRtc } from './web-rtc';
import { Logger } from './logger';

class SocketService {
  socket: IOSocket;

  navigation: Omit<NavigationProp<any>, 'getState'> | null = null;

  private incomingCall: IIncomingCallData | null = null;

  currentRoute: string | undefined = undefined;

  private myUserId: string | null = null;

  private activeCallId: string | null = null;

  private androidUrl = DeviceInfo.isEmulatorSync()
    ? 'http://10.0.2.2:3000'
    : 'http://172.20.10.2:3000';

  platform = Platform;
  url = Platform.OS === 'ios' ? 'http://localhost:3000' : this.androidUrl;

  constructor(private socketLogger = new Logger('WEB-SOCKET')) {
    this.socket = io(this.url, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: true,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      this.socketLogger.log('✅ Connected:', this.socket.id);
    });

    this.socket.on('disconnect', reason => {
      this.socketLogger.log('❌ Disconnected:', reason);
    });

    this.socket.on(
      'call:accepted',
      async (data: {
        callId: string;
        calleeId: string;
        callerId: string;
        callType: CallType;
      }) => {
        this.socketLogger.log('✅ Call accepted:', data);

        this.activeCallId = data.callId;

        try {
          call.setActiveCall(data.callId);
        } catch (err) {
          console.error('Error handling call acceptance:', err);
        }
      },
    );

    this.socket.on('connect_error', error => {
      this.socketLogger.log('🚨 Connection Error:', error.message);
    });

    this.socket.on('call:ended', (data: { callId: string; reason: string }) => {
      call.endCall(data.callId, data.reason);
      this.cleanupCall();
      if (this.currentRoute === 'Caller' || this.currentRoute === 'Callee') {
        if (this.navigation?.canGoBack()) this.navigation?.goBack();
      }
    });

    this.socket.on(
      'call:timeout',
      (data: { callId: string; reason: string }) => {
        this.socketLogger.log('Call timeout');
        this.cleanupCall();
        webRtc.endCall();
        callKeep.endCall(data.callId);
        if (this.currentRoute === 'Callee' || this.currentRoute === 'Caller')
          if (this.navigation?.canGoBack()) this.navigation?.goBack();
      },
    );

    this.socket.on('webrtc:signal', async (payload: WebRTCSignalPayload) => {
      console.log('Payload::', payload);

      if (!payload) return;

      if (payload.from === this.myUserId) {
        return;
      }

      if (!payload.callId) return;

      if (this.activeCallId && payload.callId !== this.activeCallId) {
        return;
      }

      if (!this.activeCallId) {
        this.activeCallId = payload.callId;
      }

      if (payload.type === 'answer' && !payload.sdp) return;

      if (payload.type === 'candidate' && !payload.candidate) return;

      await webRtc.handleSignal(payload);
    });
  }

  connect(userId: string) {
    this.myUserId = userId;
    webRtc.setMyUserId(userId);
    this.socket.io.opts.query = { userId };
    this.socket.connect();
  }

  getMyUserId() {
    return this.myUserId;
  }

  async initiateCall(data: InitiateCallPayload) {
    this.socket.emit('call:initiate', data);
    this.navigation?.navigate('Call', { call: data, user: 'caller' });
    await webRtc.startCall(
      data.callId,
      data?.callerId,
      data?.calleeId || '',
      data.callType || 'audio',
    );
  }

  async acceptCall(data: { callId: string }) {
    const callerId = this.incomingCall?.callerId as string;
    this.navigation?.navigate('Call', {
      call: { ...data, ...this.incomingCall },
      user: 'callee',
    });
    this.socket.emit('call:accept', data);

    console.log('Accept Call::', data);

    await webRtc.onCallAccepted?.(data.callId, callerId);
  }

  endCall(callId: string, reason: string = 'ended') {
    this.cleanupCall();
    this.socket.emit('call:end', { callId, reason });
  }

  requestVideoCall(callId: string, to: string) {
    this.socket.emit('call:request-video', { callId, to });
  }

  onRequestVideoCall(callback: () => void) {
    this.socket.on('call:requesting-video', callback);

    return () => {
      this.socket.off('call:requesting-video', callback);
    };
  }

  sendSignal(data: WebRTCSignalPayload) {
    if (this.activeCallId && data.callId !== this.activeCallId) {
      this.socketLogger.log('Blocking signal from old call');
      return;
    }

    if (!this.activeCallId && data.type === 'answer') {
      this.socketLogger.log(
        'Setting activeCallId from answer send:',
        data.callId,
      );
      this.activeCallId = data.callId;
    }

    this.socket.emit('webrtc:signal', data);
  }

  onIncomingCall(callback: (data: IIncomingCallData) => void) {
    this.socket.on('call:incoming', (data: IIncomingCallData) => {
      this.activeCallId = data.callId;
      this.incomingCall = data;
      callback(data);
    });
  }

  onCallAccepted(callback: () => void) {
    this.socket.on(
      'call:accepted',
      async (data: { callId: string; calleeId: string }) => {
        callback?.();
      },
    );
  }

  private cleanupCall() {
    this.socketLogger.log('🧹 Cleaning socket call state');

    this.activeCallId = null;
    this.incomingCall = null;
  }
}

export const socket = new SocketService();
