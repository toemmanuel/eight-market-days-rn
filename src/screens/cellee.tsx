import { View, AppState, StyleSheet } from 'react-native';
import React, { useEffect } from 'react';
import { callKeep, socket } from '../libs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CallType, ICall, IIncomingCallData } from '../types';
import { CallView } from '../components';

export default function CallScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { goBack } = useNavigation();
  const { params } = useRoute();

  const incomingCall = params as any as IIncomingCallData;

  const callData: ICall = {
    ...incomingCall,
    userName: incomingCall.callerName,
  };

  const calleeId = callData?.calleeId;

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      socket.connect(calleeId);
    }
  });

  useEffect(() => {
    callKeep.currentRoute = 'Callee';
    socket.currentRoute = 'Callee';
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: safeAreaInsets.top + 20,
          paddingBottom: safeAreaInsets.bottom + 20,
        },
      ]}
    >
      <CallView type="callee" callData={callData} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingLeft: 15,
    paddingRight: 15,
  },
});
