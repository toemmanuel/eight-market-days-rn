import RNCallKeep from 'react-native-callkeep';
import InCallManager from 'react-native-incall-manager';
import {
  createNavigationContainerRef,
  NavigationProp,
} from '@react-navigation/native';
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
import { webRtc } from './web-rtc';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  EventType,
} from '@notifee/react-native';
import DeviceInfo from 'react-native-device-info';

const isIOS = Platform.OS === 'ios';

class CallKeep {
  private static instance: CallKeep;
  private isInitialized = false;
  private answerCallback: ((callId: string) => void) | null = null;
  private endCallback: ((callId: string, reason: string) => void) | null = null;

  private channelId: string | null = null;

  navigation: Omit<
    NavigationProp<ReactNavigation.RootParamList>,
    'getState'
  > | null = null;

  currentRoute: string | undefined = undefined;

  private notificationIdMap = new Map<string, string>();
  private activeCalls = new Map<
    string,
    {
      isRinging: boolean;
      startTime: number;
    }
  >();

  private constructor() {}

  static getInstance(): CallKeep {
    if (!CallKeep.instance) {
      CallKeep.instance = new CallKeep();
    }
    return CallKeep.instance;
  }

  async init() {
    if (this.isInitialized) return;

    // Create notification channel
    this.channelId = await notifee.createChannel({
      id: 'calls',
      name: 'Incoming Calls',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
      lights: true,
      bypassDnd: true,
    });

    await this.setupForegroundService();

    // Setup notification action handlers
    await this.setupNotificationHandlers();

    // Setup CallKeep event listeners (ONCE)
    RNCallKeep.addEventListener(
      'showIncomingCallUi',
      this.handleShowIncomingUI,
    );
    RNCallKeep.addEventListener(
      'createIncomingConnectionFailed',
      this.handleConnectionFailed,
    );

    RNCallKeep.addEventListener('answerCall', this.handleAnswerCall);
    RNCallKeep.addEventListener('endCall', this.handleEndCall);

    this.isInitialized = true;
  }

  async setupForegroundService() {
    try {
      // Create channel for foreground service
      await notifee.createChannel({
        id: 'call_service',
        name: 'Call Service',
        importance: AndroidImportance.LOW,
      });

      // Register foreground service
      notifee.registerForegroundService(async notification => {
        console.log('Foreground service is running');
        // Keep service alive
        return new Promise(() => {});
      });

      // Display persistent notification
      await notifee.displayNotification({
        id: 'foreground_service',
        title: 'Call Service',
        body: 'Ready for calls',
        android: {
          channelId: 'call_service',
          asForegroundService: true,
          importance: AndroidImportance.LOW,
          ongoing: true,
          autoCancel: false,
        },
      });

      console.log('Foreground service setup complete');
    } catch (error) {
      console.error('Failed to setup foreground service:', error);
    }
  }

