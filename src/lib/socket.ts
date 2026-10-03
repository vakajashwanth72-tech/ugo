import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { apiClient, API_BASE_URL } from './apiClient';
import { getAccessToken } from './secureStorage';

let socket: Socket | null = null;
let currentToken: string | null = null;
let lastAttemptTimestamp = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let activeConversationRoom: string | null = null;

// Track current AppState ('active' | 'background' | 'inactive')
let currentAppState: AppStateStatus = AppState.currentState;

// 20-second gap for reconnection and throttling
export const RECONNECT_DELAY_MS = 20000;

type NotificationCallback = (data: any) => void;
const notificationCallbacks: Set<NotificationCallback> = new Set();

export const onNotificationReceived = (callback: NotificationCallback): (() => void) => {
  notificationCallbacks.add(callback);
  return () => {
    notificationCallbacks.delete(callback);
  };
};

export interface SocketNewMessagePayload {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  created_at: string;
}

type ChatMessageCallback = (data: SocketNewMessagePayload) => void;
const chatMessageCallbacks: Set<ChatMessageCallback> = new Set();

const dispatchChatMessage = (data: SocketNewMessagePayload) => {
  console.log(`[Socket] 📨 Received message in room "conversation:${data?.conversation_id}":`, {
    id: data?.id,
    conversation_id: data?.conversation_id,
    sender_id: data?.sender_id,
    message: data?.message,
    created_at: data?.created_at,
  });
  chatMessageCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Chat message callback error:', err);
    }
  });
};

export interface SocketIncomingCallPayload {
  conversation_id: string;
  id: string | number;
  call_type: string;
  status: string;
  room_name?: string;
  created_at: string;
  caller_id?: string;
  caller_name?: string;
}

type IncomingCallCallback = (data: SocketIncomingCallPayload) => void;
const incomingCallCallbacks: Set<IncomingCallCallback> = new Set();

const dispatchIncomingCall = (data: SocketIncomingCallPayload) => {
  console.log(`[Socket] 📞 Incoming call intercepted for conversation ${data?.conversation_id}:`, data);
  incomingCallCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Incoming call callback error:', err);
    }
  });
};

export const onIncomingCallReceived = (callback: IncomingCallCallback): (() => void) => {
  incomingCallCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    incomingCallCallbacks.delete(callback);
  };
};

export interface SocketCallAcceptedPayload {
  id: string | number;
  conversation_id: string;
  call_type: string;
  status: string;
  room_name?: string;
  started_at?: string;
}

type CallAcceptedCallback = (data: SocketCallAcceptedPayload) => void;
const callAcceptedCallbacks: Set<CallAcceptedCallback> = new Set();

export const dispatchCallAccepted = (data: SocketCallAcceptedPayload) => {
  console.log(`[Socket] 🟢 Call accepted event dispatched for conversation "${data?.conversation_id}":`, data);
  callAcceptedCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Call accepted callback error:', err);
    }
  });
};

export const onCallAcceptedReceived = (callback: CallAcceptedCallback): (() => void) => {
  callAcceptedCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    callAcceptedCallbacks.delete(callback);
  };
};

export interface SocketCallRejectedPayload {
  id: string | number;
  status: string;
}

type CallRejectedCallback = (data: SocketCallRejectedPayload) => void;
const callRejectedCallbacks: Set<CallRejectedCallback> = new Set();

export const dispatchCallRejected = (data: SocketCallRejectedPayload) => {
  console.log('[Socket] 🛑 Call rejected event dispatched:', data);
  callRejectedCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Call rejected callback error:', err);
    }
  });
};

export const onCallRejectedReceived = (callback: CallRejectedCallback): (() => void) => {
  callRejectedCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    callRejectedCallbacks.delete(callback);
  };
};

export interface SocketCallCancelledPayload {
  id: string | number;
  status: string;
}

type CallCancelledCallback = (data: SocketCallCancelledPayload) => void;
const callCancelledCallbacks: Set<CallCancelledCallback> = new Set();

export const dispatchCallCancelled = (data: SocketCallCancelledPayload) => {
  console.log('[Socket] 🛑 Call cancelled event dispatched:', data);
  callCancelledCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Call cancelled callback error:', err);
    }
  });
};

