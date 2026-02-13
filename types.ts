export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  contacts?: string[]; // Array of UIDs
  isOnline?: boolean;
}

export interface Chat {
  id: string;
  participants: string[];
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: any;
    type: 'text' | 'sticker';
  };
  typing?: Record<string, any>; // map of uid -> timestamp
}

export interface Message {
  id: string;
  text?: string;
  senderId: string;
  timestamp: any;
  type: 'text' | 'sticker';
  stickerUrl?: string;
}

export interface CallSignal {
  id: string;
  callerId: string;
  callerName: string;
  calleeId: string;
  type: 'audio' | 'video';
  status: 'offering' | 'answered' | 'ended' | 'rejected';
  offer?: any;
  answer?: any;
}

export type CallStatus = 'idle' | 'incoming' | 'outgoing' | 'connected';