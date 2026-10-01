import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import PasswordRequirements from '../../components/ui/PasswordRequirements';
import { isValidNitkEmail, getPasswordValidation, getPasswordErrorMessage } from '../../lib/validation';
import { apiClient } from '../../lib/apiClient';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const REGISTER_API_URL =
  process.env.EXPO_PUBLIC_REGISTER_API_URL ||
  'https://seducing-glowworm-booth.ngrok-free.dev/api/auth/register';

export default function SignUpScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hostel, setHostel] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    // 1. NITK Email constraint validation
    const cleanEmail = email.trim().toLowerCase();
    if (!isValidNitkEmail(cleanEmail)) {
      setError('Only official NITK email addresses ending with .nitk.edu.in are allowed (e.g. student@nitk.edu.in).');
      return;
    }

    // 2. Mobile number validation
    const rawDigits = phone.replace(/\D/g, '');
    if (!rawDigits || rawDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    const cleanNumber = parseInt(rawDigits.slice(-10), 10);

    // 3. Password constraints validation (capital, small, digit, special character, length)
    const passValidation = getPasswordValidation(password);
    if (!passValidation.isValid) {
      setError(getPasswordErrorMessage(passValidation) || 'Password does not meet security requirements.');
      return;
    }

    // 4. Confirm password match
    if (password !== confirmPass) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await apiClient.post(
        REGISTER_API_URL,
        {
          full_name: fullName.trim(),
          number: cleanNumber,
          email: email.trim(),
          password,
        },
        { skipAuth: true }
      );

      // Dynamic URL with embedded temporary JWT returned by backend:
      // format: { message: "...", verficationlink: { verificationLink: "..." } }
      let rawLink =
        result?.verficationlink?.verificationLink ||
        result?.verificationlink?.verificationLink ||
        result?.verficationLink?.verificationLink ||
        result?.verificationLink?.verificationLink ||
        (typeof result?.verficationlink === 'string' ? result.verficationlink : null) ||
        (typeof result?.verificationlink === 'string' ? result.verificationlink : null) ||
        (typeof result?.verificationLink === 'string' ? result.verificationLink : null) ||
        result?.url ||
        result?.verifyUrl ||
        result?.verificationUrl;

      let verifyUrl = typeof rawLink === 'string' ? rawLink.trim() : null;

      // Update API call from emailverification to Otpverification in account creation
      if (verifyUrl) {
        verifyUrl = verifyUrl
          .replace(/emailverification/gi, 'Otpverification')
          .replace(/emailerification/gi, 'Otpverification');
      } else {
        verifyUrl = '/api/auth/Otpverification';
      }

      navigation.navigate('EmailOtp', {
        verifyUrl,
        email: email.trim(),
        fullName: fullName.trim(),
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.backgroundDark} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join NITK Cycle Sharing</Text>
          </View>

          <View style={styles.formCard}>
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}



            <Input
              label="Full Name *"
              placeholder="e.g. Rahul Sharma"
              value={fullName}
              onChangeText={(text) => {
                setFullName(text);
                setError('');
              }}
            />

            <Input
              label="College Email *"
              placeholder="student@nitk.edu.in"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.emailConstraintBox}>
              <Ionicons
                name={
                  email.length === 0
                    ? 'information-circle-outline'
                    : isValidNitkEmail(email)
                    ? 'checkmark-circle'
                    : 'alert-circle-outline'
                }
                size={14}
                color={
                  email.length === 0
                    ? colors.textSecondary
                    : isValidNitkEmail(email)
                    ? '#10B981'
                    : colors.danger
                }
              />
              <Text
                style={[
                  styles.emailConstraintText,
                  email.length > 0 && isValidNitkEmail(email) && styles.emailConstraintValid,
                  email.length > 0 && !isValidNitkEmail(email) && styles.emailConstraintInvalid,
                ]}
              >
                Only .nitk.edu.in email addresses are allowed
              </Text>
            </View>

            <Input
              label="Phone Number *"
              placeholder="e.g. 9581798086"
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                setError('');
              }}
              keyboardType="phone-pad"
            />

            <Input
              label="Hostel / Campus Residence (Optional)"
              placeholder="e.g. Mega Tower 1"
              value={hostel}
              onChangeText={(text) => {
                setHostel(text);
                setError('');
              }}
            />

            <Input
              label="Password *"
              placeholder="Enter secure password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              isPassword
            />

            <PasswordRequirements password={password} showAlways={true} />

            <Input
              label="Confirm Password *"
              placeholder="Re-enter password"
              value={confirmPass}
              onChangeText={(text) => {
                setConfirmPass(text);
                setError('');
              }}
              isPassword
            />

            {confirmPass.length > 0 && (
              <View style={styles.passwordMatchNotice}>
                <Ionicons
                  name={password === confirmPass ? 'checkmark-circle' : 'alert-circle-outline'}
                  size={14}
                  color={password === confirmPass ? '#10B981' : colors.danger}
                />
                <Text
                  style={[
                    styles.passwordMatchNoticeText,
                    password === confirmPass ? styles.passwordMatchValid : styles.passwordMatchInvalid,
                  ]}
                >
                  {password === confirmPass ? 'Passwords match' : 'Passwords do not match'}
                </Text>
              </View>
            )}

            <Button
              title="Create Account"
              onPress={handleSignUp}
              loading={loading}
              variant="accent"
              size="lg"
              style={{ marginTop: spacing.md }}
            />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.footerLink}>Sign In</Text>
              </TouchableOpacity>
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
    backgroundColor: colors.backgroundDark},
  flex: {
    flex: 1},
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: spacing.xxl},
  header: {
    alignItems: 'center',
    marginVertical: spacing.lg},
  title: {
    fontSize: typography.h1.fontSize,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.accent,
    marginTop: 4,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.danger},
  errorText: {
    color: colors.danger,
    fontSize: typography.caption.fontSize},
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl},
  footerText: {
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize},
  footerLink: {
    color: colors.accent,
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
  },
  emailConstraintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -8,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  emailConstraintText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emailConstraintValid: {
    color: '#065F46',
    fontWeight: '600',
  },
  emailConstraintInvalid: {
    color: colors.danger,
    fontWeight: '500',
  },
  passwordMatchNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -8,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  passwordMatchNoticeText: {
    fontSize: 12,
  },
  passwordMatchValid: {
    color: '#065F46',
    fontWeight: '600',
  },
  passwordMatchInvalid: {
    color: colors.danger,
    fontWeight: '500',
  },
});