export const onCallCancelledReceived = (callback: CallCancelledCallback): (() => void) => {
  callCancelledCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    callCancelledCallbacks.delete(callback);
  };
};

export interface SocketCallEndedPayload {
  id: string | number;
  status?: string;
}

type CallEndedCallback = (data: SocketCallEndedPayload) => void;
const callEndedCallbacks: Set<CallEndedCallback> = new Set();

export const dispatchCallEnded = (data: SocketCallEndedPayload) => {
  console.log('[Socket] 📴 Call ended event dispatched:', data);
  callEndedCallbacks.forEach((cb) => {
    try {
      cb(data);
    } catch (err) {
      console.warn('[Socket] Call ended callback error:', err);
    }
  });
};

export const onCallEndedReceived = (callback: CallEndedCallback): (() => void) => {
  callEndedCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    callEndedCallbacks.delete(callback);
  };
};

/**
 * Registers notification and chat event listeners on a socket instance.
 */
export const registerSocketListeners = (s: Socket) => {
  if (!s) return;

  // Unregister existing custom listeners to prevent duplicate triggers
  s.off('notification');
  s.off('message:new');
  s.off('call:incoming');
  s.off('call:accepted');
  s.off('call:rejected');
  s.off('call:cancelled');
  s.off('call:canceled');
  s.off('call:ended');

  // 1. Listen for real-time notifications
  s.on('notification', (data: any) => {
    console.log('[Socket] 🔔 Real-time notification received from server:', data);
    const title = String(data?.title || data?.action_type || data?.type || '').toLowerCase();
    const actionType = String(data?.action_type || data?.actionType || '').toUpperCase();
    const actionData = data?.action_data || data?.payload || data?.data || data;
    const convId =
      data?.conversation_id ||
      data?.conversationId ||
      actionData?.conversation_id ||
      actionData?.conversationId;

    if (title.includes('rental_otp_generated') || convId) {
      console.log(`[Socket] 🎯 rental_otp_generated notification received via WebSocket! conversation_id: "${convId}"`, data);
    }

    // Check if notification is an incoming call
    if (actionType === 'INCOMING_CALL' || title.includes('incoming call')) {
      const callData = actionData?.call_data || actionData || data;
      dispatchIncomingCall({
        conversation_id: String(callData?.conversation_id || convId || ''),
        id: callData?.call_id || callData?.id || data?.id,
        call_type: callData?.call_type || 'audio',
        status: callData?.status || 'ringing',
        room_name: callData?.room_name,
        created_at: callData?.created_at || new Date().toISOString(),
        caller_id: callData?.caller_id || data?.caller_id,
        caller_name: callData?.caller_name || data?.caller_name || data?.title || 'Caller',
      });
    }

    // Check if notification is call accepted (User A receiving confirmation that User B accepted)
    if (actionType === 'CALL_ACCEPTED' || title.includes('call accepted')) {
      const callData = actionData?.call_data || actionData || data;
      console.log('[Socket] 🟢 Notification for CALL_ACCEPTED received via WebSocket notification:', data);
      dispatchCallAccepted({
        id: callData?.call_id || callData?.id || data?.notificationId || data?.id,
        conversation_id: String(callData?.conversation_id || convId || ''),
        call_type: callData?.call_type || 'audio',
        status: callData?.status || 'accepted',
        room_name: callData?.room_name,
        started_at: callData?.started_at || new Date().toISOString(),
      });
    }

    // Check if notification is call rejected (User A receiving notice that User B rejected)
    if (actionType === 'CALL_REJECTED' || title.includes('call rejected')) {
      const callData = actionData?.call_data || actionData || data;
      console.log('[Socket] 🛑 Notification for CALL_REJECTED received via WebSocket notification:', data);
      dispatchCallRejected({
        id: callData?.call_id || callData?.id || data?.notificationId || data?.id,
        status: callData?.status || 'rejected',
      });
    }

    // Check if notification is call cancelled (User B receiving notice that User A cancelled)
    if (
      actionType === 'CALL_CANCELLED' ||
      actionType === 'CALL_CANCELED' ||
      title.includes('call cancelled') ||
      title.includes('call canceled')
    ) {
      const callData = actionData?.call_data || actionData || data;
      console.log('[Socket] 🛑 Notification for CALL_CANCELLED received via WebSocket notification:', data);
      dispatchCallCancelled({
        id: callData?.call_id || callData?.id || data?.notificationId || data?.id,
        status: callData?.status || 'cancelled',
      });
    }

    // Check if notification is call ended
    if (actionType === 'CALL_ENDED' || title.includes('call ended')) {
      const callData = actionData?.call_data || actionData || data;
      console.log('[Socket] 📴 Notification for CALL_ENDED received via WebSocket notification:', data);
      dispatchCallEnded({
        id: callData?.call_id || callData?.id || data?.notificationId || data?.id,
        status: callData?.status || 'ended',
      });
    }

    notificationCallbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.warn('[Socket] Notification callback error:', err);
      }
    });
  });

  // 2. Listen strictly for backend chat emit:
  // io.to(`conversation:${message.conversation_id}`).emit("message:new", { id, conversation_id, sender_id, message, created_at });
  s.on('message:new', (data: SocketNewMessagePayload) => {
    console.log(`[Socket] 📥 Socket event "message:new" received in room "conversation:${data?.conversation_id}":`, data);
    dispatchChatMessage(data);
  });

  // 3. Listen for backend incoming call emit to user:
  // io.to(`user:${receiver_id}`).emit("call:incoming", { conversation_id, id, call_type, status, room_name, created_at });
  s.on('call:incoming', (data: SocketIncomingCallPayload) => {
    console.log('[Socket] 📞 Socket event "call:incoming" received from backend:', data);
    dispatchIncomingCall(data);
  });

  // 4. Listen for backend call accepted emit to caller:
  // io.to(`user:${call.caller_id}`).emit("call:accepted", { id, conversation_id, call_type, status, room_name, started_at });
  s.on('call:accepted', (data: SocketCallAcceptedPayload) => {
    console.log('[Socket] 🟢 Socket event "call:accepted" received from backend:', data);
    dispatchCallAccepted(data);
  });

  // 5. Listen for backend call rejected emit to caller:
  // io.to(`user:${call.caller_id}`).emit("call:rejected", { id, status: call.status });
  s.on('call:rejected', (data: SocketCallRejectedPayload) => {
    console.log('[Socket] 🛑 Socket event "call:rejected" received from backend:', data);
    dispatchCallRejected(data);
  });

  // 6. Listen for backend call cancelled emit to receiver:
  // io.to(`user:${call.receiver_id}`).emit("call:cancelled", { id, status: call.status });
  s.on('call:cancelled', (data: SocketCallCancelledPayload) => {
    console.log('[Socket] 🛑 Socket event "call:cancelled" received from backend:', data);
    dispatchCallCancelled(data);
  });
  s.on('call:canceled', (data: SocketCallCancelledPayload) => {
    console.log('[Socket] 🛑 Socket event "call:canceled" received from backend:', data);
    dispatchCallCancelled(data);
  });

  // 7. Listen for backend call ended emit:
  // io.to(`user:${call.other_user_id}`).emit("call:ended", { id: call.id, status: call.status });
  s.on('call:ended', (data: SocketCallEndedPayload) => {
    console.log('[Socket] 📴 Socket event "call:ended" received from backend:', data);
    dispatchCallEnded(data);
  });
};

