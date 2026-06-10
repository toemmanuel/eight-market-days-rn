import { View, AppState, StyleSheet } from 'react-native';
import React, { useEffect } from 'react';
import { call, callKeep, socket } from '../libs';
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
    userName: incomingCall.calleeName,
  };

  const id = callData?.callId;

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      socket.connect(id);
    }
  });

  const onEndCall = () => {
    call.endCall(callData?.callId as string);
    goBack();
  };

  useEffect(() => {
    callKeep.currentRoute = 'Caller';
    socket.currentRoute = 'Caller';
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
      <CallView type="caller" callData={callData} />
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
