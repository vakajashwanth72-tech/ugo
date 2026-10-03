import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { spacing, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl } from '../../lib/cycleUtils';
import {
  onCallAcceptedReceived,
  onCallRejectedReceived,
  onCallCancelledReceived,
  onCallEndedReceived,
} from '../../lib/socket';

type CallRouteProp = RouteProp<RootStackParamList, 'CallModal'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CallModal() {
  const route = useRoute<CallRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const {
    id: routeId,
    call_id: routeCallId,
    targetUserId,
    targetUserName = 'User',
    targetUserAvatar,
    bookingId,
    conversationId,
    isIncoming = false,
    callData,
  } = route.params || {};

  const {
    callState,
    setCallState,
    callDetails,
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
  } = useWebRTCCall(user?.id);

  const resolvedCallId =
    callDetails?.id ??
    callData?.id ??
    callData?.call_id ??
    callData?.callId ??
    callData?.call_data?.id ??
    callData?.call_data?.call_id ??
    routeCallId ??
    routeId;

  const [isAccepting, setIsAccepting] = useState(false);
  const [endReason, setEndReason] = useState<string | null>(null);

  // Set initial state to 'incoming' if callee is receiving call
  useEffect(() => {
    if (isIncoming) {
      console.log('[CallModal] 📞 Screen opened in INCOMING mode for callData:', callData);
      setCallState('incoming');
    } else if (conversationId && callState === 'idle') {
      console.log(`[CallModal] 📞 Screen opened in OUTGOING mode with conversationId "${conversationId}". Initiating call...`);
      startCall(conversationId).catch((err) => {
        console.warn('[CallModal] Error initiating call:', err?.message || err);
      });
    }
  }, [isIncoming, conversationId]);

  // Strictly auto-remove call screen UI after 30 seconds for both User A and User B if not answered
  useEffect(() => {
    // If call has connected or already ended, ringing timer is not needed
    if (callState === 'connected' || callState === 'ended') {
      return;
    }

    console.log(
      `[CallModal] ⏱️ Strict 30-second ringing timer started for ${
        isIncoming ? 'User B (Callee)' : 'User A (Caller)'
      }`
    );

    const autoRemoveTimer = setTimeout(() => {
      console.log(
        `[CallModal] ⌛ Strict 30 seconds reached without answer. Auto-removing call UI strictly for ${
          isIncoming ? 'User B' : 'User A'
        }.`
      );
      setCallState('ended');
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    }, 30000);

    return () => {
      console.log(`[CallModal] ⏱️ 30-second ringing timer cleared for ${isIncoming ? 'User B' : 'User A'}`);
      clearTimeout(autoRemoveTimer);
    };
  }, [callState === 'connected', callState === 'ended', isIncoming, navigation, setCallState]);

  // User A caller listener: when User B accepts the call, backend emits "call:accepted" or push notification
  useEffect(() => {
    // CRITICAL: Only User A (caller, when NOT incoming) listens for call:accepted!
    // User B (callee, isIncoming === true) accepts directly via acceptCall and must NOT handle this.
    if (isIncoming) {
      return;
    }

    const unsubscribe = onCallAcceptedReceived((data) => {
      console.log('[CallModal] 🟢 Received "call:accepted" event! User B accepted the call:', data);
      handleCallAccepted(data);
    });

    return () => {
      unsubscribe();
    };
  }, [handleCallAccepted, isIncoming]);

  // User A caller listener: when User B rejects the call, backend emits "call:rejected" or push notification
  useEffect(() => {
    if (isIncoming) return;

    const unsubscribe = onCallRejectedReceived((data) => {
      console.log('[CallModal] 🛑 Received "call:rejected" event! User B rejected the call:', data);
      const dataId = data?.id;
      const currentId = resolvedCallId;
      if (!dataId || !currentId || String(dataId) === String(currentId)) {
        setEndReason('Call Declined');
        handleCallRejected(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [handleCallRejected, isIncoming, resolvedCallId]);

  // User B callee listener: when User A cancels the call, backend emits "call:cancelled" or push notification
  useEffect(() => {
    if (!isIncoming) return;

    const unsubscribe = onCallCancelledReceived((data) => {
      console.log('[CallModal] 🛑 Received "call:cancelled" event! User A cancelled the call:', data);
      const dataId = data?.id;
      const currentId = resolvedCallId;
      if (!dataId || !currentId || String(dataId) === String(currentId)) {
        setEndReason('Call Cancelled');
        handleCallCancelled(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [handleCallCancelled, isIncoming, resolvedCallId]);

  // Listen for call ended event (from socket / push fallback)
  useEffect(() => {
    const unsubscribe = onCallEndedReceived((data) => {
      console.log('[CallModal] 📴 Received "call:ended" event:', data);
      const dataId = data?.id;
      const currentId = resolvedCallId;
      if (!dataId || !currentId || String(dataId) === String(currentId)) {
        setEndReason('Call Ended');
        handleCallEnded(data);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [handleCallEnded, resolvedCallId]);

  useEffect(() => {
    if (callState === 'ended') {
      const dismissDelay = endReason ? 1000 : 600;
      const timer = setTimeout(() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
        }
      }, dismissDelay);
      return () => clearTimeout(timer);
    }
  }, [callState, navigation, endReason]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const displayName = targetUserName || (isIncoming ? 'Incoming Caller' : 'Cycle Contact');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0F172A" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.encryptionBadge}>
          <Ionicons name="lock-closed" size={13} color="#38BDF8" />
          <Text style={styles.headerBrand}>UgO Audio Call</Text>
        </View>
        <Text style={styles.subtext}>
          {isIncoming ? 'Incoming Voice Call • Signaling Active' : 'Encrypted Peer-to-Peer Voice'}
        </Text>
      </View>

      {/* Center Avatar & Status */}
      <View style={styles.centerSection}>
        <View
          style={[
            styles.avatarCircle,
            callState === 'calling' && styles.avatarCalling,
            callState === 'incoming' && styles.avatarIncoming,
          ]}
        >
          {targetUserAvatar ? (
            <Image
              source={{ uri: getCycleImageUrl(targetUserAvatar) }}
              style={styles.avatarImage}
            />
          ) : (
            <Ionicons name="person" size={68} color="#FFFFFF" />
          )}
        </View>

        <Text style={styles.participantName} numberOfLines={1}>
          {displayName}
        </Text>

        <View style={styles.statusPill}>
          <Text style={styles.statusLabel}>
            {callState === 'incoming' && 'Incoming Call...'}
            {callState === 'calling' && 'Calling...'}
            {callState === 'connected' && formatDuration(callDuration)}
            {callState === 'ended' && (endReason || 'Call Ended')}
            {callState === 'idle' && (isIncoming ? 'Ringing...' : 'Connecting...')}
          </Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        {callState === 'incoming' ? (
          /* User B: Incoming Call Mode with Decline and Accept buttons */
          <View style={styles.incomingControlsRow}>
            {/* Decline Button */}
            <TouchableOpacity
              style={[styles.callActionBtn, styles.declineBtn]}
              onPress={() => {
                setEndReason('Call Declined');
                const callId =
                  resolvedCallId ??
                  callData?.id ??
                  callData?.call_id ??
                  callData?.callId ??
                  (route.params as any)?.id ??
                  (route.params as any)?.call_id;
                console.log(`[CallModal] 🛑 User B declined call for callId: "${callId}"`);
                rejectCall(callId);
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="call"
                size={32}
                color="#FFFFFF"
                style={{ transform: [{ rotate: '135deg' }] }}
              />
              <Text style={styles.callActionLabel}>Decline</Text>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[styles.callActionBtn, styles.acceptBtn, isAccepting && { opacity: 0.6 }]}
              disabled={isAccepting}
              onPress={() => {
                if (isAccepting) return;
                setIsAccepting(true);
                const callId =
                  resolvedCallId ??
                  callData?.id ??
                  callData?.call_id ??
                  callData?.callId ??
                  (route.params as any)?.id ??
                  (route.params as any)?.call_id;
                console.log(`[CallModal] 🟢 User B pressed Accept (single trigger). Calling acceptCall for callId: "${callId}"`, {
                  resolvedCallId,
                  callData,
                  routeParams: route.params,
                });
                acceptCall(callId);
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={32} color="#FFFFFF" />
              <Text style={styles.callActionLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* User A / Connected Call Mode: Mute, Speaker, and End Call buttons */
          <>
            <View style={styles.secondaryControlsRow}>
              {/* Mute Button */}
              <TouchableOpacity
                style={[styles.secondaryBtn, isMuted && styles.secondaryBtnActive]}
                onPress={toggleMute}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={26}
                  color={isMuted ? '#0F172A' : '#FFFFFF'}
                />
                <Text style={[styles.secondaryBtnLabel, isMuted && styles.secondaryBtnLabelActive]}>
                  {isMuted ? 'Muted' : 'Mute'}
                </Text>
              </TouchableOpacity>

              {/* Speaker Button */}
              <TouchableOpacity
                style={[styles.secondaryBtn, isSpeakerOn && styles.secondaryBtnActive]}
                onPress={toggleSpeaker}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isSpeakerOn ? 'volume-high' : 'volume-medium-outline'}
                  size={26}
                  color={isSpeakerOn ? '#0F172A' : '#FFFFFF'}
                />
                <Text style={[styles.secondaryBtnLabel, isSpeakerOn && styles.secondaryBtnLabelActive]}>
                  {isSpeakerOn ? 'Speaker' : 'Earpiece'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* End / Cancel Call Button */}
            <TouchableOpacity
              style={styles.endCallBtn}
              onPress={() => {
                const callId =
                  resolvedCallId ??
                  callData?.id ??
                  callData?.call_id ??
                  callData?.callId ??
                  (route.params as any)?.id ??
                  (route.params as any)?.call_id;
                if (callState === 'calling' && !isIncoming) {
                  setEndReason('Call Cancelled');
                  console.log(`[CallModal] 🛑 User A cancelled call for callId: "${callId}"`);
                  cancelCall(callId);
                } else {
                  setEndReason('Call Ended');
                  console.log(`[CallModal] 📞 Ending active call for callId: "${callId}"`);
                  endCall(callId);
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons
                name="call"
                size={32}
                color="#FFFFFF"
                style={{ transform: [{ rotate: '135deg' }] }}
              />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  encryptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
  },
  headerBrand: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38BDF8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subtext: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    fontWeight: '400',
  },
  centerSection: {
    alignItems: 'center',
  },
  avatarCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  avatarCalling: {
    borderColor: '#38BDF8',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  avatarIncoming: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 70,
  },
  participantName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  statusPill: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  statusLabel: {
    fontSize: 16,
    color: '#38BDF8',
    fontWeight: '600',
  },
  controlsSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  incomingControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    paddingHorizontal: 36,
    marginBottom: 24,
  },
  callActionBtn: {
    width: 74,
    height: 74,
    borderRadius: 37,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    elevation: 8,
  },
  declineBtn: {
    backgroundColor: '#EF4444',
    shadowColor: '#EF4444',
  },
  acceptBtn: {
    backgroundColor: '#22C55E',
    shadowColor: '#22C55E',
  },
  callActionLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    position: 'absolute',
    bottom: -22,
  },
  secondaryControlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginBottom: 36,
  },
  secondaryBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  secondaryBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  secondaryBtnLabel: {
    color: '#CBD5E1',
    fontSize: 11,
    marginTop: 4,
    position: 'absolute',
    bottom: -22,
    fontWeight: '500',
  },
  secondaryBtnLabelActive: {
    color: '#38BDF8',
    fontWeight: '700',
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    shadowColor: '#EF4444',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
