import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VideoIcon,
  PhoneIcon,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { RTCView } from 'react-native-webrtc';
import { CallType, ICall } from '../types';
import { call, webRtc } from '../libs';

interface CallViewProps {
  type: 'caller' | 'callee';
  callData: ICall;
}

export default function CallView({ type, callData }: CallViewProps) {
  const callType = callData?.callType as CallType;

  const { goBack, canGoBack } = useNavigation();

  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting');

  const [localStream, setLocalStream] = React.useState<MediaStream | null>(
    null,
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [networkQuality, setNetworkQuality] = useState<'good' | 'poor' | 'bad'>(
    'good',
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  const onEndCall = () => {
    call.endCall(callData?.callId as string);

    if (canGoBack()) {
      goBack();
    }
  };

  // React.useEffect(() => {
  //   const remoteStreamData = webRtc.getRemoteStream();
  //   if (remoteStreamData) setRemoteStream(remoteStreamData);
  //   const stream = webRtc.getLocalStream();
  //   setLocalStream(stream);
  // }, []);

  return (
    <View style={styles.container}>
      {type === 'caller' && (
        <View style={styles.userCallDetailsView}>
          <Text>Calling...</Text>
          <Text style={styles.largeText}>{callData.userName ?? 'Unknown'}</Text>
        </View>
      )}
      <View>
        <>
          {/* REMOTE (main screen) */}
          {remoteStream && (
            <RTCView
              streamURL={remoteStream?.toURL()}
              style={{ flex: 1 }}
              objectFit="cover"
            />
          )}

          {/* LOCAL (small preview) */}
          {localStream && (
            <RTCView
              streamURL={localStream?.toURL()}
              style={{
                width: 120,
                height: 160,
                position: 'absolute',
                top: 40,
                right: 20,
                borderRadius: 10,
              }}
              objectFit="cover"
            />
          )}
        </>
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
