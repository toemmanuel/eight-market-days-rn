import { getApp } from '@react-native-firebase/app';
import { getMessaging } from '@react-native-firebase/messaging';

export const firebaseApp = getApp();
export const messaging = getMessaging(firebaseApp);