export const onChatMessageReceived = (callback: ChatMessageCallback): (() => void) => {
  chatMessageCallbacks.add(callback);
  if (socket) {
    registerSocketListeners(socket);
  }
  return () => {
    chatMessageCallbacks.delete(callback);
  };
};

export const SOCKET_SERVER_URL =
  process.env.EXPO_PUBLIC_SOCKET_SERVER_URL ||
  API_BASE_URL ||
  'https://seducing-glowworm-booth.ngrok-free.dev';

// Listen to app lifecycle state transitions
AppState.addEventListener('change', async (nextState: AppStateStatus) => {
  const previousState = currentAppState;
  currentAppState = nextState;

  if (nextState !== 'active') {
    // 🛑 App closed / sent to background:
    console.log(`[Socket] 📱 App closed/backgrounded (${nextState}). Pausing connection and stopping reconnect.`);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.disconnect();
    }
  } else if (nextState === 'active' && previousState !== 'active') {
    // 📱 App is now open and running in foreground:
    console.log('[Socket] 📱 App opened and running in foreground. Restoring socket connection...');
    const token = currentToken || (await getAccessToken());
    if (token) {
      connectSocket(token);
    }
  }
});

/**
 * Connect to backend Socket.IO server.
 * - Only connects when app is actively running in foreground ('active').
 * - When app is closed/in background, skips connection attempts.
 * - When app is running and connection is lost, reconnects with 20s gap.
 * - Single connection only (prevents duplicate connections).
 */
