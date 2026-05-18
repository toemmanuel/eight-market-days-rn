/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { call, notification, socket } from './libs';
import {
  createNavigationContainerRef,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { RootNavigator } from './navigator';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const navigationRef = createNavigationContainerRef();

  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS) {
      const { pressAction, notification } = detail;
      const data = notification?.data;

      console.log('Data::', data);
      console.log('Notification::', notification);

      if (pressAction?.id === 'answer') {
        socket.acceptCall({ callId: data?.callId as string });

        // open call screen
        navigationRef.navigate('Callee', {
          callData: data,
        });

        notifee.cancelNotification(notification?.id as string);
      }

      if (pressAction?.id === 'decline') {
        console.log('Call declined');

        socket.endCall(data?.callId as string);

        notifee.cancelNotification(notification?.id as string);
      }
    }
  });

  return (
    <NavigationContainer ref={navigationRef}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppContent />
      </SafeAreaProvider>
    </NavigationContainer>
  );
}

function AppContent() {
  const { navigate } = useNavigation();
  const requestNotificationAndStoreToken = async () => {
    try {
      const fcmToken = await notification.requestPermission();
      if (fcmToken) {
        console.log('FCM TOKEN::', fcmToken);
      }
    } catch (error) {}
  };

  useEffect(() => {
    socket.navigate = navigate as any;
    setTimeout(async () => {
      call.init();
      await requestNotificationAndStoreToken();
    }, 1000);
  }, []);

  return <RootNavigator />;
}

export default App;
