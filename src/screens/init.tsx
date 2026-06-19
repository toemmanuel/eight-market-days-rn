import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import React, { useState } from 'react';
import uuid from 'react-native-uuid';
import { call, socket } from '../libs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function InitScreen() {
  const safeAreaInsets = useSafeAreaInsets();

  const [userId, setUserId] = useState<string>('');

  const onConnectUser = () => {
    socket.connect(userId);
  };

  const onMakeCall = () => {
    call.initiateCall({
      callId: uuid.v4(),
      callerId: '123456',
      calleeId: '776654',
      calleeName: 'Recipient',
      callType: 'audio',
    });
  };

  return (
    <View style={[styles.container, { paddingTop: safeAreaInsets.top }]}>
      <Text>9 Market Days</Text>
      <View>
        <Text>User ID</Text>
        <TextInput
          style={styles.textInput}
          value={userId}
          onChangeText={text => setUserId(text)}
          placeholder="Enter user ID"
        />
        <TouchableOpacity
          onPress={onConnectUser}
          hitSlop={{
            top: 10,
            right: 10,
            bottom: 10,
            left: 10,
          }}
        >
          <Text>Connect</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 30 }} />
      <TouchableOpacity
        hitSlop={{
          top: 10,
          right: 10,
          bottom: 10,
          left: 10,
        }}
        onPress={onMakeCall}
      >
        <Text>Call</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 15,
    backgroundColor: 'white',
  },
  textInput: {
    borderWidth: 0.5,
  },
});
