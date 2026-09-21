import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, profile, isAdmin, logout, refreshProfile } = useAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [hostel, setHostel] = useState(profile?.hostel || '');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
      setHostel(profile.hostel || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;

    if (!fullName.trim()) {
      Alert.alert('Validation', 'Full name cannot be empty.');
      return;
    }

    if (phone && !/^\d{10}$/.test(phone.trim())) {
      Alert.alert('Validation', 'Phone number must be a valid 10-digit number.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          hostel: hostel.trim()})
        .eq('id', user.id);

      if (error) throw error;

      await refreshProfile();
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (err: any) {
      Alert.alert('Update Error', err.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoggingOut(true);
            await logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } catch (err: any) {
            Alert.alert('Sign Out', err?.message || 'Logged out locally.');
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const netBalance = Number(profile?.net_balance || 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title="My Profile"
        showBack
        rightAction={{
          icon: isEditing ? 'close' : 'create-outline',
          onPress: () => setIsEditing(!isEditing)}}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* User Avatar Card */}
        <View style={styles.avatarCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarInitials}>
              {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>

          <Text style={styles.userName}>{profile?.full_name || 'NITK Student'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>

          <View style={styles.badgeRow}>
            <Badge variant="primary" label={isAdmin ? 'Admin' : 'NITK Member'} />
            {profile?.hostel && <Badge variant="neutral" label={profile.hostel} />}
          </View>
        </View>

        {/* Wallet / Net Balance Card */}
        <View style={styles.balanceCard}>
          <View>
            <Text style={styles.balanceLabel}>UgO Balance / Earnings</Text>
            <Text style={[styles.balanceAmount, netBalance < 0 && styles.negativeBalance]}>
              {netBalance < 0 ? `-₹${Math.abs(netBalance)}` : `₹${netBalance}`}
            </Text>
            {netBalance < 0 ? (
              <Text style={styles.dueHint}>Outstanding dues from overdue rentals</Text>
            ) : (
              <Text style={styles.creditHint}>Available for withdrawal or rides</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => navigation.navigate('BookingHistory')}
          >
            <Ionicons name="wallet-outline" size={18} color={colors.primary} />
            <Text style={styles.historyBtnText}>Wallet & Rides</Text>
          </TouchableOpacity>
        </View>

        {/* Edit or View Profile Form */}
        <View style={styles.formCard}>
          <Text style={styles.sectionHeader}>Personal Details</Text>

          {isEditing ? (
            <>
              <Input
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter full name"
              />

              <Input
                label="Phone Number"
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                keyboardType="phone-pad"
                maxLength={10}
              />

              <Input
                label="Hostel / Campus Residence"
                value={hostel}
                onChangeText={setHostel}
                placeholder="e.g. Mega Tower 1, Block 3"
              />

              <Button
                title="Save Profile Changes"
                onPress={handleSaveProfile}
                loading={saving}
                variant="accent"
                style={{ marginTop: spacing.md }}
              />
            </>
          ) : (
            <View style={styles.detailsList}>
              <View style={styles.detailItem}>
                <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Full Name</Text>
                  <Text style={styles.detailValue}>{profile?.full_name || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.detailItem}>
                <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Phone Number</Text>
                  <Text style={styles.detailValue}>{profile?.phone || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.detailItem}>
                <Ionicons name="home-outline" size={20} color={colors.textSecondary} />
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Hostel / Residence</Text>
                  <Text style={styles.detailValue}>{profile?.hostel || 'Not set'}</Text>
                </View>
              </View>

              <View style={styles.detailItem}>
                <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                <View style={styles.detailCol}>
                  <Text style={styles.detailLabel}>Email Address</Text>
                  <Text style={styles.detailValue}>{user?.email}</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Action Links */}
        <View style={styles.linksCard}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('BookingHistory')}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="time-outline" size={20} color={colors.primary} />
              <Text style={styles.linkText}>Rental History & Withdrawals</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('AdminDashboard')}
            >
              <View style={styles.linkLeft}>
                <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
                <Text style={styles.linkText}>Admin Portal</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('ResetPassword')}
            activeOpacity={0.8}
          >
            <View style={styles.linkLeft}>
              <Ionicons name="key-outline" size={20} color={colors.primary} />
              <Text style={styles.linkText}>Reset Password</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutRow}
            onPress={handleLogout}
            disabled={loggingOut}
            activeOpacity={0.7}
          >
            <View style={styles.linkLeft}>
              {loggingOut ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              )}
              <Text style={styles.logoutText}>
                {loggingOut ? 'Signing out...' : 'Sign Out'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl},
  avatarCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight},
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    ...shadows.md},
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white},
  userName: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary},
  userEmail: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 2},
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm},
  balanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm},
  balanceLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'},
  balanceAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.accent,
    marginTop: 2},
  negativeBalance: {
    color: colors.danger},
  dueHint: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 2},
  creditHint: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2},
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6},
  historyBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.primary},
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight},
  sectionHeader: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md},
  detailsList: {
    gap: spacing.md},
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md},
  detailCol: {
    flex: 1},
  detailLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary},
  detailValue: {
    fontSize: typography.body1.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 1},
  linksCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight},
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight},
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm},
  linkText: {
    fontSize: typography.body1.fontSize,
    color: colors.textPrimary,
    fontWeight: '600'},
  logoutRow: {
    padding: spacing.md},
  logoutText: {
    fontSize: typography.body1.fontSize,
    color: colors.danger,
    fontWeight: '700'}});
