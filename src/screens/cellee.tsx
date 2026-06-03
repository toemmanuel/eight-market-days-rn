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
import { IIncomingCallData } from '../types';

export default function CallScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { goBack } = useNavigation();
  const { params } = useRoute();

  const callData = params as any as IIncomingCallData;

  const calleeId = callData?.calleeId;

  AppState.addEventListener('change', state => {
    if (state === 'active') {
      socket.connect(calleeId);
    }
  });

  const onEndCall = () => {
    console.log('Ending call with id:', callData?.callId);
    call.endCall(callData?.callId as string);
    goBack();
  };

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
      <Text>In Call...</Text>
      <TouchableOpacity onPress={onEndCall} style={styles.endCall}>
        <Text>End Call</Text>
      </TouchableOpacity>
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
