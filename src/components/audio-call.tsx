import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import React from 'react';
import {
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VideoIcon,
  PhoneIcon,
} from 'lucide-react-native';
import { ICall } from '../types';
import { call } from '../libs';

interface AudioCallViewProps {
  type: 'caller' | 'callee';
  callData: ICall;
}

export default function AudioCallView({ type, callData }: AudioCallViewProps) {
  const onEndCall = () => {
    call.endCall(callData?.callId as string);
  };
  return (
    <View style={styles.container}>
      <View style={styles.userCallDetailsView}>
        <Text>Calling...</Text>
        <Text style={styles.largeText}>{callData.userName ?? 'Unknown'}</Text>
      </View>
      <View>
        <View style={styles.ctaTopView}>
          <View style={styles.ctaTopButtonView}>
            <TouchableOpacity style={styles.ctaTopButton}>
              <Volume2Icon />
            </TouchableOpacity>
            <Text style={styles.smallText}>Mute</Text>
          </View>
          <View style={styles.ctaTopButtonView}>
            <TouchableOpacity style={styles.ctaTopButton}>
              <VideoIcon />
            </TouchableOpacity>
            <Text style={styles.smallText}>Mute</Text>
          </View>
          <View style={styles.ctaTopButtonView}>
            <TouchableOpacity style={styles.ctaTopButton}>
              <MicIcon />
            </TouchableOpacity>
            <Text style={styles.smallText}>Mute</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onEndCall} style={styles.ctaEndCallButton}>
          <View style={{ transform: [{ rotateZ: '135deg' }] }}>
            <PhoneIcon fill={'white'} color={'#da2f25'} size={32} />
          </View>
        </TouchableOpacity>
      </View>
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
  },

  userCallDetailsView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10,
  },

  ctaView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10,
  },

  ctaTopView: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 25,
  },

  ctaTopButtonView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 5,
    flex: 1,
    // width: '100%',
    // maxWidth: 120,
  },

  ctaTopButton: {
    height: 65,
    width: '100%',
    backgroundColor: 'white',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  largeText: {
    fontSize: 40,
    textAlign: 'center',
  },

  smallText: {
    fontSize: 12,
  },

  ctaEndCallButton: {
    height: 65,
    width: '100%',
    maxWidth: 240,
    backgroundColor: '#da2f25',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },

  ctaEndCallButtonText: {
    color: '#ffffff',
  },
});
