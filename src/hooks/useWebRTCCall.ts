import { useState, useEffect, useRef, useCallback } from 'react';
import { Alert, NativeModules } from 'react-native';
import { supabase } from '../lib/supabase';
import { CallSession } from '../types';

// Safely detect if WebRTC native binary is available in the current runtime.
// Standard Expo Go does not contain custom C++ WebRTC binaries, whereas standalone
// APKs and Expo Dev Clients (npx expo run:android) do.
export const isWebRTCAvailable = Boolean(
  NativeModules && NativeModules.WebRTCModule != null
);

let RTCPeerConnection: any = null;
let mediaDevices: any = null;
let RTCIceCandidate: any = null;
let RTCSessionDescription: any = null;

if (isWebRTCAvailable) {
  try {
    // Dynamic require so Metro does not execute the native module initialization in Expo Go
    const webrtc = require('react-native-webrtc');
    RTCPeerConnection = webrtc.RTCPeerConnection;
    mediaDevices = webrtc.mediaDevices;
    RTCIceCandidate = webrtc.RTCIceCandidate;
    RTCSessionDescription = webrtc.RTCSessionDescription;
  } catch (err) {
    console.warn('[UgO] Could not initialize react-native-webrtc:', err);
  }
}

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export type CallState = 'idle' | 'calling' | 'incoming' | 'connected' | 'ended';

