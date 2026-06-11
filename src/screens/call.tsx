import { View, AppState, StyleSheet } from 'react-native';
import React, { useEffect } from 'react';
import { callKeep, socket } from '../libs';
import { NavigationRoute, useRoute } from '@react-navigation/native';
import { ICall, NavigationParams } from '../types';
import { CallView } from '../components';

type CallScreenRoute = NavigationRoute<NavigationParams, 'Call'>;

export default function CallScreen() {
  const { params } = useRoute<CallScreenRoute>();

  const paramsCall = params.call;
  const user = params.user as 'caller' | 'callee';

  const callData: ICall = {
    ...paramsCall,
    userName: user === 'caller' ? paramsCall.calleeName : paramsCall.callerName,
  };

  const id = paramsCall?.callId;

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      socket.connect(id);
    }
  });

  useEffect(() => {
    callKeep.currentRoute = 'Caller';
    socket.currentRoute = 'Caller';
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          // paddingTop: safeAreaInsets.top + 20,
          // paddingBottom: safeAreaInsets.bottom + 20,
        },
      ]}
    >
      <CallView user={user} callData={callData} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // paddingLeft: 15,
    // paddingRight: 15,
  },
});