export const connectSocket = (accessToken?: string | null, forceImmediate = false): Socket | null => {
  // If app is closed or in background, do not call for connection
  if (currentAppState !== 'active') {
    console.log(`[Socket] App is in background (${currentAppState}). Skipping connection attempt.`);
    if (accessToken) {
      currentToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    }
    return null;
  }

  const cleanToken = accessToken?.replace(/^Bearer\s+/i, '').trim() || currentToken;

  // If no token is provided, avoid connecting since backend requires auth
  if (!cleanToken) {
    return null;
  }

  // 1. If already connected with the same token, reuse existing socket & ensure listeners
  if (socket?.connected && currentToken === cleanToken) {
    registerSocketListeners(socket);
    return socket;
  }

  // 2. If already connecting/reconnecting with the same token, do not create duplicate
  if (socket && !socket.disconnected && currentToken === cleanToken && !forceImmediate) {
    registerSocketListeners(socket);
    return socket;
  }

  // 3. Enforce 20 seconds gap between automatic connection attempts (bypass if forceImmediate)
  const now = Date.now();
  const timeSinceLastAttempt = now - lastAttemptTimestamp;

  if (!forceImmediate && timeSinceLastAttempt < RECONNECT_DELAY_MS && lastAttemptTimestamp !== 0) {
    const remainingDelay = RECONNECT_DELAY_MS - timeSinceLastAttempt;
    console.log(
      `[Socket] ⏳ 20-second lag active: next connection attempt in ${Math.ceil(remainingDelay / 1000)}s...`
    );

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (currentAppState === 'active') {
          connectSocket(cleanToken);
        }
      }, remainingDelay);
    }
    return socket;
  }

  // Clear any scheduled timer since we are connecting now
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Cleanly close prior instance before creating new connection
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  lastAttemptTimestamp = Date.now();
  currentToken = cleanToken;

  console.log(`[Socket] Initiating connection to ${SOCKET_SERVER_URL} (while app is running)...`);

  socket = io(SOCKET_SERVER_URL, {
    transports: ['websocket', 'polling'],
    query: {
      'ngrok-skip-browser-warning': 'true',
      token: cleanToken,
    },
    auth: {
      token: cleanToken,
      accessToken: cleanToken,
      Authorization: cleanToken,
    },
    extraHeaders: {
      'ngrok-skip-browser-warning': 'true',
      Authorization: cleanToken,
      authorization: cleanToken,
    },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: RECONNECT_DELAY_MS, // 20-second gap
    reconnectionDelayMax: RECONNECT_DELAY_MS, // Fixed 20 seconds
    randomizationFactor: 0,
    timeout: 20000, // 20-second connection timeout
  });

  registerSocketListeners(socket);

  socket.on('connect', () => {
    lastAttemptTimestamp = Date.now();
    console.log('[Socket] Connected successfully. Socket ID:', socket?.id);
    if (activeConversationRoom) {
      console.log(`[Socket] 🚪 Emitting conversation:join upon connect for: "${activeConversationRoom}"`);
      socket?.emit('conversation:join', activeConversationRoom);
      if (!isNaN(Number(activeConversationRoom)) && Number(activeConversationRoom) !== 0) {
        socket?.emit('conversation:join', Number(activeConversationRoom));
      }
    }
  });

  socket.io.on('reconnect', () => {
    lastAttemptTimestamp = Date.now();
    console.log('[Socket] 🔄 Reconnected successfully. Socket ID:', socket?.id);
    if (activeConversationRoom) {
      console.log(`[Socket] 🚪 Re-emitting conversation:join upon reconnect for: "${activeConversationRoom}"`);
      socket?.emit('conversation:join', activeConversationRoom);
      if (!isNaN(Number(activeConversationRoom)) && Number(activeConversationRoom) !== 0) {
        socket?.emit('conversation:join', Number(activeConversationRoom));
      }
    }
  });

  socket.on('disconnect', (reason) => {
    lastAttemptTimestamp = Date.now();
    if (currentAppState !== 'active') {
      console.log(`[Socket] App closed/in background. Disconnected (${reason}). Will not reconnect.`);
      return;
    }
    console.log(`[Socket] Connection lost while app is running (${reason}). Reconnecting in 20 seconds...`);
  });

  socket.on('connect_error', async (error: any) => {
    lastAttemptTimestamp = Date.now();
    const errMsg = String(error?.message || error || '').toLowerCase();

    // If backend rejects connection due to expired or invalid token, refresh token and reconnect
    if (errMsg.includes('auth') || errMsg.includes('jwt') || errMsg.includes('token')) {
      console.log('[Socket] Auth error encountered. Attempting token refresh...');
      try {
        const refreshed = await apiClient.tryRefreshToken();
        if (refreshed) {
          const freshToken = await getAccessToken();
          if (freshToken) {
            console.log('[Socket] Token refreshed successfully. Reconnecting socket with new token...');
            connectSocket(freshToken);
            return;
          }
        }
      } catch (refreshErr) {
        console.warn('[Socket] Token refresh note during socket connect:', refreshErr);
      }
    }

    if (currentAppState !== 'active') {
      console.log(`[Socket] App in background. Disconnecting socket on error.`);
      socket?.disconnect();
      return;
    }
    console.log(
      `[Socket] Connection error on ${SOCKET_SERVER_URL}: ${error?.message || error}. Retrying in 20s while app is running...`
    );
  });

  socket.io.on('reconnect_attempt', (attempt: number) => {
    if (currentAppState !== 'active') {
      console.log('[Socket] App is closed/backgrounded. Aborting reconnect attempt.');
      socket?.disconnect();
      return;
    }
    lastAttemptTimestamp = Date.now();
    console.log(`[Socket] ⏳ Reconnect attempt #${attempt} while app is running (after 20s gap)...`);
  });

  return socket;
};

