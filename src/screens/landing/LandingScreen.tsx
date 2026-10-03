import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { getAccessToken } from '../../lib/secureStorage';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function LandingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const isFocused = useIsFocused();
  const { user } = useAuth();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  // Check access token dynamically whenever screen is focused or user changes
  useEffect(() => {
    let isMounted = true;
    const checkToken = async () => {
      try {
        const token = await getAccessToken();
        if (isMounted) {
          setHasToken(Boolean(token && token.trim()));
        }
      } catch {
        if (isMounted) {
          setHasToken(false);
        }
      }
    };

    checkToken();

    return () => {
      isMounted = false;
    };
  }, [isFocused, user]);

  const isUserDetected = Boolean(user || hasToken);

  const handleGetStarted = () => {
    navigation.navigate('Home');
  };

  const handleSignIn = () => {
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />

      {/* BACKGROUND ORGANIC DECORATIVE SHAPES */}
      <View style={styles.bgBlobTopLeft} pointerEvents="none" />
      <View style={styles.bgDotTopLeft} pointerEvents="none" />
      <View style={styles.bgBlobRight} pointerEvents="none" />
      <View style={styles.bgDotRight} pointerEvents="none" />
      <View style={styles.bgBlobBottomRight} pointerEvents="none" />
      <View style={styles.bgBlobBottomLeft} pointerEvents="none" />

      {/* DECORATIVE LEAVES (Bottom-Left) */}
      <View style={styles.leavesContainer} pointerEvents="none">
        <Ionicons
          name="leaf"
          size={42}
          color="#7DD3FC"
          style={[styles.leafItem, { transform: [{ rotate: '-45deg' }] }]}
        />
        <Ionicons
          name="leaf"
          size={30}
          color="#38BDF8"
          style={[styles.leafItem, { transform: [{ rotate: '-15deg' }], marginTop: -16, marginLeft: 16 }]}
        />
        <Ionicons
          name="leaf"
          size={24}
          color="#BAE6FD"
          style={[styles.leafItem, { transform: [{ rotate: '25deg' }], marginTop: -14, marginLeft: 28 }]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* 1. TOP BRAND HEADER */}
        <View style={styles.headerContainer}>
          <Text style={styles.brandTitle}>
            <Text style={styles.brandDark}>NITK </Text>
            <Text style={styles.brandBlue}>CYCLE SHARING</Text>
          </Text>
        </View>

        {/* 2. GLOWING CIRCULAR EMBLEM LOGO */}
        <View style={styles.logoSection}>
          <View style={styles.logoOuterGlow}>
            <View style={styles.logoInnerGlow}>
              <Image
                source={require('../../../assets/app_logo_badge.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        {/* 3. HEADLINE & TAGLINE */}
        <View style={styles.headlineSection}>
          <Text style={styles.headlineDark}>Your Ride.</Text>
          <Text style={styles.headlineDark}>Our Campus.</Text>
          <Text style={styles.headlineBlue}>One Community.</Text>
          <Text style={styles.subHeadline}>Share. Ride. Explore.</Text>
        </View>

        {/* 4. FEATURE ICONS ROW (Share, Campus, Explore) */}
        <View style={styles.featuresRow}>
          {/* Share */}
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}>
              <Ionicons name="bicycle" size={30} color="#0084FF" />
            </View>
            <Text style={styles.featureLabel}>Share</Text>
          </View>

          {/* Campus */}
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}>
              <Ionicons name="people" size={28} color="#0084FF" />
            </View>
            <Text style={styles.featureLabel}>Campus</Text>
          </View>

          {/* Explore */}
          <View style={styles.featureItem}>
            <View style={styles.featureIconBox}>
              <Ionicons name="location-sharp" size={28} color="#0084FF" />
            </View>
            <Text style={styles.featureLabel}>Explore</Text>
          </View>
        </View>

        {/* 5. ACTION BUTTONS */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleGetStarted}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={styles.btnIcon} />
          </TouchableOpacity>

          {/* Dynamically show Sign In / Register ONLY if no user is detected by access token */}
          {!isUserDetected && (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleSignIn}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>Sign In / Register</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 6. FOOTER DIVIDER */}
        <View style={styles.footerSection}>
          <View style={styles.footerDividerLine} />
          <Text style={styles.footerText}>Welcome to NITK Cycle Sharing</Text>
          <View style={styles.footerDividerLine} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    position: 'relative',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
    zIndex: 2,
  },

  /* BACKGROUND ORGANIC ELEMENTS */
  bgBlobTopLeft: {
    position: 'absolute',
    top: -90,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#E0F2FE',
    opacity: 0.65,
    zIndex: 1,
  },
  bgDotTopLeft: {
    position: 'absolute',
    top: 135,
    left: 32,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#BAE6FD',
    opacity: 0.75,
    zIndex: 1,
  },
  bgBlobRight: {
    position: 'absolute',
    top: '25%',
    right: -90,
    width: 230,
    height: 310,
    borderRadius: 115,
    backgroundColor: '#E0F2FE',
    opacity: 0.5,
    zIndex: 1,
  },
  bgDotRight: {
    position: 'absolute',
    top: '43%',
    right: 32,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#BAE6FD',
    opacity: 0.6,
    zIndex: 1,
  },
  bgBlobBottomRight: {
    position: 'absolute',
    bottom: -60,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#E0F2FE',
    opacity: 0.55,
    zIndex: 1,
  },
  bgBlobBottomLeft: {
    position: 'absolute',
    bottom: -40,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#E0F2FE',
    opacity: 0.5,
    zIndex: 1,
  },
  leavesContainer: {
    position: 'absolute',
    bottom: 4,
    left: 8,
    zIndex: 1,
    opacity: 0.65,
  },
  leafItem: {
    opacity: 0.8,
  },

  /* 1. TOP BRAND HEADER */
  headerContainer: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  brandTitle: {
    letterSpacing: 1.1,
  },
  brandDark: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  brandBlue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0084FF',
  },

  /* 2. GLOWING CIRCULAR EMBLEM LOGO */
  logoSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoOuterGlow: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  logoInnerGlow: {
    width: 152,
    height: 152,
    borderRadius: 76,
    backgroundColor: 'rgba(0, 132, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 144,
    height: 144,
  },

  /* 3. HEADLINES */
  headlineSection: {
    alignItems: 'center',
    marginBottom: 26,
  },
  headlineDark: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 40,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  headlineBlue: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0084FF',
    lineHeight: 40,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  subHeadline: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 12,
    letterSpacing: 0.4,
    textAlign: 'center',
  },

  /* 4. FEATURE ICONS ROW */
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    marginBottom: 32,
    width: '100%',
    maxWidth: 320,
  },
  featureItem: {
    alignItems: 'center',
  },
  featureIconBox: {
    width: 62,
    height: 62,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 8,
    letterSpacing: 0.2,
  },

  /* 5. ACTION BUTTONS */
  actionsSection: {
    width: '100%',
    maxWidth: 330,
    gap: 12,
    marginBottom: 24,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0084FF',
    borderRadius: 20,
    paddingVertical: 15,
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnIcon: {
    marginLeft: 8,
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#7DD3FC',
  },
  secondaryBtnText: {
    color: '#0084FF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  /* 6. FOOTER DIVIDER */
  footerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  footerDividerLine: {
    width: 38,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    marginHorizontal: 10,
  },
});
