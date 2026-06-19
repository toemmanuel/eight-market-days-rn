/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { call, callKeep, notification, socket } from './libs';
import {
  createNavigationContainerRef,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { RootNavigator } from './navigator';

const linking = {
  prefixes: ['eightmarkeydays://'],
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  const navigationRef = createNavigationContainerRef();

  return (
    <NavigationContainer linking={linking} ref={navigationRef}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <AppContent />
      </SafeAreaProvider>
    </NavigationContainer>
  );
}

function AppContent() {
  const navigation = useNavigation();
  const requestNotificationAndStoreToken = async () => {
    try {
      const fcmToken = await notification.requestPermission();
      if (fcmToken) {
        console.log('FCM TOKEN::', fcmToken);
      }
    } catch (error) {}
  };

  useEffect(() => {
    socket.navigation = navigation;
    callKeep.navigation = navigation as any;
    setTimeout(async () => {
      await call.init();
      await requestNotificationAndStoreToken();
    }, 1000);
  }, []);

  return <RootNavigator />;
}

export default App;
