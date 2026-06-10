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
import { Logger } from './logger';

class SocketService {
  socket: IOSocket;

  navigation: Omit<
    NavigationProp<ReactNavigation.RootParamList>,
    'getState'
  > | null = null;

  currentRoute: string | undefined = undefined;

  private myUserId: string | null = null;

  private activeCallId: string | null = null;

  private socketLogger: Logger;

  platform = Platform;
  url =
    Platform.OS === 'ios' ? 'http://localhost:3000' : 'http://10.0.2.2:3000';

  constructor(private namespace: string = 'WEB-SOCKET') {
    this.socketLogger = new Logger(this.namespace);

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
      async (data: { callId: string; calleeId: string }) => {
        this.socketLogger.log('✅ Call accepted:', data);

        this.activeCallId = data.callId;

        try {
          // 1. Set active call
          call.setActiveCall(data.callId);

          await webRtc.onCallAccepted?.(data.callId, data.calleeId);
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
      if (payload.from === this.myUserId) {
        this.socketLogger.log('⏭️ Ignoring signal from self:', payload.type);
        return;
      }

      if (!payload.callId) return;

      this.socketLogger.log(
        `[SIGNAL RECEIVED] ${payload.type} at ${Date.now()}`,
        {
          callId: payload.callId,
          activeCallId: this.activeCallId,
          from: payload.from,
          to: payload.to,
          myId: this.myUserId,
          hasSdp: !!payload.sdp,
          hasCandidate: !!payload.candidate,
        },
      );

      // 1. Ignore old calls immediately
      if (this.activeCallId && payload.callId !== this.activeCallId) {
        this.socketLogger.log('Ignoring stale signal:', payload.type);
        return;
      }

      if (!this.activeCallId) {
        this.socketLogger.log(
          'Setting activeCallId from signal:',
          payload.callId,
        );
        this.activeCallId = payload.callId;
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
    this.myUserId = userId;
    webRtc.setMyUserId(userId);
  }

  getMyUserId() {
    return this.myUserId;
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
    this.cleanupCall();
    this.socket.emit('call:end', { callId, reason });
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
      callback(data);
    });
  }

  private cleanupCall() {
    this.socketLogger.log('🧹 Cleaning socket call state');

    this.activeCallId = null;
  }
}

export const socket = new SocketService();
