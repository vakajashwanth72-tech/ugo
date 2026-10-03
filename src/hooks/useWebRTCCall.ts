import { useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track, RemoteParticipant, RemoteTrackPublication } from 'livekit-client';
import { AudioSession } from '@livekit/react-native';
import { apiClient } from '../lib/apiClient';
import { requestMicrophonePermission } from '../lib/callPermissions';

export interface CallDetails {
  id: string | number;
  call_type: string;
  status: string;
  room_name?: string;
  created_at: string;
}

export interface CreateCallResponse {
  success: boolean;
  message: string;
  call_details: CallDetails;
}

export interface CallTokenInfo {
  server_url: string;
  token: string;
}

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export function useWebRTCCall(userId?: string) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [callDetails, setCallDetails] = useState<CallDetails | null>(null);
  const [callTokenInfo, setCallTokenInfo] = useState<CallTokenInfo | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callDetailsRef = useRef<CallDetails | null>(null);
  const requestedTokensRef = useRef<Set<string>>(new Set());
  const isAcceptingCallRef = useRef(false);
  const roomRef = useRef<Room | null>(null);

  const cleanupCall = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      AudioSession.stopAudioSession();
    } catch {}
    isAcceptingCallRef.current = false;
    setCallState('ended');
  }, []);

  // Timer when call becomes connected
  useEffect(() => {
    if (callState === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callState]);

  // Connect to LiveKit room and publish audio track when callTokenInfo is ready
  useEffect(() => {
    if (!callTokenInfo?.server_url || !callTokenInfo?.token) {
      return;
    }

    let isCancelled = false;

    const connectLiveKit = async () => {
      try {
        console.log('[LiveKit] 🎙️ Requesting microphone permission before room connection...');
        const micGranted = await requestMicrophonePermission();

        if (isCancelled) return;

        // Disconnect existing room if any
        if (roomRef.current) {
          try {
            await roomRef.current.disconnect();
          } catch {}
          roomRef.current = null;
        }

        // Configure LiveKit AudioSession for proper in-call hardware routing
        try {
          await AudioSession.startAudioSession();
          await AudioSession.selectAudioOutput('earpiece');
        } catch (audioErr) {
          console.warn('[LiveKit] AudioSession configuration warning:', audioErr);
        }

        console.log(`[LiveKit] 🚀 Connecting to room at ${callTokenInfo.server_url}...`);
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        roomRef.current = room;

        // Setup room event listeners
        room.on(RoomEvent.Connected, async () => {
          console.log(`[LiveKit] 🟢 Connected to room: "${room.name}"!`);
          setCallState('connected');

          if (micGranted) {
            try {
              console.log('[LiveKit] 🎙️ Publishing local audio track (microphone)...');
              await room.localParticipant.setMicrophoneEnabled(true);
              console.log('[LiveKit] 🎙️ Local microphone published successfully!');
            } catch (micErr) {
              console.error('[LiveKit] ❌ Failed to enable local microphone:', micErr);
            }
          } else {
            console.warn('[LiveKit] ⚠️ Local microphone not enabled because permission was not granted.');
          }
        });

        room.on(RoomEvent.TrackSubscribed, (track: Track, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
          console.log(`[LiveKit] 🔊 Subscribed to remote track ${track.kind} (${track.sid}) from ${participant.identity}`);
        });

        // Auto-hangup: when the other user leaves the room, close remaining user's screen
        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log(`[LiveKit] 📴 Remote participant ${participant.identity} left room. Auto-closing call screen for remaining user...`);
          const activeCallId = callDetailsRef.current?.id;
          if (roomRef.current) {
            try {
              roomRef.current.disconnect();
            } catch {}
            roomRef.current = null;
          }
          try {
            AudioSession.stopAudioSession();
          } catch {}
          setCallState('ended');

          // Notify backend that call is ended
          if (activeCallId) {
            console.log(`[useWebRTCCall] 📞 Participant disconnected. Notifying backend POST /api/calls/${activeCallId}/end...`);
            apiClient.endCall(activeCallId).catch(() => {});
          }
        });

        room.on(RoomEvent.Disconnected, (reason) => {
          console.log('[LiveKit] 📴 Room disconnected:', reason);
          const activeCallId = callDetailsRef.current?.id;
          try {
            AudioSession.stopAudioSession();
          } catch {}
          setCallState('ended');

          // Notify backend that call is ended
          if (activeCallId) {
            apiClient.endCall(activeCallId).catch(() => {});
          }
        });

        await room.connect(callTokenInfo.server_url, callTokenInfo.token);
      } catch (err: any) {
        console.error('[LiveKit] ❌ Error connecting to LiveKit room:', err?.message || err);
      }
    };

    connectLiveKit();

    return () => {
      isCancelled = true;
      if (roomRef.current) {
        console.log('[LiveKit] Cleaning up room connection on unmount...');
        try {
          roomRef.current.disconnect();
        } catch {}
        roomRef.current = null;
      }
      try {
        AudioSession.stopAudioSession();
      } catch {}
    };
  }, [callTokenInfo?.server_url, callTokenInfo?.token]);

  // Start outgoing call by calling POST /api/calls/:id/create
  const startCall = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    try {
      console.log(`[useWebRTCCall] 📞 Initiating call with POST /api/calls/${conversationId}/create...`);
      setCallState('calling');
      setCallDuration(0);

      const res = await apiClient.createCall(conversationId, 'audio');
      console.log(`[useWebRTCCall] 📞 Call created successfully for conversation ${conversationId}:`, res);
      const details: CallDetails = res?.call_details || res?.data?.call_details || res;
      callDetailsRef.current = details;
      setCallDetails(details);
      return res;
    } catch (err: any) {
      console.error('[useWebRTCCall] Error initiating call session:', err);
      setCallState('ended');
      throw err;
    }
  }, []);

  // Accept incoming call by calling POST /api/calls/:id/accept then obtaining LiveKit token via POST /api/calls/:id/token
  const acceptCall = useCallback(async (callId?: string | number) => {
    console.log(`[useWebRTCCall] 📞 Incoming call accepted by User B with callId: "${callId}"`);
    setCallState('connected');
    setCallDuration(0);

    if (!callId) {
      console.warn('[useWebRTCCall] ⚠️ acceptCall invoked without callId!');
      return;
    }

    const cleanCallId = String(callId).trim();

    if (isAcceptingCallRef.current) {
      console.log(`[useWebRTCCall] ⚠️ User B acceptCall already in progress for "${cleanCallId}". Skipping duplicate.`);
      return;
    }
    isAcceptingCallRef.current = true;

    try {
      console.log(`[useWebRTCCall] 🟢 Step 1: User B calling backend POST /api/calls/${cleanCallId}/accept...`);
      const acceptRes = await apiClient.acceptCall(cleanCallId);
      console.log(`[useWebRTCCall] 🟢 Step 1 Complete: Backend POST /api/calls/${cleanCallId}/accept response:`, acceptRes);

      // Verify that accept API returned success
      const isSuccess = acceptRes?.success === true || acceptRes?.status === 'accepted' || (acceptRes && acceptRes.success !== false);
      if (!isSuccess) {
        console.warn(`[useWebRTCCall] ⚠️ Backend accept call did not return success for callId ${cleanCallId}:`, acceptRes);
        isAcceptingCallRef.current = false;
        return acceptRes;
      }

      // If accept response already includes LiveKit token and server_url, store it directly
      if (acceptRes?.token && acceptRes?.server_url) {
        console.log(`[useWebRTCCall] 🔑 Accept response already contains LiveKit credentials:`, acceptRes);
        setCallTokenInfo({ server_url: acceptRes.server_url, token: acceptRes.token });
        return acceptRes;
      }

      // Step 2: When accept returned success, call POST /api/calls/:id/token ONCE from User B
      if (requestedTokensRef.current.has(cleanCallId)) {
        console.log(`[useWebRTCCall] ⚠️ User B token already requested for callId "${cleanCallId}". Skipping duplicate request.`);
        return;
      }
      requestedTokensRef.current.add(cleanCallId);

      console.log(`[useWebRTCCall] 🔑 Step 2: Accept returned success! User B requesting LiveKit token via POST /api/calls/${cleanCallId}/token (User B: strictly 1 time)...`);
      const tokenRes = await apiClient.getCallToken(cleanCallId);
      console.log(`[useWebRTCCall] 🔑 Step 2 Complete: User B received LiveKit token from POST /api/calls/${cleanCallId}/token:`, tokenRes);
      if (tokenRes?.token && tokenRes?.server_url) {
        setCallTokenInfo({ server_url: tokenRes.server_url, token: tokenRes.token });
      }
      return tokenRes;
    } catch (err: any) {
      console.error('[useWebRTCCall] ❌ Backend error accepting call for User B:', err?.message || err);
      isAcceptingCallRef.current = false;
      // Strictly do NOT call token API if accept API failed
    }
  }, []);

  // Cancel outgoing call by User A via POST /api/calls/:id/cancel
  const cancelCall = useCallback(async (callId?: string | number) => {
    const rawId = callId || callDetailsRef.current?.id;
    console.log(`[useWebRTCCall] 📞 Outgoing call cancelled by User A for callId: "${rawId}".`);
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {}
    setCallState('ended');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;

    if (rawId) {
      console.log(`[useWebRTCCall] 📞 Calling backend POST /api/calls/${rawId}/cancel...`);
      apiClient.cancelCall(rawId).catch((err) => {
        console.warn('[useWebRTCCall] ⚠️ Error reporting call cancelled to backend:', err);
      });
    }
  }, []);

  // Reject incoming call by User B via POST /api/calls/:id/reject
  const rejectCall = useCallback(async (callId?: string | number) => {
    const rawId = callId || callDetailsRef.current?.id;
    console.log(`[useWebRTCCall] 📞 Incoming call rejected by User B for callId: "${rawId}".`);
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {}
    setCallState('ended');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;

    if (rawId) {
      console.log(`[useWebRTCCall] 📞 Calling backend POST /api/calls/${rawId}/reject...`);
      apiClient.rejectCall(rawId).catch((err) => {
        console.warn('[useWebRTCCall] ⚠️ Error reporting call rejected to backend:', err);
      });
    }
  }, []);

  // End active call via POST /api/calls/:id/end
  const endCall = useCallback(async (callId?: string | number) => {
    const rawId = callId || callDetailsRef.current?.id;
    console.log(`[useWebRTCCall] 📞 Call ended by user for callId: "${rawId}".`);
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {}
    setCallState('ended');
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;

    if (rawId) {
      console.log(`[useWebRTCCall] 📞 Calling backend POST /api/calls/${rawId}/end...`);
      apiClient.endCall(rawId).catch((err) => {
        console.warn('[useWebRTCCall] ⚠️ Error reporting call ended to backend:', err);
      });
    }
  }, []);

  // Handle call rejected by User B: User A cleans up and updates callState to ended
  const handleCallRejected = useCallback((data?: any) => {
    console.log('[useWebRTCCall] 🛑 User A notified: call was rejected by User B:', data);
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      AudioSession.stopAudioSession();
    } catch {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;
    setCallState('ended');
  }, []);

  // Handle call cancelled by User A: User B cleans up and updates callState to ended
  const handleCallCancelled = useCallback((data?: any) => {
    console.log('[useWebRTCCall] 🛑 User B notified: call was cancelled by User A:', data);
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      AudioSession.stopAudioSession();
    } catch {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;
    setCallState('ended');
  }, []);

  // Handle call ended event received from backend: clean up local room and audio session without duplicate API calls
  const handleCallEnded = useCallback((data?: any) => {
    console.log('[useWebRTCCall] 📴 Peer notified: call was ended on backend:', data);
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch {}
      roomRef.current = null;
    }
    try {
      AudioSession.stopAudioSession();
    } catch {}
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isAcceptingCallRef.current = false;
    setCallState('ended');
  }, []);

  const toggleMute = useCallback(async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (roomRef.current?.localParticipant) {
      try {
        console.log(`[LiveKit] 🎙️ Setting microphone enabled: ${!nextMuted}`);
        await roomRef.current.localParticipant.setMicrophoneEnabled(!nextMuted);
      } catch (err) {
        console.warn('[LiveKit] Failed to toggle microphone state:', err);
      }
    }
  }, [isMuted]);

  const toggleSpeaker = useCallback(async () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    try {
      console.log(`[LiveKit] 🔊 Setting audio output to: ${nextSpeaker ? 'speaker' : 'earpiece'}`);
      await AudioSession.selectAudioOutput(nextSpeaker ? 'speaker' : 'earpiece');
    } catch (err) {
      console.warn('[LiveKit] Failed to switch audio output device:', err);
    }
  }, [isSpeakerOn]);

  // Handle call accepted event for User A when User B accepts, then call POST /api/calls/:id/token
  const handleCallAccepted = useCallback(async (acceptedData: any) => {
    const rawCallId =
      acceptedData?.id ??
      acceptedData?.call_id ??
      acceptedData?.callId ??
      acceptedData?.call_data?.id ??
      acceptedData?.call_data?.call_id ??
      acceptedData?.actionData?.call_id ??
      acceptedData?.actionData?.id ??
      acceptedData?.action_data?.call_id ??
      acceptedData?.action_data?.id ??
      callDetailsRef.current?.id;

    const callId = rawCallId ? String(rawCallId).trim() : '';

    console.log(`[useWebRTCCall] 🟢 User B accepted call. User A processing callId "${callId}":`, acceptedData);
    const updatedDetails: CallDetails = {
      id: callId || callDetailsRef.current?.id || '',
      call_type: acceptedData?.call_type || callDetailsRef.current?.call_type || 'audio',
      status: acceptedData?.status || 'accepted',
      room_name: acceptedData?.room_name || callDetailsRef.current?.room_name,
      created_at: acceptedData?.started_at || callDetailsRef.current?.created_at || new Date().toISOString(),
    };
    callDetailsRef.current = updatedDetails;
    setCallDetails(updatedDetails);
    setCallState('connected');
    setCallDuration(0);

    if (callId) {
      // User A token request guard: call strictly 1 time
      if (requestedTokensRef.current.has(callId)) {
        console.log(`[useWebRTCCall] ⚠️ User A token already requested for callId "${callId}". Skipping duplicate request.`);
        return;
      }
      requestedTokensRef.current.add(callId);

      try {
        console.log(`[useWebRTCCall] 🔑 User A requesting LiveKit token via POST /api/calls/${callId}/token (User A: strictly 1 time)...`);
        const res = await apiClient.getCallToken(callId);
        console.log('[useWebRTCCall] 🔑 User A received LiveKit token from POST /api/calls/:id/token:', res);
        if (res?.token && res?.server_url) {
          setCallTokenInfo({ server_url: res.server_url, token: res.token });
        }
        return res;
      } catch (err: any) {
        console.warn('[useWebRTCCall] ⚠️ Backend error getting token for User A:', err?.message || err);
      }
    } else {
      console.warn('[useWebRTCCall] ⚠️ handleCallAccepted could not resolve callId from acceptedData or callDetails!');
    }
  }, []);

  return {
    callState,
    setCallState,
    callDetails,
    setCallDetails,
    callTokenInfo,
    isMuted,
    isSpeakerOn,
    callDuration,
    startCall,
    acceptCall,
    handleCallAccepted,
    cancelCall,
    handleCallCancelled,
    rejectCall,
    handleCallRejected,
    endCall,
    handleCallEnded,
    toggleMute,
    toggleSpeaker,
    cleanupCall,
  };
}
