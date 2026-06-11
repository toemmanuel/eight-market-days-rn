import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InitScreen, CallScreen } from '../screens';

const { Screen, Navigator } = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Screen name="Init" component={InitScreen} />
      <Screen name="Call" component={CallScreen} />
    </Navigator>
  );
}
