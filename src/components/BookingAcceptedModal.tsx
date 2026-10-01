import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../lib/theme';
import { AcceptedOtpPayload } from '../lib/AcceptedOtpCoordinator';

interface BookingAcceptedModalProps {
  visible: boolean;
  payload: AcceptedOtpPayload | null;
  onDismiss: () => void;
  onNavigateToOngoing: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BookingAcceptedModal({
  visible,
  payload,
  onDismiss,
  onNavigateToOngoing,
}: BookingAcceptedModalProps) {
  const [copied, setCopied] = useState(false);

  if (!visible || !payload) return null;

  const otpDigits = String(payload.otp || '••••••')
    .replace(/\s+/g, '')
    .slice(0, 6)
    .split('');

  // Pad to 6 if needed
  while (otpDigits.length < 6) {
    otpDigits.push('•');
  }

  const isReturn = payload.type === 'return';

  const handleCopyOtp = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    Alert.alert(
      isReturn ? 'Return OTP' : 'Pickup OTP',
      `Your ${isReturn ? 'Return' : 'Pickup'} OTP is: ${payload.otp}\nShare this with the owner to ${isReturn ? 'complete cycle return' : 'unlock your cycle'}.`
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <StatusBar barStyle="light-content" backgroundColor="rgba(0,0,0,0.7)" />

        <View style={styles.cardContainer}>
          {/* Top Decorative Ribbons Banner */}
          <View style={styles.ribbonWrapper}>
            <View style={styles.ribbonLeftTail} />
            <View style={styles.ribbonMain}>
              <Ionicons name="sparkles" size={14} color="#FEF08A" style={{ marginRight: 6 }} />
              <Text style={styles.ribbonText}>
                {isReturn ? 'RETURN ACCEPTED • CYCLE RETURN' : 'REQUEST ACCEPTED • RIDE READY'}
              </Text>
              <Ionicons name="sparkles" size={14} color="#FEF08A" style={{ marginLeft: 6 }} />
            </View>
            <View style={styles.ribbonRightTail} />
          </View>

          {/* Floating Confetti Accents */}
          <View style={styles.confettiRow}>
            <Text style={[styles.confettiEmoji, { transform: [{ rotate: '-15deg' }] }]}>🎊</Text>
            <Text style={[styles.confettiEmoji, { transform: [{ rotate: '12deg' }] }]}>✨</Text>
            <Text style={[styles.confettiEmoji, { transform: [{ rotate: '-8deg' }] }]}>🎈</Text>
            <Text style={[styles.confettiEmoji, { transform: [{ rotate: '20deg' }] }]}>🎉</Text>
          </View>

          {/* Celebration Icon Header */}
          <View style={styles.iconCircle}>
            <Ionicons
              name={isReturn ? 'checkmark-done-circle-outline' : 'bicycle'}
              size={42}
              color={colors.primary}
            />
            <View style={styles.badgeCheck}>
              <Ionicons name="checkmark" size={16} color={colors.white} />
            </View>
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.title}>
            {isReturn ? 'Return Accepted! 🎉' : 'Booking Accepted! 🎉'}
          </Text>
          <Text style={styles.subtitle}>
            {isReturn
              ? 'Your owner has accepted your return request. Share your Return OTP below with the owner to complete the return:'
              : 'The owner has approved your booking request. Meet the owner and share your Pickup OTP below:'}
          </Text>

          {/* Cycle & Owner Details Pill */}
          {(payload.cycleTitle || payload.ownerName || payload.location) && (
            <View style={styles.cycleInfoPill}>
              <View style={styles.cycleInfoRow}>
                <Ionicons name="bicycle-outline" size={16} color={colors.primary} />
                <Text style={styles.cycleTitleText} numberOfLines={1}>
                  {payload.cycleTitle || 'Campus Cycle'}
                </Text>
              </View>
              {payload.ownerName && (
                <View style={styles.ownerRow}>
                  <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                  <Text style={styles.ownerText}>Owner: <Text style={styles.boldText}>{payload.ownerName}</Text></Text>
                </View>
              )}
              {payload.location && (
                <View style={styles.ownerRow}>
                  <Ionicons name="location-outline" size={13} color="#D97706" />
                  <Text style={styles.ownerText}>{payload.location}</Text>
                </View>
              )}
            </View>
          )}

          {/* Large Pickup / Return OTP Digit Boxes */}
          <View style={styles.otpSection}>
            <Text style={styles.otpSectionLabel}>
              {isReturn ? 'YOUR 6-DIGIT RETURN OTP' : 'YOUR 6-DIGIT PICKUP OTP'}
            </Text>

            <TouchableOpacity
              style={styles.otpBoxContainer}
              activeOpacity={0.85}
              onPress={handleCopyOtp}
            >
              <View style={styles.digitsRow}>
                {otpDigits.map((digit, index) => (
                  <View key={index} style={styles.digitBox}>
                    <Text style={styles.digitText}>{digit}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.copyHintRow}>
                <Ionicons
                  name={copied ? 'checkmark-circle' : 'copy-outline'}
                  size={14}
                  color={copied ? '#059669' : colors.primary}
                />
                <Text style={[styles.copyHintText, copied && { color: '#059669', fontWeight: '700' }]}>
                  {copied ? 'OTP Ready to Share!' : 'Tap to share / copy OTP'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.otpInstruction}>
              {isReturn
                ? '🔐 Share this code with the owner in person. Once verified, the cycle return is completed and your rental ends.'
                : '🔐 Share this code with the owner in person. Once verified, you will proceed to payment and your ride timer begins.'}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={onNavigateToOngoing}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubbles-outline" size={18} color={colors.white} />
              <Text style={styles.primaryBtnText}>View in Ongoing Rentals</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.dismissBtnText}>Got It, Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 25, 47, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  cardContainer: {
    width: Math.min(SCREEN_WIDTH - 32, 380),
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xl + 4,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    ...shadows.lg,
  },
  // Ribbon Styling
  ribbonWrapper: {
    position: 'absolute',
    top: -16,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    zIndex: 10,
  },
  ribbonLeftTail: {
    width: 0,
    height: 0,
    borderTopWidth: 14,
    borderTopColor: '#047857',
    borderRightWidth: 10,
    borderRightColor: '#047857',
    borderBottomWidth: 14,
    borderBottomColor: '#047857',
    borderLeftWidth: 10,
    borderLeftColor: 'transparent',
  },
  ribbonMain: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  ribbonRightTail: {
    width: 0,
    height: 0,
    borderTopWidth: 14,
    borderTopColor: '#047857',
    borderLeftWidth: 10,
    borderLeftColor: '#047857',
    borderBottomWidth: 14,
    borderBottomColor: '#047857',
    borderRightWidth: 10,
    borderRightColor: 'transparent',
  },
  ribbonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  confettiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '90%',
    position: 'absolute',
    top: 14,
    opacity: 0.85,
  },
  confettiEmoji: {
    fontSize: 18,
  },
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: spacing.sm,
    position: 'relative',
    ...shadows.sm,
  },
  badgeCheck: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  cycleInfoPill: {
    width: '100%',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  cycleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cycleTitleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ownerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  otpSection: {
    width: '100%',
    backgroundColor: '#F0FDF4',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  otpSectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  otpBoxContainer: {
    alignItems: 'center',
    width: '100%',
  },
  digitsRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  digitBox: {
    width: 38,
    height: 48,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  digitText: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.primary,
  },
  copyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  copyHintText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  otpInstruction: {
    fontSize: 11,
    color: '#065F46',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 8,
  },
  actionButtons: {
    width: '100%',
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 8,
    ...shadows.sm,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  dismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  dismissBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
