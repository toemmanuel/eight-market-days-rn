import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CalleeScreen, CallerScreen, InitScreen } from '../screens';

const { Screen, Navigator } = createNativeStackNavigator();

export default function RootNavigator() {
  return (
    <Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Screen name="Init" component={InitScreen} />
      <Screen name="Callee" component={CalleeScreen} />
      <Screen name="Caller" component={CallerScreen} />
    </Navigator>
  );
}