/**
 * Join conversation room for real-time message receiving.
 * Server emits to room: conversation:${conversation_id}
 */
export const joinConversationRoom = (conversationId: string | number | null | undefined) => {
  if (!conversationId) return;
  const idStr = String(conversationId).trim();
  activeConversationRoom = idStr;

  const s = socket || getSocket();
  if (!s) {
    console.log(`[Socket] 🚪 Socket not yet created. Initializing socket for room "${idStr}"...`);
    getAccessToken().then((token) => {
      if (token) {
        connectSocket(token, true);
      }
    });
    return;
  }

  console.log(`[Socket] 🚪 socket.emit("conversation:join", "${idStr}") (connected: ${s.connected})`);
  try {
    s.emit('conversation:join', idStr);
    if (!isNaN(Number(idStr)) && Number(idStr) !== 0) {
      s.emit('conversation:join', Number(idStr));
    }
  } catch (err) {
    console.warn('[Socket] Error emitting room join:', err);
  }
};

export const leaveConversationRoom = (conversationId?: string | number | null) => {
  const targetId = conversationId ? String(conversationId).trim() : activeConversationRoom;
  if (targetId) {
    const s = socket || getSocket();
    if (s && s.connected) {
      try {
        console.log(`[Socket] 🚪 socket.emit("conversation:leave", "${targetId}")`);
        s.emit('conversation:leave', targetId);
        if (!isNaN(Number(targetId)) && Number(targetId) !== 0) {
          s.emit('conversation:leave', Number(targetId));
        }
      } catch (err) {
        console.warn('[Socket] Error emitting room leave:', err);
      }
    }
  }
  if (!conversationId || targetId === activeConversationRoom) {
    activeConversationRoom = null;
  }
};

export const getSocket = (): Socket | null => {
  return socket;
};

/**
 * When app or screen is refreshed, safely reconnect or reuse socket with 20s gap protection.
 */
export const refreshSocket = (accessToken?: string | null): Socket | null => {
  if (currentAppState !== 'active') {
    return null;
  }
  if (socket?.connected) {
    registerSocketListeners(socket);
    return socket;
  }
  return connectSocket(accessToken);
};

export const disconnectSocket = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentToken = null;
    activeConversationRoom = null;
    console.log('[Socket] Disconnected and socket cleared.');
  }
};
