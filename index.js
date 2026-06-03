/**
 * @format
 */

import { AppRegistry } from 'react-native';
import { App } from './src';
import { name as appName } from './app.json';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  onMessage,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import notifee, { EventType } from '@notifee/react-native';
import { callKeep, notification } from './src/libs';

const firebaseApp = getApp();
const messaging = getMessaging(firebaseApp);

onMessage(messaging, notification.onMessage);

// notifee.onBackgroundEvent(async ({ type, detail }) => {
//   const { notification, data } = detail;

//   if (type === EventType.ACTION_PRESS) {
//     // Remove the notification
//     await notifee.cancelNotification(notification.id);
//   }
// });

setBackgroundMessageHandler(messaging, notification.onMessage);

// setBackgroundMessageHandler(messaging, async remoteMessage => {
//   const { notification, data, messageId } = remoteMessage;
//   const isInComingCall = data.type === 'incoming_call';

//   if (isInComingCall) {
//     callKeep.displayIncomingCall(data.callerId, data.callerName);

//     return;
//   }
// });

AppRegistry.registerComponent(appName, () => App);
