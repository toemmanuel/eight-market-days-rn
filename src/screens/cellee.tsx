import {
  View,
  Text,
  TouchableOpacity,
  AppState,
  StyleSheet,
} from 'react-native';
import React, { useEffect } from 'react';
import { call, callKeep, socket, webRtc } from '../libs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CallType, ICall, IIncomingCallData } from '../types';
import { AudioCallView } from '../components';

export default function CallScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { goBack } = useNavigation();
  const { params } = useRoute();

  const incomingCall = params as any as IIncomingCallData;
  const callType = incomingCall?.callType as CallType;

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
          paddingTop: safeAreaInsets.top,
          paddingBottom: safeAreaInsets.bottom,
        },
      ]}
    >
      {callType === 'audio' && (
        <AudioCallView type="callee" callData={callData} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingLeft: 15,
    paddingRight: 15,
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  endCall: {
    height: 60,
    width: 60,
    backgroundColor: 'red',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
