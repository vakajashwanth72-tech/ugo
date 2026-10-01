import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import Header from '../../components/ui/Header';
import NotificationBell from '../../components/NotificationBell';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChoiceScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { profile, user, isAdmin } = useAuth();
  const { unreadCount } = useNotifications();

  const firstName = profile?.full_name?.split(' ')[0] || 'Student';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <Header
        showLogo
        rightComponent={
          <NotificationBell
            unreadCount={unreadCount}
            onPress={() => navigation.navigate('Notifications')}
          />
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Greeting Banner */}
        <View style={styles.welcomeBanner}>
          <Text style={styles.welcomeTitle}>Welcome, {firstName}! 👋</Text>
          <Text style={styles.welcomeSub}>
            NITK Surathkal • Peer-to-Peer Cycle Sharing Network
          </Text>
        </View>

        {/* Choice Cards */}
        <View style={styles.cardsGrid}>
          {/* Rent a Cycle */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Home')}
          >
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(37, 99, 235, 0.1)' }]}>
              <Ionicons name="bicycle" size={32} color={colors.primary} />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Rent a Cycle</Text>
              <Text style={styles.cardDesc}>
                Browse available cycles across campus hostels, check rates, and rent.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>

          {/* Ongoing Rentals */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('OngoingRentals')}
          >
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
              <Ionicons name="time" size={32} color={colors.accent} />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Ongoing Rentals</Text>
              <Text style={styles.cardDesc}>
                Coordinate pickup, chat & voice call, track ride timer, or return cycle.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>

          {/* Cycle Owner */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CycleOwner')}
          >
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
              <Ionicons name="business" size={32} color={colors.warning} />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Cycle Owner Portal</Text>
              <Text style={styles.cardDesc}>
                List your bicycle, toggle active availability, and earn from idle cycles.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Notifications')}
          >
            <View style={[styles.iconCircle, { backgroundColor: 'rgba(139, 92, 246, 0.1)' }]}>
              <Ionicons name="notifications" size={32} color="#8B5CF6" />
            </View>
            <View style={styles.cardTextContainer}>
              <Text style={styles.cardTitle}>Notifications & Requests</Text>
              <Text style={styles.cardDesc}>
                Accept or decline rental requests and view pickup/return OTP alerts.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
          </TouchableOpacity>

          {/* Admin Dashboard (if admin) */}
          {isAdmin && (
            <TouchableOpacity
              style={[styles.card, styles.adminCard]}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AdminDashboard')}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="shield-checkmark" size={32} color={colors.danger} />
              </View>
              <View style={styles.cardTextContainer}>
                <Text style={styles.cardTitle}>Admin Dashboard</Text>
                <Text style={styles.cardDesc}>
                  Verify new cycle listings and review campus platform analytics.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl},
  welcomeBanner: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md},
  welcomeTitle: {
    fontSize: typography.h1.fontSize,
    fontWeight: '800',
    color: colors.white},
  welcomeSub: {
    fontSize: typography.caption.fontSize,
    color: colors.accent,
    marginTop: 4,
    fontWeight: '600'},
  cardsGrid: {
    gap: spacing.md},
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm},
  adminCard: {
    borderColor: 'rgba(239, 68, 68, 0.3)'},
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md},
  cardTextContainer: {
    flex: 1,
    paddingRight: spacing.sm},
  cardTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2},
  cardDesc: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    lineHeight: 16}});
