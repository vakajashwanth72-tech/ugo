import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/apiClient';
import Header from '../../components/ui/Header';
import Button from '../../components/ui/Button';
import { RootStackParamList } from '../../navigation/navigationTypes';

type OtpRouteProp = RouteProp<RootStackParamList, 'OtpVerification'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function OtpVerificationScreen() {
  const route = useRoute<OtpRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { bookingId, actionType } = route.params;

  const isReturn =
    actionType?.toLowerCase().includes('return') || false;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [cycleInfo, setCycleInfo] = useState('Cycle');
  const [renterName, setRenterName] = useState('Renter');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  const handleRegenerateFromScreen = async () => {
    if (!bookingId || regenerating) return;
    setRegenerating(true);
    try {
      console.log(`[OtpVerificationScreen] Regenerating OTP for booking ${bookingId} (isReturn: ${isReturn})...`);
      if (isReturn) {
        await apiClient.regenerateReturnOtp(bookingId);
      } else {
        await apiClient.regenerateOtp(bookingId, false);
      }
      setOtp(['', '', '', '', '', '']);
      setErrorMessage(null);
      setSuccessMessage(
        isReturn
          ? 'A fresh Return OTP has been sent to the renter. Please ask the renter for the new code.'
          : 'A fresh OTP has been sent to the renter. Please ask the renter for the new code.'
      );
      inputRefs.current[0]?.focus();
      Alert.alert(
        'OTP Regenerated! 🎉',
        isReturn
          ? 'A fresh Return OTP has been sent to the renter. Enter the new Return OTP once the renter shares it with you.'
          : 'A fresh OTP has been sent to the renter. Enter the new OTP once the renter shares it with you.'
      );
    } catch (err: any) {
      console.error('[OtpVerificationScreen] Regenerate error:', err);
      Alert.alert(
        'Regeneration Error',
        err?.data?.message || err?.message || 'Unable to regenerate OTP at this time.'
      );
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    const fetchBookingDetails = async () => {
      try {
        const { data: booking, error } = await supabase
          .from('booking_table')
          .select(`
            id,
            renter_id,
            cycles (brand, model)
          `)
          .eq('id', bookingId)
          .single();

        if (error || !booking) return;

        if (booking.cycles) {
          const c: any = booking.cycles;
          setCycleInfo(`${c.brand} ${c.model}`);
        }

        if (booking.renter_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', booking.renter_id)
            .single();

          if (profile) {
            setRenterName(profile.full_name || profile.email?.split('@')[0] || 'Renter');
          }
        }
      } catch (err) {
        console.error('Error fetching OTP context:', err);
      } finally {
        setDetailsLoading(false);
      }
    };

    fetchBookingDetails();
  }, [bookingId]);

  const handleOtpChange = (value: string, index: number) => {
    if (!/^\d*$/.test(value)) return;

    if (errorMessage) setErrorMessage(null);
    if (successMessage) setSuccessMessage(null);

    const nextOtp = [...otp];
    nextOtp[index] = value.slice(-1);
    setOtp(nextOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const enteredOtp = otp.join('').trim();
    if (enteredOtp.length !== 6) {
      const msg = 'Please enter all 6 digits of the OTP.';
      setErrorMessage(msg);
      Alert.alert('Incomplete OTP', msg);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let result: any;
      if (isReturn) {
        console.log(`[OtpVerificationScreen] Calling PATCH /api/rentals/return-otp-verification for booking ${bookingId}`);
        result = await apiClient.verifyReturnOtp(bookingId, enteredOtp);
      } else {
        console.log(`[OtpVerificationScreen] Verifying pickup OTP for booking ${bookingId} via apiClient.verifyBookingOtp...`);
        result = await apiClient.verifyBookingOtp(bookingId, enteredOtp);
      }
      console.log('[OtpVerificationScreen] OTP verification success:', result);

      // Check if backend responded with failure object despite HTTP 200
      if (result && (result.success === false || result.status === 'failed' || result.error)) {
        const errorMsg =
          result.message ||
          result.error ||
          result.msg ||
          result.detail ||
          'OTP verification failed.';
        const cleanMsg = String(errorMsg).replace(/^Error:\s*/i, '').trim();
        setErrorMessage(cleanMsg);
        Alert.alert('Verification Failed', cleanMsg);
        return;
      }

      const okMsg =
        result?.message ||
        result?.msg ||
        (isReturn
          ? 'The cycle return has been successfully verified and completed.'
          : 'Pickup OTP verified! The rental is now moving to payment and active ride.');
      const cleanOkMsg = String(okMsg).replace(/^Error:\s*/i, '').trim();

      setSuccessMessage(cleanOkMsg);

      Alert.alert('OTP Verified! ✅', cleanOkMsg, [
        {
          text: 'View Ongoing Rentals',
          onPress: () => navigation.navigate('OngoingRentals'),
        },
      ]);
    } catch (err: any) {
      console.error('[OtpVerificationScreen] OTP verification error:', err);
      const rawMessage =
        err?.data?.message ||
        err?.data?.error ||
        err?.data?.msg ||
        err?.data?.detail ||
        err?.message ||
        (typeof err?.data === 'string' ? err.data : null) ||
        'Invalid OTP. Please verify and try again.';
      const cleanMessage = String(rawMessage).replace(/^Error:\s*/i, '').trim();

      setErrorMessage(cleanMessage);
      Alert.alert('Verification Failed', cleanMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title={isReturn ? 'Return OTP Verification' : 'Pickup OTP Verification'} showBack />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={isReturn ? 'checkmark-circle-outline' : 'key-outline'}
              size={48}
              color={colors.primary}
            />
          </View>

          <Text style={styles.title}>
            {isReturn ? 'Verify Cycle Return' : 'Verify Cycle Pickup'}
          </Text>

          {detailsLoading ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ marginVertical: 8 }} />
          ) : (
            <Text style={styles.subtitle}>
              Enter the 6-digit OTP provided by{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{renterName}</Text> for{' '}
              <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{cycleInfo}</Text>.
            </Text>
          )}

          {/* 6 Digit Inputs */}
          <View style={styles.otpInputRow}>
            {otp.map((digit, idx) => (
              <TextInput
                key={idx}
                ref={(ref) => (inputRefs.current[idx] = ref)}
                style={[
                  styles.otpBox,
                  digit ? styles.otpBoxFilled : null,
                  errorMessage ? styles.otpBoxError : null,
                ]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(val) => handleOtpChange(val, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                selectTextOnFocus
              />
            ))}
          </View>

          {/* On-Screen Error Response Banner */}
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={22} color={colors.danger} style={{ marginRight: 8, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errorBannerTitle}>Verification Failed</Text>
                <Text style={styles.errorBannerText}>{errorMessage}</Text>
                {errorMessage.toLowerCase().includes('expire') && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.errorBannerHint}>
                      {isReturn
                        ? 'The previous Return OTP has expired. You can regenerate a new Return OTP for the renter now.'
                        : 'The previous OTP has expired. You can regenerate a new OTP for the renter now.'}
                    </Text>
                    <TouchableOpacity
                      style={styles.regenerateBtnInScreen}
                      onPress={handleRegenerateFromScreen}
                      disabled={regenerating}
                      activeOpacity={0.8}
                    >
                      {regenerating ? (
                        <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 6 }} />
                      ) : (
                        <Ionicons name="refresh" size={15} color={colors.white} style={{ marginRight: 6 }} />
                      )}
                      <Text style={styles.regenerateBtnInScreenText}>
                        {regenerating
                          ? 'Regenerating OTP...'
                          : isReturn
                          ? 'Regenerate Return OTP'
                          : 'Regenerate New OTP'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* On-Screen Success Response Banner */}
          {successMessage && (
            <View style={styles.successBanner}>
              <Ionicons name="checkmark-circle" size={22} color={colors.accent} style={{ marginRight: 8, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.successBannerTitle}>Verified</Text>
                <Text style={styles.successBannerText}>{successMessage}</Text>
              </View>
            </View>
          )}

          <Button
            title={isReturn ? 'Confirm OTP' : 'Confirm Pickup'}
            onPress={handleVerify}
            loading={loading}
            size="lg"
            variant="accent"
            style={{ marginTop: spacing.lg, width: '100%' }}
          />

          <TouchableOpacity
            style={styles.cancelLink}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelLinkText}>Back to Ongoing Rentals</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  container: {
    flex: 1,
    backgroundColor: colors.surface},
  content: {
    padding: spacing.xl,
    alignItems: 'center'},
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.md},
  title: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center'},
  subtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
    maxWidth: 320,
    marginBottom: spacing.xl},
  otpInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: spacing.md},
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.textPrimary},
  otpBoxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.white},
  otpBoxError: {
    borderColor: colors.danger,
    backgroundColor: '#FEF2F2'},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEE2E2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    width: '100%'},
  errorBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2},
  errorBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
    lineHeight: 18},
  errorBannerHint: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 4,
    fontStyle: 'italic'},
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    width: '100%'},
  successBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
    marginBottom: 2},
  successBannerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#047857',
    lineHeight: 18},
  cancelLink: {
    marginTop: spacing.lg,
    padding: spacing.sm},
  cancelLinkText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'},
  regenerateBtnInScreen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DC2626',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 3,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    alignSelf: 'flex-start'},
  regenerateBtnInScreenText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white}});
