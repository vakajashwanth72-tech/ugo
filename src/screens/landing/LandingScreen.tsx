import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LandingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const handleGetStarted = () => {
    navigation.navigate('Home');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* TOP BRAND BAR */}
      <View style={styles.topBar}>
        <View style={styles.brandContainer}>
          <Text style={styles.brandNitk}>
            NITK <Text style={styles.brandSharing}>CYCLE SHARING</Text>
          </Text>
        </View>
      </View>

      {/* MAIN BODY */}
      <View style={styles.contentContainer}>
        {/* LOGO WITH GLOW */}
        <View style={styles.logoWrapper}>
          <View style={styles.logoGlowCircle} />
          <Image
            source={require('../../../assets/UGO_logo.jpeg')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        {/* WELCOME HEADINGS */}
        <View style={styles.textContainer}>
          <Text style={styles.headline}>Your Ride.</Text>
          <Text style={styles.headline}>Our Campus.</Text>
          <Text style={[styles.headline, styles.greenHeadline]}>One Community.</Text>
          <Text style={styles.tagline}>Share. Ride. Explore.</Text>
        </View>

        {/* ACTION BUTTONS */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGetStarted}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {!user && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Sign In / Register</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Welcome to NITK Cycle Sharing</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandNitk: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 1,
  },
  brandSharing: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.primary,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logoGlowCircle: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: 'rgba(21, 148, 71, 0.12)',
    transform: [{ scale: 1.15 }],
  },
  logoImage: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
    borderColor: colors.primary,
    ...shadows.lg,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  headline: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 42,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  greenHeadline: {
    color: colors.primary,
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginTop: spacing.md,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  actionsContainer: {
    width: '100%',
    maxWidth: 320,
    gap: spacing.sm,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: 15,
    ...shadows.md,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryBtnText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
});
