import RNCallKeep from 'react-native-callkeep';
import InCallManager from 'react-native-incall-manager';
import { createNavigationContainerRef } from '@react-navigation/native';
import { socket } from './socket';
import {
  IIncomingCallData,
  InitiateCallPayload,
  StartCallPayload,
} from '../types';
import { Platform } from 'react-native';
import { PERMISSIONS, request } from 'react-native-permissions';
import { notification } from './notification';
import { webRtc } from './web-rtc';

const isIOS = Platform.OS === 'ios';

class CallKeep {
  navigate: any = null;
  async setup() {
    try {
      const options = {
        ios: {
          appName: '8 Market Days',
        },
        android: {
          alertTitle: 'Permissions required',
          alertDescription: 'This app needs to access your phone accounts',
          cancelButton: 'Cancel',
          okButton: 'ok',
          // imageName: 'ic_notification',

          additionalPermissions: [],

          // selfManaged: true,

          // foregroundService: {
          //   channelId,
          //   channelName: 'Call Service',
          //   notificationTitle: 'Incoming call...',
          //   // notificationIcon: 'ic_notification',
          // },
        },
      };
      if (isIOS) {
        // iOS permissions
        await request(PERMISSIONS.IOS.MICROPHONE);
        await request(PERMISSIONS.IOS.CAMERA);

        // VoIP Push Token
        // VoipPushNotification.requestPermissions();

        // VoipPushNotification.addEventListener(
        //   'register',
        //   async (token: string) => {
        //     console.log('APNS VoIP Token:', token);

        //     // Save token to backend
        //   },
        // );
      } else {
        // Android permissions
        await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
        await request(PERMISSIONS.ANDROID.CAMERA);
        await request(PERMISSIONS.ANDROID.READ_PHONE_STATE);

        // NOT REQUIRED for VoIP apps
        await notification.requestPermission();
      }

      await RNCallKeep.setup(options);
      await new Promise<void>(res => setTimeout(() => res(), 1200));
      RNCallKeep.setAvailable(true);
    } catch (error) {
      console.error('Set up CallKeep error:', (error as any).message);
    }
  }

  displayIncomingCall(callId: string, callerName: string) {
    if (!callId || !callerName) return;
    try {
      RNCallKeep.displayIncomingCall(
        callId,
        callerName,
        callerName,
        'generic',
        true,
      );

      InCallManager.startRingtone('_BUNDLE_', 4, '', 30);

      // Optional vibration
      InCallManager.start({
        media: 'audio',
        auto: true,
        ringback: '',
      });
    } catch (error) {
      console.log('Call UI error:', error);
    }
  }

  stopRingtone() {
    InCallManager.stopRingtone();
    InCallManager.stop();
  }

  startCall({ callId, calleeName }: StartCallPayload) {
    RNCallKeep.startCall(callId, calleeName, calleeName, 'generic', true);
  }

  endCall(callId: string) {
    this.stopRingtone();
    RNCallKeep.endCall(callId);
    call.endCall(callId);
  }

  setActiveCall(callId: string) {
    RNCallKeep.setCurrentCallActive(callId);
  }

  onAnswer(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
      this.stopRingtone();
      callback(callUUID);
      RNCallKeep.setCurrentCallActive(callUUID);
    });
  }

  onEnd(callback: (callId: string) => void) {
    RNCallKeep.addEventListener('endCall', ({ callUUID, ...rest }) => {
      this.stopRingtone();
      callback(callUUID);
    });
  }
}

export const callKeep = new CallKeep();

class Call {
  private ready = false;
  navigationRef = createNavigationContainerRef();

  private callData: IIncomingCallData | null = null;

  async init() {
    await callKeep.setup();
    this.ready = true;

    socket.onIncomingCall(data => {
      if (!this.ready) return;
      this.callData = data;
      callKeep.displayIncomingCall(data.callId, data.callerName);
    });

    callKeep.onAnswer(callId => {
      this.acceptCall(callId);
      webRtc.startCall(callId, this.callData?.calleeId || '');
    });

    callKeep.onEnd(callId => {
      this.endCall(callId);
    });
  }

  initiateCall(payload: InitiateCallPayload) {
    callKeep.startCall(payload);
    socket.initiateCall(payload);
  }

  startCall(data: StartCallPayload) {
    callKeep.startCall(data);
  }

  acceptCall(callId: string) {
    socket.acceptCall({ callId });
  }

  endCall(callId: string) {
    socket?.endCall(callId);
    callKeep.endCall(callId);
    webRtc.endCall(callId);
  }

  setActiveCall(callId: string) {
    callKeep.setActiveCall(callId);
  }
}

export const call = new Call();
