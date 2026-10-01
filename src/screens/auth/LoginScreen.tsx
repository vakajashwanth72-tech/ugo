import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { apiClient } from '../../lib/apiClient';
import { saveAuthTokens } from '../../lib/secureStorage';
import { registerDeviceTokenWithBackend } from '../../lib/pushNotifications';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [email, setEmail] = useState(__DEV__ ? 'vakareddyjaswanth.251cs164@nitk.edu.in' : '');
  const [password, setPassword] = useState(__DEV__ ? '#2125@2125Aa' : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    const cleanPassword = password;

    if (!cleanEmail || !cleanPassword) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await apiClient.post(
        '/api/auth/login',
        {
          email: cleanEmail,
          password: cleanPassword,
        },
        { skipAuth: true }
      );

      const accessToken =
        result?.tokens?.access_token ||
        result?.tokens?.accessToken ||
        result?.accessToken ||
        result?.access_token ||
        result?.token ||
        result?.data?.tokens?.access_token ||
        result?.data?.token ||
        result?.data?.accessToken;

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
        result?.data?.refreshToken;

      if (!accessToken) {
        throw new Error(result?.message || 'Login failed: no access token returned.');
      }

      // Fetch user role from output: res.role or res.user.role
      const rawRole =
        result?.role ??
        result?.user?.role ??
        result?.data?.role ??
        result?.data?.user?.role ??
        'student';
      const userRole = String(rawRole).trim().toLowerCase() === 'admin' ? 'admin' : 'student';

      // Store tokens securely in EncryptedSharedPreferences (Android Keystore AES-256 GCM)
      await saveAuthTokens(accessToken, recoveryToken, {
        email: cleanEmail,
        ...result?.user,
        role: userRole,
      });

      // Register device FCM token in background upon successful login
      registerDeviceTokenWithBackend().catch((err) => {
        console.warn('[LoginScreen] FCM device registration note:', err?.message || err);
      });

      // Navigate according to user role: admins see their dashboard & properties, students see student feed
      if (userRole === 'admin') {
        navigation.reset({ index: 0, routes: [{ name: 'AdminDashboard' }] });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      }
    } catch (err: any) {
      const errorMsg =
        err?.data?.message ||
        err?.message ||
        'Login failed. Please check your credentials.';
      setError(errorMsg);
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
          {/* Logo & Header */}
          <View style={styles.header}>
            <Image
              source={require('../../../assets/UGO_logo.jpeg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>UgO NITK</Text>
            <Text style={styles.subtitle}>Campus Bicycle Sharing Network</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Sign In</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

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

            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setError('');
              }}
              isPassword
            />

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('ForgotPassword')}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>



            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              variant="accent"
              size="lg"
              style={{ marginTop: spacing.sm }}
            />

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                <Text style={styles.footerLink}>Register here</Text>
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
    justifyContent: 'center'},
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl},
  logo: {
    width: 84,
    height: 84,
    borderRadius: 20,
    marginBottom: spacing.sm},
  title: {
    fontSize: typography.h1.fontSize,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: 1,
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
  formTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.lg},
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
  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    marginTop: -spacing.xs},
  forgotText: {
    color: colors.accent,
    fontSize: typography.caption.fontSize,
    fontWeight: '600'},
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
    fontWeight: '700'}});
