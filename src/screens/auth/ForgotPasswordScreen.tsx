import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiClient } from '../../lib/apiClient';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ForgotPasswordRouteProp = RouteProp<RootStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ForgotPasswordRouteProp>();

  const [email, setEmail] = useState(route.params?.email || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestOtp = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your registered college email.');
      return;
    }

    if (!cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Dispatch password recovery request to backend endpoint ending in forgotpassword
      const result = await apiClient.post(
        '/api/auth/forgotpassword',
        {
          email: cleanEmail,
        },
        { skipAuth: true }
      );

      // Backend returns verification link with embedded JWT token:
      // e.g. { message: "otp has been sent to your email", verficationlink: { verificationLink: "https://.../api/auth/resetPassword/<token>" } }
      const rawLink =
        result?.verficationlink?.verificationLink ||
        result?.verificationlink?.verificationLink ||
        result?.verficationLink?.verificationLink ||
        result?.verificationLink?.verificationLink ||
        (typeof result?.verficationlink === 'string' ? result.verficationlink : null) ||
        (typeof result?.verificationlink === 'string' ? result.verificationlink : null) ||
        result?.url ||
        result?.link ||
        result?.resetUrl ||
        result?.resetPasswordUrl ||
        '/api/auth/forgotpassword';

      // Navigate directly to dedicated OTP entering screen
      navigation.navigate('EmailOtp', {
        email: cleanEmail,
        verifyUrl: rawLink,
        isForgotPassword: true,
      });
    } catch (err: any) {
      const msg =
        err?.data?.message ||
        err?.message ||
        'Unable to send reset OTP. Please verify your email and network connection.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="Forgot Password" showBack />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Icon & Info */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={36} color={colors.primary} />
            </View>
            <Text style={styles.title}>Recover Your Account</Text>
            <Text style={styles.subtitle}>
              Enter your registered NITK college email. We will send a verification code to reset your password.
            </Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Form Card */}
          <View style={styles.formCard}>
            <Input
              label="College Email"
              placeholder="student@nitk.edu.in"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Button
              title="Send Verification OTP"
              onPress={handleRequestOtp}
              loading={loading}
              variant="primary"
              size="lg"
              style={{ marginTop: spacing.md }}
            />

            <TouchableOpacity
              style={styles.backToLoginRow}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={16} color={colors.primary} />
              <Text style={styles.backToLoginText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.danger,
    fontSize: typography.caption.fontSize,
    fontWeight: '500',
  },
  backToLoginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
  },
  backToLoginText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
