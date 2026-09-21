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

  const inputRefs = useRef<Array<TextInput | null>>([]);

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
    const enteredOtp = otp.join('');
    if (enteredOtp.length !== 6) {
      Alert.alert('Incomplete OTP', 'Please enter all 6 digits of the OTP.');
      return;
    }

    setLoading(true);
    const webhookUrl = isReturn
      ? 'https://ugonitk.app.n8n.cloud/webhook/return-otp-verification'
      : 'https://ugonitk.app.n8n.cloud/webhook/otp-verification';

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'},
        body: JSON.stringify({
          booking_id: bookingId,
          OTP: enteredOtp})});

      const responseText = await response.text();
      let result: any = null;
      try {
        result = JSON.parse(responseText);
      } catch {
        result = { message: responseText };
      }

      if (!response.ok) {
        throw new Error(result?.message || `Verification failed (HTTP ${response.status})`);
      }

      Alert.alert(
        'OTP Verified! ✅',
        isReturn
          ? 'The cycle return has been successfully verified and completed.'
          : 'Pickup OTP verified! The rental is now moving to payment and active ride.',
        [
          {
            text: 'View Ongoing Rentals',
            onPress: () => navigation.navigate('OngoingRentals')},
        ]
      );
    } catch (err: any) {
      Alert.alert('Verification Failed', err.message || 'Invalid OTP. Please verify and try again.');
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
                style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                keyboardType="number-pad"
                maxLength={1}
                value={digit}
                onChangeText={(val) => handleOtpChange(val, idx)}
                onKeyPress={(e) => handleKeyPress(e, idx)}
                selectTextOnFocus
              />
            ))}
          </View>

          <Button
            title={isReturn ? 'Confirm Return' : 'Confirm Pickup'}
            onPress={handleVerify}
            loading={loading}
            size="lg"
            variant="accent"
            style={{ marginTop: spacing.xl, width: '100%' }}
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
  cancelLink: {
    marginTop: spacing.lg,
    padding: spacing.sm},
  cancelLinkText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'}});