  private setupNotificationHandlers = async () => {
    // Foreground event handler
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        this.handleNotificationAction(detail);
      }
    });

    // Background event handler
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.ACTION_PRESS) {
        await this.handleNotificationAction(detail);
      }
    });
  };

  handleNotificationAction = async (detail: any) => {
    const { pressAction, notification } = detail;

    const callUUID = notification?.data?.callUUID;
    const notifeeId = notification?.id;

    if (!callUUID) return;

    this.notificationIdMap.delete(callUUID);

    if (notifeeId) await notifee.cancelNotification(notifeeId);

    if (pressAction?.id === 'answer') {
      RNCallKeep.setCurrentCallActive(callUUID);
      RNCallKeep.answerIncomingCall(callUUID);
    }

    if (pressAction?.id === 'decline') {
      RNCallKeep.endCall(callUUID);
    }
  };

  cancelIncomingCall(callId: string) {
    const call = this.activeCalls.get(callId);
    if (!call) return;

    this.stopRingtone();
    this.cancelNotification(callId);
    RNCallKeep.endCall(callId);
    this.activeCalls.delete(callId);
  }

  private handleShowIncomingUI = async ({ handle, callUUID, name }: any) => {
    this.cancelNotification(callUUID);

    await new Promise(resolve => setTimeout(() => resolve(undefined), 100));

    let bundleId = DeviceInfo.getBundleId();

    const generatedId = await notifee.displayNotification({
      title: 'Incoming Call',
      body: name || handle,
      data: {
        callUUID,
        callId: callUUID,
        handle,
        callerName: name || handle,
      },
      android: {
        channelId: this.channelId || 'calls',
        smallIcon: 'ic_notification',
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.CALL,
        fullScreenAction: { id: 'fullscreen' },
        pressAction: { id: 'default' },
        autoCancel: false,
        color: '#4CAF50',
        actions: [
          {
            title: 'Decline',
            pressAction: { id: 'decline', launchActivity: 'default' },
          },
          {
            title: 'Answer',
            pressAction: { id: 'answer', launchActivity: 'default' },
          },
        ],
      },
      ios: {
        categoryId: 'call',
        critical: true,
        sound: 'ringtone.caf',
      },
    });

    this.notificationIdMap.set(callUUID, generatedId);
  };

  private cancelNotification(callUUID: string) {
    const notifeeId = this.notificationIdMap.get(callUUID);
    if (notifeeId) {
      notifee.cancelNotification(notifeeId);
      this.notificationIdMap.delete(callUUID);
    }
  }

  private handleConnectionFailed = ({ callUUID, error }: any) => {
    console.error('Connection failed:', callUUID, error);
    this.stopRingtone();
    if (callUUID) {
      this.cancelNotification(callUUID);
    }
  };

  private handleAnswerCall = ({ callUUID }: { callUUID: string }) => {
    this.stopRingtone();

    this.cancelNotification(callUUID);

    const call = this.activeCalls.get(callUUID);
    if (call) {
      call.isRinging = false;
      this.activeCalls.set(callUUID, call);
    }

    RNCallKeep.setCurrentCallActive(callUUID);
    this.answerCallback?.(callUUID);
  };

  private handleEndCall = ({ callUUID }: { callUUID: string }) => {
    this.stopRingtone();
    this.cancelNotification(callUUID);
    this.endCallback?.(callUUID, 'ended');

    const call = this.activeCalls.get(callUUID);
    if (call) {
      this.activeCalls.delete(callUUID);
    }
  };

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
      if (!phoneAccountEnabled) {
        RNCallKeep.registerPhoneAccount(options);
      }

      RNCallKeep.setAvailable(true);
      await this.init();
    } catch (error) {
      console.error('Setup error:', (error as any).message);
    }
  }

  async displayIncomingCall(callId: string, callerName: string) {
    if (!callId || !callerName) return;

    try {
      this.activeCalls.set(callId, {
        isRinging: true,
        startTime: Date.now(),
      });

      // this.cancelNotification(callId);

      RNCallKeep.displayIncomingCall(
        callId,
        callerName,
        callerName,
        'number',
        true,
      );
      InCallManager.startRingtone('_BUNDLE_', 4, '', 30);

      this.timeoutCall(callId);
    } catch (error) {
      console.log('Display call error:', error);
    }
  }

  timeoutCall(callId: string) {
    setTimeout(() => {
      if (this.activeCalls.get(callId)?.isRinging) {
        console.log('Call timeout, cancelling:', callId);
        this.cancelIncomingCall(callId);
      }
    }, 30000);
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
    this.cancelNotification(callId);
  }

  setActiveCall(callId: string) {
    RNCallKeep.setCurrentCallActive(callId);
  }

  onAnswer(callback: (callId: string) => void) {
    this.answerCallback = callback;
  }

  onEnd(callback: (callId: string, reason: string) => void) {
    this.endCallback = callback;
  }
}

export const callKeep = CallKeep.getInstance();

class Call {
  private ready = false;
  navigationRef = createNavigationContainerRef();
  private callData: IIncomingCallData | null = null;

  async init() {
    await callKeep.setup();
    this.ready = true;

    // Set callbacks instead of adding listeners
    callKeep.onAnswer(callId => {
      this.acceptCall(callId);
      webRtc.startCall(callId, this.callData?.calleeId || '');
    });

    callKeep.onEnd((callId, reason = 'ended') => {
      this.endCall(callId, reason);
    });

    // Setup socket listener
    socket.onIncomingCall(data => {
      if (!this.ready) return;
      this.callData = data;
      callKeep.displayIncomingCall(data.callId, data.callerName);
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

  endCall(callId: string, reason: string = 'ended') {
    console.log('Ending call with ID:', callId, 'Reason:', reason);
    socket?.endCall(callId, reason);
    webRtc.endCall(callId);
    callKeep.endCall(callId);
  }

  setActiveCall(callId: string) {
    callKeep.setActiveCall(callId);
  }
}

export const call = new Call();
