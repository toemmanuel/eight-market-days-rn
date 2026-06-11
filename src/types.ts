export interface InitiateCallPayload {
  callId: string;

  callerId: string;

  calleeId: string;

  calleeName: string;

  callType: 'audio' | 'video';
}

export type CallType = 'audio' | 'video';

export interface AcceptCallPayload {
  callId: string;

  userId: string;

  callerId: string;

  calleeId: string;
}

export interface StartCallPayload {
  callId: string;

  calleeName: string;
}

export interface IIncomingCallData {
  type: 'incoming_call';

  callId: string;

  roomId: string;

  callerId: string;

  calleeId: string;

  callerName: string;

  calleeName: string;

  callType: string;

  timestamp: string;
}

export interface ICall extends IIncomingCallData {
  userName: string;
}

export interface WebRTCSignalPayload {
  to: string; // Recipient

  from: string; // Sender - ADD THIS

  callId: string;

  type: 'offer' | 'answer' | 'candidate';

  sdp?: any;

  candidate?: any;
}

export enum CALL_STATE {
  IDLE = 'idle',
  CALLING = 'calling',
  RINGING = 'ringing',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
  ENDED = 'ended',
}

export type CallState = `${CALL_STATE}`;

export type CurrentFacingMode = 'user' | 'environment';

export type WebRTCEvents = {
  callState: [CallState];
  remoteStream: [MediaStream];
  localStream: [MediaStream | null];
  localStreamReady: [MediaStream];
  microphoneState: [boolean];
  cameraState: [boolean];
};

export type NavigationParams = {
  Call: { call: IIncomingCallData; user: string };
};
