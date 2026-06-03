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
import {
  PERMISSIONS,
  request,
  requestMultiple,
} from 'react-native-permissions';
import { notification } from './notification';
import { webRtc } from './web-rtc';
import notifee, {
  AndroidCategory,
  AndroidImportance,
} from '@notifee/react-native';

const isIOS = Platform.OS === 'ios';

class CallKeep {
  navigate: any = null;
  private isInitialized = false;
  private answerCallbackAdded = false;
  private endCallbackAdded = false;

  async init() {
    // Only add event listeners ONCE
    if (this.isInitialized) return;

    RNCallKeep.addEventListener(
      'showIncomingCallUi',
      async ({ handle, callUUID, name }) => {
        console.log('Show incoming call UI', { handle, callUUID, name });

        await notifee.displayNotification({
          id: callUUID,
          title: name || handle,
          body: 'Incoming call...',
          data: {
            callUUID,
            handle,
            callerName: name || handle,
          },
          android: {
            channelId: 'calls',
            importance: AndroidImportance.HIGH,
            category: AndroidCategory.CALL,
            asForegroundService: true,
            fullScreenAction: {
              id: 'fullscreen',
            },
            actions: [
              {
                title: 'Decline',
                pressAction: { id: 'end' },
              },
              {
                title: 'Answer',
                pressAction: { id: 'answer' },
              },
            ],
          },
        });
      },
    );

    this.isInitialized = true;
  }

  async setup() {
    try {
      const options = {
        ios: {
          appName: '8 Market Days',
          supportsVideo: true,
        },
        android: {
          alertTitle: 'Permissions required',
          alertDescription:
            'This application needs to access your phone account',
          cancelButton: 'Cancel',
          okButton: 'OK',
          additionalPermissions: [
            'android.permission.READ_PHONE_STATE',
            'android.permission.RECORD_AUDIO',
          ],
          selfManaged: true,
          foregroundService: {
            channelId: 'com.marketdays',
            channelName: 'Call Service',
            notificationTitle: 'Incoming call...',
            notificationIcon: 'ic_notification',
          },
        },
      };

      if (isIOS) {
        await request(PERMISSIONS.IOS.MICROPHONE);
        await request(PERMISSIONS.IOS.CAMERA);
      } else {
        await requestMultiple([
          PERMISSIONS.ANDROID.RECORD_AUDIO,
          PERMISSIONS.ANDROID.CAMERA,
          PERMISSIONS.ANDROID.READ_PHONE_STATE,
          PERMISSIONS.ANDROID.READ_CALL_LOG,
          PERMISSIONS.ANDROID.READ_PHONE_NUMBERS,
        ]);
      }

      await RNCallKeep.setup(options);
      await new Promise<void>(resolve => setTimeout(() => resolve(), 1200));
      const phoneAccountEnabled = await RNCallKeep.checkPhoneAccountEnabled();
      if (!phoneAccountEnabled) RNCallKeep.registerPhoneAccount(options);
      RNCallKeep.setAvailable(true);

      // Initialize event listeners
      await this.init();
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
        'number',
        true,
      );

      this.startRingtone();
    } catch (error) {
      console.log('Call UI error:', error);
    }
  }

  startRingtone() {
    InCallManager.startRingtone('_BUNDLE_', 4, '', 30);
    InCallManager.start({
      media: 'audio',
      auto: true,
      ringback: '',
    });
  }

  stopRingtone() {
    InCallManager.stopRingtone();
    InCallManager.stop();
  }

  startCall({ callId, calleeName }: StartCallPayload) {
    RNCallKeep.startCall(callId, calleeName, calleeName, 'number', true);
  }

  endCall(callId: string) {
    this.stopRingtone();
    RNCallKeep.endCall(callId);
    call.endCall(callId);
  }

  setActiveCall(callId: string) {
    RNCallKeep.setCurrentCallActive(callId);
  }

  // FIXED: Store callbacks and handle them in the existing listener
  private answerCallback: ((callId: string) => void) | null = null;
  private endCallback: ((callId: string) => void) | null = null;

  onAnswer(callback: (callId: string) => void) {
    // Store the callback instead of adding new listeners
    this.answerCallback = callback;

    // Only add the main listener once
    if (!this.answerCallbackAdded) {
      RNCallKeep.addEventListener('answerCall', ({ callUUID }) => {
        this.stopRingtone();
        if (this.answerCallback) {
          this.answerCallback(callUUID);
        }
        RNCallKeep.setCurrentCallActive(callUUID);
      });
      this.answerCallbackAdded = true;
    }
  }

  onEnd(callback: (callId: string) => void) {
    // Store the callback instead of adding new listeners
    this.endCallback = callback;

    // Only add the main listener once
    if (!this.endCallbackAdded) {
      RNCallKeep.addEventListener('endCall', ({ callUUID }) => {
        this.stopRingtone();
        notification.cancelNotification(callUUID);
        if (this.endCallback) {
          this.endCallback(callUUID);
        }
      });
      this.endCallbackAdded = true;
    }
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
