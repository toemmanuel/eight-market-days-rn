import { PermissionsAndroid, Platform } from 'react-native';
import {
  FirebaseMessagingTypes,
  getToken,
  isDeviceRegisteredForRemoteMessages,
  registerDeviceForRemoteMessages,
  requestPermission,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import DeviceInfo from 'react-native-device-info';
import { messaging } from './firebase';
import { IIncomingCallData } from '../types';
import { callKeep } from './call';

class Notification {
  private appName = '8 Market Days';
  navigate: any = null;

  constructor() {}

  async requestPermission() {
    try {
      // 🔹 Android permissions
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('🔕 Android notification permission denied');
          return null;
        }
      }

      // 🔹 iOS permissions
      if (Platform.OS === 'ios') {
        const authStatus = await requestPermission(messaging);

        const enabled = authStatus === 1 || authStatus === 2;

        if (!enabled) {
          console.log('🔕 iOS notification permission denied');
          return null;
        }

        // Ensure APNs registration before FCM token
        if (!isDeviceRegisteredForRemoteMessages(messaging)) {
          await registerDeviceForRemoteMessages(messaging);
        }
      }

      const fcmToken = await getToken(messaging);
      if (fcmToken) {
        console.log('✅ FCM Token:', fcmToken);
        return fcmToken;
      }

      console.log('⚠️ FCM token not available yet');
      return null;
    } catch (error) {
      console.error('❌ Notification_Error:', error);
      return null;
    }
  }

  async createChannelId(importance = AndroidImportance.DEFAULT) {
    return await notifee.createChannel({
      id: 'default',
      name: this.appName,
    });
  }

  async cancelNotification(notificationId: string) {
    await notifee.cancelNotification(notificationId);
  }

  async displayNotification(title: string, body: string, data?: any) {}

  async onMessage(remoteMessage: FirebaseMessagingTypes.RemoteMessage) {
    const { data } = remoteMessage;

    console.log('Notification::', remoteMessage);

    const isInComingCall = (data as any).type === 'incoming_call';

    let bundleId = DeviceInfo.getBundleId();

    const channelId = await notifee.createChannel({
      id: 'default',
      name: '8 Market Days',
    });

    if (isInComingCall) {
      const notificationData = data as any as IIncomingCallData;

      callKeep.displayIncomingCall(
        notificationData.callId,
        notificationData.callerName,
      );

      return;
    }

    // if (remoteMessage.notification) {
    //   const title = remoteMessage.notification.title;
    //   const body = remoteMessage.notification.body;

    //   // Display a notification
    //   await notifee.displayNotification({
    //     id: messageId,
    //     title,
    //     body,
    //     data: data || {},
    //     android: {
    //       channelId,
    //       smallIcon: 'ic_notification',
    //       pressAction: {
    //         id: 'default',
    //         launchActivity: bundleId,
    //       },
    //       color: 'green',
    //     },
    //   });
    // }
  }
}

export const notification = new Notification();

class ForegroundService {
  private static instance: ForegroundService;
  private isRunning = false;

  static getInstance(): ForegroundService {
    if (!ForegroundService.instance) {
      ForegroundService.instance = new ForegroundService();
    }
    return ForegroundService.instance;
  }

  async start() {
    if (this.isRunning) return;

    // Register the foreground service
    notifee.registerForegroundService(async notification => {
      console.log('Foreground service started');

      // Return a promise to keep the service alive
      return new Promise(() => {
        // This promise never resolves, keeping the service alive
      });
    });

    // Create a persistent notification for the foreground service
    await notifee.displayNotification({
      id: 'foreground_service',
      title: 'Call Service Active',
      body: 'Ready to receive calls',
      android: {
        channelId: 'call_service',
        asForegroundService: true,
        importance: AndroidImportance.LOW,
        ongoing: true,
        autoCancel: false,
      },
    });

    this.isRunning = true;
    console.log('Foreground service registered successfully');
  }

  async stop() {
    if (!this.isRunning) return;

    await notifee.stopForegroundService();
    await notifee.cancelNotification('foreground_service');
    this.isRunning = false;
  }
}

export const foregroundService = ForegroundService.getInstance();
