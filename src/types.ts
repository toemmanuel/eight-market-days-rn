export interface InitiateCallPayload {
  callId: string;

  callerId: string;

  calleeId: string;

  calleeName: string;

  callType: 'audio' | 'video';
}

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

  callType: string;

  timestamp: string;
}

export interface WebRTCSignalPayload {
  to: string;

  callId: string;

  type: 'offer' | 'answer' | 'candidate';

  sdp?: any;

  candidate?: any;
}
