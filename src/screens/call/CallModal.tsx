import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useWebRTCCall } from '../../hooks/useWebRTCCall';
import { RootStackParamList } from '../../navigation/navigationTypes';

type CallRouteProp = RouteProp<RootStackParamList, 'CallModal'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CallModal() {
  const route = useRoute<CallRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { targetUserId, targetUserName, bookingId } = route.params || {};

  const {
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
    toggleSpeaker} = useWebRTCCall(user?.id);

  // If opened to initiate a call, trigger it
  useEffect(() => {
    if (targetUserId && callState === 'idle') {
      startCall(targetUserId, targetUserName || 'User', bookingId);
    }
  }, [targetUserId, targetUserName, bookingId, callState, startCall]);

  // If call ends, close modal
  useEffect(() => {
    if (callState === 'ended') {
      const timer = setTimeout(() => {
        navigation.goBack();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [callState, navigation]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const displayName =
    targetUserName ||
    (callState === 'incoming' ? 'Incoming Call' : 'Cycle Sharing Contact');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />

      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerBrand}>UgO Voice Call</Text>
        <Text style={styles.subtext}>
          {isWebRTCAvailable ? 'Encrypted Peer-to-Peer Audio' : 'Expo Go Mode • Signaling Active'}
        </Text>
      </View>

      {/* Center Avatar & Status */}
      <View style={styles.centerSection}>
        <View style={[styles.avatarCircle, callState === 'incoming' && styles.avatarRinging]}>
          <Ionicons name="person" size={64} color={colors.white} />
        </View>

        <Text style={styles.participantName}>{displayName}</Text>

        <Text style={styles.statusLabel}>
          {callState === 'calling' && 'Calling...'}
          {callState === 'incoming' && 'Incoming Call...'}
          {callState === 'connected' && formatDuration(callDuration)}
          {callState === 'ended' && 'Call Ended'}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        {callState === 'incoming' ? (
          /* Incoming Call: Accept or Decline */
          <View style={styles.incomingControls}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={rejectCall}
            >
              <Ionicons name="call" size={28} color={colors.white} style={{ transform: [{ rotate: '135deg' }] }} />
              <Text style={styles.btnLabel}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={acceptCall}
            >
              <Ionicons name="call" size={28} color={colors.white} />
              <Text style={styles.btnLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Active Call / Calling: Mute, Speaker, End Call */
          <View style={styles.activeControls}>
            <View style={styles.secondaryControlsRow}>
              {/* Mute Button */}
              <TouchableOpacity
                style={[styles.secondaryBtn, isMuted && styles.secondaryBtnActive]}
                onPress={toggleMute}
              >
                <Ionicons
                  name={isMuted ? 'mic-off' : 'mic'}
                  size={24}
                  color={isMuted ? colors.primary : colors.white}
                />
                <Text style={styles.secondaryBtnLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
              </TouchableOpacity>

              {/* Speaker Button */}
              <TouchableOpacity
                style={[styles.secondaryBtn, isSpeakerOn && styles.secondaryBtnActive]}
                onPress={toggleSpeaker}
              >
                <Ionicons
                  name={isSpeakerOn ? 'volume-high' : 'volume-medium-outline'}
                  size={24}
                  color={isSpeakerOn ? colors.primary : colors.white}
                />
                <Text style={styles.secondaryBtnLabel}>
                  {isSpeakerOn ? 'Speaker On' : 'Speaker'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* End Call Button */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.endCallBtn]}
              onPress={endCall}
            >
              <Ionicons
                name="call"
                size={32}
                color={colors.white}
                style={{ transform: [{ rotate: '135deg' }] }}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl},
  header: {
    alignItems: 'center',
    paddingTop: spacing.md},
  headerBrand: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 1,
    textTransform: 'uppercase'},
  subtext: {
    fontSize: typography.caption.fontSize,
    color: colors.textLight,
    marginTop: 2},
  centerSection: {
    alignItems: 'center'},
  avatarCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg},
  avatarRinging: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.15)'},
  participantName: {
    fontSize: typography.h1.fontSize,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center'},
  statusLabel: {
    fontSize: 20,
    color: colors.accent,
    marginTop: spacing.xs,
    fontWeight: '600'},
  controlsSection: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg},
  incomingControls: {
    flexDirection: 'row',
    justifyContent: 'space-around'},
  activeControls: {
    alignItems: 'center'},
  secondaryControlsRow: {
    flexDirection: 'row',
    gap: spacing.xxl,
    marginBottom: spacing.xl},
  secondaryBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center'},
  secondaryBtnActive: {
    backgroundColor: colors.white},
  secondaryBtnLabel: {
    color: colors.white,
    fontSize: 11,
    marginTop: 4,
    position: 'absolute',
    bottom: -20},
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg},
  acceptBtn: {
    backgroundColor: colors.success},
  declineBtn: {
    backgroundColor: colors.danger},
  endCallBtn: {
    backgroundColor: colors.danger},
  btnLabel: {
    color: colors.white,
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    marginTop: 4,
    position: 'absolute',
    bottom: -22}});
