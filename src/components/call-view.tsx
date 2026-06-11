import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  MicIcon,
  MicOffIcon,
  Volume2Icon,
  VideoIcon,
  PhoneIcon,
  VolumeXIcon,
  VideoOffIcon,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { RTCView } from 'react-native-webrtc';
import { CallState, CallType, ICall } from '../types';
import { call, socket, webRtc } from '../libs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CallViewProps {
  user: 'caller' | 'callee';
  callData: ICall;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
};

export default function CallView({ user, callData }: CallViewProps) {
  const callType = callData?.callType as CallType;

  const { goBack, canGoBack } = useNavigation();

  const safeAreaInsets = useSafeAreaInsets();

  const hasSwitchToVideoRef = useRef<boolean>(false);

  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(
    callType === 'video',
  );
  const [connectionStatus, setConnectionStatus] =
    useState<CallState>('calling');

  const [localStream, setLocalStream] = React.useState<MediaStream | null>(
    null,
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const isCallActive = connectionStatus === 'connected';

  const onEndCall = () => {
    call.endCall(callData?.callId as string);

    if (canGoBack()) {
      goBack();
    }
  };

  useEffect(() => {
    if (connectionStatus === 'connected') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor(
            (Date.now() - startTimeRef.current) / 1000,
          );
          setCallDuration(elapsed);
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      startTimeRef.current = null;

      if (connectionStatus === 'ended' || connectionStatus === 'failed') {
        setCallDuration(0);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connectionStatus]);

  useEffect(() => {
    const unsubscribeConnection = webRtc.onCallStateChange(connectionState => {
      setConnectionStatus(connectionState);
    });

    const unsubscribeRemote = webRtc.onRemoteStreamChange(stream => {
      setRemoteStream(stream);
    });

    const unsubscribeLocal = webRtc.onLocalStreamChange(stream => {
      if (stream) {
        setLocalStream(stream);
      }
    });

    const unsubscribeMic = webRtc.onMicrophoneStateChange?.(enabled => {
      setIsMuted(enabled);
    });

    const unsubscribeCamera = webRtc.onCameraStateChange?.(toggle => {
      setIsVideoEnabled(toggle);
    });

    const unsubscribeSpeaker = webRtc.onSpeakerChange?.(enabled => {
      setIsSpeakerOn(enabled);
    });

    const unsubscribeVideoCallRequest = socket.onRequestVideoCall(() => {
      Alert.alert(
        'Video Call Request',
        'The other person wants to switch to video call. Accept?',
        [
          {
            text: 'Decline',
            style: 'cancel',
            onPress: () => {
              hasSwitchToVideoRef.current = true;
            },
          },
          {
            text: 'Accept',
            onPress: () => {
              hasSwitchToVideoRef.current = true;
              webRtc.toggleCamera(true);
            },
          },
        ],
      );
    });

    return () => {
      unsubscribeConnection();
      unsubscribeRemote();
      unsubscribeLocal();

      unsubscribeMic?.();
      unsubscribeCamera?.();
      unsubscribeSpeaker?.();

      unsubscribeVideoCallRequest?.();
    };
  }, []);

  const getStatusText = (): string => {
    switch (connectionStatus) {
      case 'calling':
        return user === 'caller' ? 'Calling...' : 'connecting...';
      case 'ringing':
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'failed':
        return 'Call failed';
      case 'ended':
        return 'Call ended';
      default:
        return connectionStatus;
    }
  };

  const onSwitchToVideo = () => {
    if (!hasSwitchToVideoRef.current) {
      const to = user === 'caller' ? callData?.calleeId : callData?.callerId;
      socket.requestVideoCall(callData?.callId, to);

      hasSwitchToVideoRef.current = true;
    }

    webRtc.toggleCamera(!isVideoEnabled);
  };

  const onToggleMicrophone = () => {
    const microphoneState = webRtc.getMicrophoneState();
    console.log('microphoneState', microphoneState);
    webRtc.toggleMicrophone(!microphoneState);
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.userCallDetailsView,
          { marginTop: safeAreaInsets.top + 20 },
        ]}
      >
        {!isVideoEnabled && (
          <Text style={styles.largeText}>{callData.userName ?? 'Unknown'}</Text>
        )}
        {!isCallActive && (
          <Text style={styles.statusText}>{getStatusText()}</Text>
        )}
        {isCallActive && (
          <Text style={styles.timerText}>{getStatusText()}</Text>
        )}
      </View>

      <View style={styles.videoContainer}>
        {isVideoEnabled && (
          <>
            {/* REMOTE (main screen) */}
            {remoteStream && (
              <RTCView
                streamURL={remoteStream?.toURL()}
                style={styles.remoteVideo}
                objectFit="cover"
              />
            )}

            {/* LOCAL (small preview) */}
            {localStream && (
              <RTCView
                mirror
                streamURL={localStream?.toURL()}
                style={[
                  styles.localVideo,
                  {
                    marginBottom: safeAreaInsets.bottom + 90,
                  },
                ]}
                objectFit="cover"
              />
            )}
          </>
        )}
      </View>

      {isVideoEnabled ? (
        <View
          style={{
            marginBottom: safeAreaInsets.bottom + 20,
            paddingHorizontal: 20,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
          }}
        >
          <TouchableOpacity
            onPress={() => webRtc.toggleSpeaker(!isSpeakerOn)}
            style={[styles.ctaTopButton]}
          >
            {isSpeakerOn ? (
              <Volume2Icon size={24} color="#000" />
            ) : (
              <VolumeXIcon size={24} color="#000" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onSwitchToVideo}
            style={[styles.ctaTopButton]}
          >
            {isVideoEnabled ? (
              <VideoIcon size={24} color="#000" />
            ) : (
              <VideoOffIcon size={24} color="#000" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onToggleMicrophone}
            style={[styles.ctaTopButton]}
          >
            {isMuted ? (
              <MicOffIcon size={24} color="#000" />
            ) : (
              <MicIcon size={24} color="#000" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onEndCall}
            style={{
              ...styles.ctaTopButton,
              backgroundColor: '#da2f25',
            }}
          >
            <View style={{ transform: [{ rotateZ: '135deg' }] }}>
              <PhoneIcon fill={'white'} color={'#da2f25'} size={32} />
            </View>
          </TouchableOpacity>
        </View>
      ) : (
        <View
          style={{
            marginBottom: safeAreaInsets.bottom + 20,
            paddingHorizontal: 20,
          }}
        >
          <View style={styles.ctaTopView}>
            <View style={styles.ctaTopButtonView}>
              <TouchableOpacity
                onPress={() => webRtc.toggleSpeaker(!isSpeakerOn)}
                style={[styles.ctaTopButton, { width: '100%' }]}
              >
                {isSpeakerOn ? (
                  <Volume2Icon size={24} color="#000" />
                ) : (
                  <VolumeXIcon size={24} color="#000" />
                )}
              </TouchableOpacity>
              <Text style={styles.smallText}>Speaker</Text>
            </View>
            <View style={styles.ctaTopButtonView}>
              <TouchableOpacity
                onPress={onSwitchToVideo}
                style={[styles.ctaTopButton, { width: '100%' }]}
              >
                {isVideoEnabled ? (
                  <VideoIcon size={24} color="#000" />
                ) : (
                  <VideoOffIcon size={24} color="#000" />
                )}
              </TouchableOpacity>
              <Text style={styles.smallText}>video</Text>
            </View>
            <View style={styles.ctaTopButtonView}>
              <TouchableOpacity
                onPress={onToggleMicrophone}
                style={[styles.ctaTopButton, { width: '100%' }]}
              >
                {isMuted ? (
                  <MicOffIcon size={24} color="#000" />
                ) : (
                  <MicIcon size={24} color="#000" />
                )}
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // paddingLeft: 15,
    // paddingRight: 15,
    flexDirection: 'column',
    justifyContent: 'space-between',
    gap: 20,
  },

  videoContainer: {
    // flex: 1,
    position: 'absolute',
    height: '100%',
    width: '100%',
  },

  remoteVideo: {
    flex: 1,
  },

  localVideo: {
    width: 140,
    height: 180,
    position: 'absolute',
    bottom: 15,
    right: 15,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },

  userCallDetailsView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10,
    zIndex: 10,
  },

  ctaView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10,
  },

  ctaTopView: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 14,
    marginBottom: 20,
  },

  ctaTopButtonView: {
    alignItems: 'center',
    flexDirection: 'column',
    gap: 5,
    flex: 1,
    // width: '100%',
    maxWidth: 100,
  },

  ctaTopButton: {
    height: 65,
    width: 75,
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
    maxWidth: 220,
    backgroundColor: '#da2f25',
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },

  ctaEndCallButtonText: {
    color: '#ffffff',
  },

  statusText: {
    fontSize: 16,
    textAlign: 'center',
  },

  timerText: {
    fontSize: 14,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