export function useWebRTCCall(userId: string | undefined) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanupCall = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t: any) => t.stop());
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setCurrentSession(null);
    setCallState('idle');
    setIsMuted(false);
    setIsSpeakerOn(false);
    setCallDuration(0);
  }, []);

  // Listen for incoming call sessions and status changes (no realtime channel)
  useEffect(() => {
    if (!userId) return;

    const checkIncoming = async () => {
      try {
        const { data: session } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('callee_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          if (session.status === 'ringing' && callState === 'idle') {
            setCurrentSession(session);
            setCallState('incoming');
          } else if (session.status === 'ended' || session.status === 'rejected') {
            cleanupCall();
          }
        }
      } catch {}
    };

    const interval = setInterval(checkIncoming, 5000);
    return () => clearInterval(interval);
  }, [userId, callState, cleanupCall]);

  // Start outgoing call
  const startCall = useCallback(
    async (targetUserId: string, targetUserName: string, bookingId?: string) => {
      if (!userId) return;

      try {
        setCallState('calling');

        // 1. Create call session record
        const { data: session, error: sessErr } = await supabase
          .from('call_sessions')
          .insert({
            caller_id: userId,
            callee_id: targetUserId,
            booking_id: bookingId || null,
            status: 'ringing',
          })
          .select()
          .single();

        if (sessErr || !session) throw sessErr || new Error('Failed to create call session');
        setCurrentSession(session);

        // Listen for session updates (callee accepted or rejected) via polling
        const sessionInterval = setInterval(async () => {
          try {
            const { data: updated } = await supabase
              .from('call_sessions')
              .select('*')
              .eq('id', session.id)
              .maybeSingle();

            if (updated) {
              if (updated.status === 'connected') {
                setCallState('connected');
                if (!timerRef.current) {
                  timerRef.current = setInterval(() => {
                    setCallDuration((prev) => prev + 1);
                  }, 1000);
                }
              } else if (updated.status === 'ended' || updated.status === 'rejected') {
                clearInterval(sessionInterval);
                cleanupCall();
              }
            }
          } catch {}
        }, 3000);

        // 2. Setup local audio stream if native WebRTC is available
        let stream: any = null;
        if (isWebRTCAvailable && mediaDevices) {
          try {
            const media = await mediaDevices.getUserMedia({ audio: true, video: false });
            stream = media;
            localStreamRef.current = stream;
          } catch (mediaErr) {
            console.warn('[UgO] Microphone access error:', mediaErr);
          }
        }

        // 3. Create peer connection if native WebRTC is available
        if (isWebRTCAvailable && RTCPeerConnection) {
          const pc = new RTCPeerConnection(RTC_CONFIG);
          peerConnectionRef.current = pc;

          if (stream) {
            stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
          }

          // Send ICE candidates
          pc.addEventListener('icecandidate', async (event: any) => {
            if (event.candidate && session.id) {
              await supabase.from('call_signals').insert({
                session_id: session.id,
                sender_id: userId,
                type: 'candidate',
                payload: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
              });
            }
          });

          // 4. Create and send offer
          const offer = await pc.createOffer({ offerToReceiveAudio: true });
          await pc.setLocalDescription(offer);

          await supabase.from('call_signals').insert({
            session_id: session.id,
            sender_id: userId,
            type: 'offer',
            payload: offer,
          });

          // 5. Check for answer & remote candidates via polling
          const signalsInterval = setInterval(async () => {
            try {
              const { data: signals } = await supabase
                .from('call_signals')
                .select('*')
                .eq('session_id', session.id)
                .neq('sender_id', userId)
                .order('created_at', { ascending: true });

              if (signals && signals.length > 0) {
                for (const signal of signals) {
                  if (signal.type === 'answer' && RTCSessionDescription && !pc.remoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
                    setCallState('connected');
                    if (!timerRef.current) {
                      timerRef.current = setInterval(() => {
                        setCallDuration((prev) => prev + 1);
                      }, 1000);
                    }
                  } else if (signal.type === 'candidate' && signal.payload && RTCIceCandidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
                  }
                }
              }
            } catch {}
          }, 2000);
        }
      } catch (err: any) {
        Alert.alert('Call Failed', err.message || 'Unable to place audio call.');
        cleanupCall();
      }
    },
    [userId, cleanupCall]
  );

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    if (!currentSession || !userId) return;

    try {
      let stream: any = null;
      if (isWebRTCAvailable && mediaDevices) {
        try {
          const media = await mediaDevices.getUserMedia({ audio: true, video: false });
          stream = media;
          localStreamRef.current = stream;
        } catch (mediaErr) {
          console.warn('[UgO] Microphone access error on accept:', mediaErr);
        }
      }

      if (isWebRTCAvailable && RTCPeerConnection) {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peerConnectionRef.current = pc;

        if (stream) {
          stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
        }

        pc.addEventListener('icecandidate', async (event: any) => {
          if (event.candidate && currentSession.id) {
            await supabase.from('call_signals').insert({
              session_id: currentSession.id,
              sender_id: userId,
              type: 'candidate',
              payload: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
            });
          }
        });

        // Fetch remote offer
        const { data: signals } = await supabase
          .from('call_signals')
          .select('*')
          .eq('session_id', currentSession.id)
          .eq('type', 'offer')
          .order('created_at', { ascending: false })
          .limit(1);

        if (signals && signals.length > 0 && RTCSessionDescription) {
          await pc.setRemoteDescription(new RTCSessionDescription(signals[0].payload));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await supabase.from('call_signals').insert({
            session_id: currentSession.id,
            sender_id: userId,
            type: 'answer',
            payload: answer,
          });
        }
      }

      await supabase
        .from('call_sessions')
        .update({ status: 'connected' })
        .eq('id', currentSession.id);

      setCallState('connected');

      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);
      }
    } catch (err: any) {
      console.error('Accept call error:', err);
      cleanupCall();
    }
  }, [currentSession, userId, cleanupCall]);

  // Reject call
  const rejectCall = useCallback(async () => {
    if (currentSession?.id) {
      await supabase
        .from('call_sessions')
        .update({ status: 'rejected' })
        .eq('id', currentSession.id);
    }
    cleanupCall();
  }, [currentSession, cleanupCall]);

  // End call
  const endCall = useCallback(async () => {
    if (currentSession?.id) {
      await supabase
        .from('call_sessions')
        .update({ status: 'ended' })
        .eq('id', currentSession.id);
    }
    setCallState('ended');
    setTimeout(() => {
      cleanupCall();
    }, 800);
  }, [currentSession, cleanupCall]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track: any) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  }, []);

  // Toggle Speaker
  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  return {
    callState,
    currentSession,
    isMuted,
    isSpeakerOn,
    callDuration,
    isWebRTCAvailable,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleSpeaker,
  };
}
