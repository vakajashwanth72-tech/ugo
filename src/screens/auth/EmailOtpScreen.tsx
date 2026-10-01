import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Button from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { saveAuthTokens } from '../../lib/secureStorage';
import { registerDeviceTokenWithBackend } from '../../lib/pushNotifications';
import { RootStackParamList } from '../../navigation/navigationTypes';

type RouteProps = RouteProp<RootStackParamList, 'EmailOtp'>;
type NavProps = NativeStackNavigationProp<RootStackParamList>;

export default function EmailOtpScreen() {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { verifyUrl, email, fullName, isForgotPassword = false } = route.params;

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(60);

  const inputRefs = useRef<Array<TextInput | null>>([]);

  // Countdown timer for Resend OTP
  useEffect(() => {
    if (timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (val: string, index: number) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned && val !== '') return;

    const newOtp = [...otp];
    newOtp[index] = cleaned.slice(-1);
    setOtp(newOtp);
    setError('');

    // Auto-advance cursor to next input cell
    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async () => {
    const enteredOtp = otp.join('').trim();
    if (enteredOtp.length !== 6) {
      setError('Please enter the complete 6-digit OTP code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isForgotPassword) {
        // FORGOT PASSWORD FLOW:
        // 1. Send entered OTP to the first dynamic link collected in Step 1 (verifyUrl)
        let result: any = null;
        // Universally extract token from dynamic URL path (e.g. /otpVerification/:token or /resetPassword/:token)
        const tempToken =
          verifyUrl && verifyUrl.includes('/')
            ? verifyUrl.split('/').pop()?.split('?')[0]
            : undefined;

        const otpPayload: any = {
          otp: enteredOtp,
          OTP: enteredOtp,
          email,
        };
        if (tempToken && tempToken.length > 20) {
          otpPayload.token = tempToken;
        }

        // ONLY call the dynamically collected verification/reset URL. Never call forgotpassword here!
        try {
          // Attempt PATCH first (backend uses PATCH for otpVerification/resetPassword)
          result = await apiClient.patch(
            verifyUrl,
            otpPayload,
            { tempToken, skipAuth: !tempToken }
          );
        } catch (patchErr: any) {
          if (patchErr?.status === 404 || patchErr?.status === 405) {
            // Fallback to POST on verifyUrl
            result = await apiClient.post(
              verifyUrl,
              otpPayload,
              { tempToken, skipAuth: !tempToken }
            );
          } else {
            let msg = patchErr?.data?.message || patchErr?.message;
            if (msg && (msg.includes('502') || msg.includes('Bad Gateway') || msg.includes('ERR_NGROK_8012'))) {
              msg = 'Backend server offline (HTTP 502). Please ensure the backend server is running on localhost:5000 and try again.';
            }
            throw new Error(msg || 'Invalid or expired OTP code. Please try again.');
          }
        }

        console.log('[EmailOtpScreen] OTP verification response:', JSON.stringify(result));

        // 2. Collect the SECOND dynamic link returned by backend after verification
        const secondDynamicLink =
          result?.verficationlink?.verificationLink ||
          result?.verificationlink?.verificationLink ||
          result?.verficationLink?.verificationLink ||
          result?.verificationLink?.verificationLink ||
          (typeof result?.verficationlink === 'string' ? result.verficationlink : null) ||
          (typeof result?.verificationlink === 'string' ? result.verificationlink : null) ||
          result?.resetLink ||
          result?.resetlink ||
          result?.url ||
          result?.link ||
          result?.resetPasswordUrl ||
          result?.reset_password_url ||
          result?.data?.resetLink ||
          result?.data?.url ||
          result?.data?.link ||
          result?.data?.verficationlink?.verificationLink ||
          result?.data?.verificationLink;

        const finalToken =
          result?.tokens?.access_token ||
          result?.accessToken ||
          result?.token ||
          (secondDynamicLink && secondDynamicLink.includes('/')
            ? secondDynamicLink.split('/').pop()?.split('?')[0]
            : undefined) ||
          tempToken;

        // 3. Navigate to ResetPasswordScreen with the SECOND dynamic link
        navigation.navigate('ResetPassword', {
          resetUrl: secondDynamicLink || verifyUrl,
          tempToken: finalToken,
          email,
        });
      } else {
        // REGISTRATION FLOW: Verify OTP and save authenticated session
        // Changed API call from emailverification to Otpverification
        let targetUrl = (verifyUrl || '/api/auth/Otpverification').trim();

        // Ensure any legacy emailverification / emailerification in URL is replaced with Otpverification
        targetUrl = targetUrl
          .replace(/emailverification/gi, 'Otpverification')
          .replace(/emailerification/gi, 'Otpverification');

        const tempToken =
          targetUrl && targetUrl.includes('/')
            ? targetUrl.split('/').pop()?.split('?')[0]
            : undefined;

        const otpPayload: any = {
          otp: enteredOtp,
          OTP: enteredOtp,
          email,
        };
        if (tempToken && tempToken.length > 20) {
          otpPayload.token = tempToken;
        }

        console.log(`[EmailOtpScreen] Verifying registration OTP on: ${targetUrl}`);

        let result: any = null;
        try {
          result = await apiClient.post(
            targetUrl,
            otpPayload,
            { skipAuth: true }
          );
        } catch (postErr: any) {
          if (postErr?.status === 404) {
            // If PascalCase route is 404, try lowercase otpverification
            const lowercaseUrl = targetUrl.replace('Otpverification', 'otpverification');
            console.log(`[EmailOtpScreen] Retrying with lowercase endpoint: ${lowercaseUrl}`);
            try {
              result = await apiClient.post(lowercaseUrl, otpPayload, { skipAuth: true });
            } catch (err2: any) {
              if (err2?.status === 404 || err2?.status === 405) {
                // Try PATCH if backend expects PATCH
                result = await apiClient.patch(targetUrl, otpPayload, { skipAuth: true });
              } else {
                throw err2;
              }
            }
          } else if (postErr?.status === 405) {
            result = await apiClient.patch(targetUrl, otpPayload, { skipAuth: true });
          } else {
            throw postErr;
          }
        }

        console.log('[EmailOtpScreen] Registration verify response:', JSON.stringify(result));

        const accessToken =
          result?.tokens?.access_token ||
          result?.tokens?.accessToken ||
          result?.accessToken ||
          result?.access_token ||
          result?.token ||
          result?.data?.tokens?.access_token ||
          result?.data?.accessToken ||
          result?.data?.access_token ||
          result?.data?.token;

        const recoveryToken =
          result?.tokens?.refresh_token ||
          result?.tokens?.refreshToken ||
          result?.tokens?.recovery_token ||
          result?.tokens?.recoveryToken ||
          result?.recoveryToken ||
          result?.recovery_token ||
          result?.refreshToken ||
          result?.refresh_token ||
          result?.data?.tokens?.refresh_token ||
          result?.data?.recoveryToken ||
          result?.data?.refreshToken;

        if (accessToken) {
          // Persist tokens securely using EncryptedSharedPreferences (Android) / Keychain (iOS)
          await saveAuthTokens(accessToken, recoveryToken, {
            email,
            full_name: fullName,
          });

          // Register device FCM token in background upon successful email OTP verification
          registerDeviceTokenWithBackend().catch((err) => {
            console.warn('[EmailOtpScreen] FCM device registration note:', err?.message || err);
          });

          Alert.alert(
            'Account Verified! 🎉',
            'Your email has been successfully verified. Welcome to UgO NITK!',
            [
              {
                text: 'Get Started',
                onPress: () => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Home' }],
                  });
                },
              },
            ]
          );
        } else {
          Alert.alert(
            'Verified Successfully! ✅',
            result?.message || 'Your account is verified. You can now sign in.',
            [
              {
                text: 'Sign In',
                onPress: () => navigation.navigate('Login'),
              },
            ]
          );
        }
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        err?.data?.message ||
        'Invalid or expired OTP. Please check and try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (timer > 0 || resending) return;
    setResending(true);
    setError('');

    try {
      if (isForgotPassword) {
        await apiClient.post(
          '/api/auth/forgotpassword',
          { email },
          { skipAuth: true }
        );
      }
      Alert.alert('OTP Resent', `A new verification code has been dispatched to ${email}`);
      setTimer(60);
    } catch (err: any) {
      setError('Failed to resend OTP. Please try again later.');
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Back Button */}
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Top Illustration & Title */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons
                name={isForgotPassword ? 'shield-checkmark-outline' : 'mail-unread-outline'}
                size={42}
                color={colors.accent}
              />
            </View>
            <Text style={styles.title}>
              {isForgotPassword ? 'Verify Reset Code' : 'OTP Verification'}
            </Text>
            <Text style={styles.subtitle}>
              {isForgotPassword
                ? 'We sent a 6-digit password reset code to'
                : 'We sent a 6-digit verification code to'}
            </Text>
            <View style={styles.emailBadge}>
              <Ionicons name="shield-checkmark" size={14} color={colors.accent} />
              <Text style={styles.emailText}>{email}</Text>
            </View>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} style={{ marginRight: 6 }} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>Enter 6-Digit OTP Code</Text>

            {/* OTP Input Grid */}
            <View style={styles.otpRow}>
              {otp.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(ref) => {
                    inputRefs.current[i] = ref;
                  }}
                  style={[
                    styles.otpBox,
                    digit ? styles.otpBoxFilled : null,
                    error ? styles.otpBoxError : null,
                  ]}
                  value={digit}
                  onChangeText={(val) => handleChange(val, i)}
                  onKeyPress={(e) => handleKeyPress(e, i)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                  textAlign="center"
                  autoFocus={i === 0}
                />
              ))}
            </View>

            <Button
              title={isForgotPassword ? 'Verify Code & Set Password' : 'Verify & Continue'}
              onPress={handleVerifyOtp}
              loading={loading}
              variant="accent"
              size="lg"
              style={{ marginTop: spacing.lg }}
            />

            {/* Resend Section */}
            <View style={styles.resendRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>
                  Resend code in <Text style={{ fontWeight: '800', color: colors.accent }}>{timer}s</Text>
                </Text>
              ) : (
                <TouchableOpacity
                  onPress={handleResendOtp}
                  disabled={resending}
                  activeOpacity={0.7}
                >
                  <Text style={styles.resendLink}>
                    Didn't receive the email? <Text style={styles.resendAction}>Resend OTP</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1.5,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  title: {
    fontSize: typography.h1.fontSize,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 6,
  },
  emailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: borderRadius.full,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent,
    marginLeft: 6,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceLight,
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  otpBoxFilled: {
    borderColor: colors.accent,
    backgroundColor: colors.white,
  },
  otpBoxError: {
    borderColor: colors.danger,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
  resendRow: {
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  timerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  resendLink: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  resendAction: {
    color: colors.accent,
    fontWeight: '700',
  },
});
