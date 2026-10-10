import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
  Image,
  RefreshControl,
  Switch,
  InteractionManager,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { apiClient, normalizeProfileData, UserProfileData } from '../../lib/apiClient';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import RentalBottomNav from '../../components/RentalBottomNav';
import SwipeableScreenWrapper from '../../components/SwipeableScreenWrapper';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { invalidateCycleCache } from '../../hooks/useAvailableCycles';
import { invalidateMyCyclesCache } from '../../hooks/useMyCycles';
import { invalidateOngoingRentalsCache } from '../rentals/OngoingRentalsScreen';
import { invalidateNotificationsCache } from '../../hooks/useNotifications';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Module-level in-memory cache for Profile (persists across tab switches)
let memoryCachedProfile: UserProfileData | null = null;
let lastProfileFetchedAt = 0;
const PROFILE_STALE_TIME_MS = 2 * 60 * 1000; // 2 minutes

function hasProfileChanged(oldP: UserProfileData | null, newP: UserProfileData | null): boolean {
  if (!oldP && !newP) return false;
  if (!oldP || !newP) return true;
  return (
    oldP.full_name !== newP.full_name ||
    oldP.phone !== newP.phone ||
    oldP.hostel !== newP.hostel ||
    oldP.avatar_url !== newP.avatar_url ||
    oldP.net_balance !== newP.net_balance ||
    oldP.email !== newP.email
  );
}

export function invalidateProfileCache(): void {
  lastProfileFetchedAt = 0;
}

export function getMemoryCachedProfile(): UserProfileData | null {
  return memoryCachedProfile;
}

export async function preloadProfile(): Promise<void> {
  const now = Date.now();
  if (memoryCachedProfile !== null && now - lastProfileFetchedAt < PROFILE_STALE_TIME_MS) {
    return;
  }
  try {
    const res = await apiClient.getProfile();
    const data = normalizeProfileData(res);
    if (data) {
      memoryCachedProfile = data;
      lastProfileFetchedAt = Date.now();
    }
  } catch {}
}

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isAdmin, logout } = useAuth();
  const { themeMode, isDark, palette, colors, availablePalettes, toggleTheme, setPalette } = useTheme();

  // 1. Instant Cache Reads: Initialize synchronously from memory cache
  const [profileData, setProfileData] = useState<UserProfileData | null>(() => memoryCachedProfile);
  const [loading, setLoading] = useState<boolean>(() => memoryCachedProfile === null);
  const [refreshing, setRefreshing] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(() => memoryCachedProfile?.full_name || '');
  const [phone, setPhone] = useState(() => memoryCachedProfile?.phone || '');
  const [hostel, setHostel] = useState(() => memoryCachedProfile?.hostel || '');
  const [chosenAvatar, setChosenAvatar] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isFetchingRef = useRef(false);

  // Helper to extract previously collected profile details, falling back to user metadata
  const getCollectedDetails = useCallback(() => {
    const meta = (user as any)?.user_metadata || {};
    const storedName =
      profileData?.full_name ||
      meta.full_name ||
      meta.name ||
      user?.email?.split('@')[0] ||
      '';
    const storedPhone = profileData?.phone || meta.phone || '';
    const storedHostel = profileData?.hostel || meta.hostel || '';
    const storedAvatar = profileData?.avatar_url || meta.avatar_url || null;

    return {
      full_name: storedName,
      phone: storedPhone,
      hostel: storedHostel,
      avatar_url: storedAvatar,
    };
  }, [profileData, user]);

  const enterEditMode = useCallback(() => {
    const collected = getCollectedDetails();
    setFullName(collected.full_name);
    setPhone(collected.phone);
    setHostel(collected.hostel);
    setChosenAvatar(undefined); // undefined signifies photo was not modified in this edit session
    setIsEditing(true);
  }, [getCollectedDetails]);

  const cancelEditMode = useCallback(() => {
    const collected = getCollectedDetails();
    setFullName(collected.full_name);
    setPhone(collected.phone);
    setHostel(collected.hostel);
    setChosenAvatar(undefined);
    setIsEditing(false);
  }, [getCollectedDetails]);

  // Fetches live profile data from backend GET /api/profile
  const fetchProfileFromApi = useCallback(async (isPullToRefresh = false) => {
    if (isFetchingRef.current && !isPullToRefresh) {
      console.log('[ProfileScreen] Profile fetch already running, skipping duplicate call.');
      return;
    }
    isFetchingRef.current = true;

    try {
      if (isPullToRefresh) {
        setRefreshing(true);
      } else if (memoryCachedProfile === null) {
        setLoading(true);
      }
      console.log('[ProfileScreen] Silently fetching profile from GET /api/profile with session access token...');
      const res = await apiClient.getProfile();
      console.log('[ProfileScreen] Received profile response from backend:', res);

      const data = normalizeProfileData(res);
      if (data) {
        const changed = hasProfileChanged(memoryCachedProfile, data);
        memoryCachedProfile = data;
        lastProfileFetchedAt = Date.now();

        if (changed || !profileData) {
          console.log('[ProfileScreen] Profile data updated. Updating UI smoothly.');
          setProfileData(data);
          const meta = (user as any)?.user_metadata || {};
          const initialName = data.full_name || meta.full_name || meta.name || user?.email?.split('@')[0] || '';
          const initialPhone = data.phone || meta.phone || '';
          const initialHostel = data.hostel || meta.hostel || '';
          setFullName(initialName);
          setPhone(initialPhone);
          setHostel(initialHostel);
        } else {
          console.log('[ProfileScreen] Profile data is identical, refreshed timestamp.');
        }
      }
    } catch (err: any) {
      console.error('[ProfileScreen] Error fetching profile from /api/profile:', err?.message || err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, profileData]);

  // 2. Smart Expiry (staleTime: 2 minutes) & Tab Switch Handling
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      const isFresh = memoryCachedProfile !== null && (now - lastProfileFetchedAt < PROFILE_STALE_TIME_MS);

      if (isFresh) {
        const ageSec = Math.round((now - lastProfileFetchedAt) / 1000);
        console.log(`[ProfileScreen] Memory cache is FRESH (${ageSec}s old < 120s). ZERO network requests triggered on tab switch.`);
        if (memoryCachedProfile && memoryCachedProfile !== profileData) {
          setProfileData(memoryCachedProfile);
        }
        setLoading(false);
        return;
      }

      // Defer API processing until touch-swipe animation settles!
      console.log(
        memoryCachedProfile === null
          ? '[ProfileScreen] Initial load, fetching profile...'
          : `[ProfileScreen] Cache is stale (${Math.round((now - lastProfileFetchedAt) / 1000)}s old). Revalidating in background after interactions...`
      );
      const task = InteractionManager.runAfterInteractions(() => {
        fetchProfileFromApi(false);
      });
      return () => task.cancel();
    }, [fetchProfileFromApi, profileData])
  );

  const collected = getCollectedDetails();
  const currentAvatar = chosenAvatar !== undefined ? chosenAvatar : collected.avatar_url;

  const handlePickAvatar = () => {
    Alert.alert('Profile Avatar', 'Choose how you want to update your avatar', [
      {
        text: 'Choose from Gallery',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Gallery access is needed to select a profile photo.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets && result.assets[0]) {
              const asset = result.assets[0];
              if (asset.base64) {
                setChosenAvatar(`data:image/jpeg;base64,${asset.base64}`);
              } else if (asset.uri) {
                setChosenAvatar(asset.uri);
              }
            }
          } catch (err: any) {
            console.warn('[ProfileScreen] Pick image error:', err);
            Alert.alert('Error', 'Failed to pick image from gallery.');
          }
        },
      },
      {
        text: 'Take Photo',
        onPress: async () => {
          try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera access is needed to take a photo.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets && result.assets[0]) {
              const asset = result.assets[0];
              if (asset.base64) {
                setChosenAvatar(`data:image/jpeg;base64,${asset.base64}`);
              } else if (asset.uri) {
                setChosenAvatar(asset.uri);
              }
            }
          } catch (err: any) {
            console.warn('[ProfileScreen] Camera photo error:', err);
            Alert.alert('Error', 'Failed to take photo with camera.');
          }
        },
      },
      ...(currentAvatar
        ? [
            {
              text: 'Remove Avatar',
              style: 'destructive' as const,
              onPress: () => setChosenAvatar(null),
            },
          ]
        : []),
      {
        text: 'Cancel',
        style: 'cancel' as const,
      },
    ]);
  };

  const handleSaveProfile = async () => {
    const currentCollected = getCollectedDetails();

    // 1. Full name: use user input if modified, otherwise preserve before-collected details
    const trimmedName = fullName.trim();
    const finalFullName = trimmedName || currentCollected.full_name || 'NITK Student';

    // 2. Phone: validate 10 digits if modified
    const trimmedPhone = phone.trim();
    if (trimmedPhone && !/^\d{10}$/.test(trimmedPhone)) {
      Alert.alert('Validation', 'Phone number must be a valid 10-digit number.');
      return;
    }
    // If user edited phone: use trimmedPhone; if user didn't touch it: preserve currentCollected.phone
    const finalPhone = trimmedPhone ? trimmedPhone : (phone === '' && currentCollected.phone ? null : (currentCollected.phone || null));

    // 3. Hostel:
    const trimmedHostel = hostel.trim();
    const finalHostel = trimmedHostel ? trimmedHostel : (hostel === '' && currentCollected.hostel ? null : (currentCollected.hostel || null));

    // 4. Avatar URL:
    // If chosenAvatar is a string: user selected a new photo from gallery/camera
    // If chosenAvatar is null: user explicitly removed avatar
    // If chosenAvatar is undefined: user did NOT change photo -> send before-collected avatar (or null if none)
    let finalAvatar: string | null = null;
    if (typeof chosenAvatar === 'string') {
      finalAvatar = chosenAvatar;
    } else if (chosenAvatar === null) {
      finalAvatar = null;
    } else {
      finalAvatar = currentCollected.avatar_url || null;
    }

    setSaving(true);
    try {
      const editPayload = {
        full_name: finalFullName,
        phone: finalPhone,
        avatar_url: finalAvatar,
        hostel: finalHostel,
      };

      console.log('[ProfileScreen] Calling PATCH /api/profile/edit-profile with payload:', {
        ...editPayload,
        avatar_url: editPayload.avatar_url
          ? editPayload.avatar_url.length > 50
            ? `${editPayload.avatar_url.substring(0, 50)}...`
            : editPayload.avatar_url
          : null,
      });

      const res = await apiClient.editProfile(editPayload);
      console.log('[ProfileScreen] editProfile response from backend:', res);

      // Optimistically update state and in-memory cache
      const updatedProfileObj: UserProfileData = {
        created_at: profileData?.created_at || null,
        full_name: editPayload.full_name,
        phone: editPayload.phone,
        avatar_url: editPayload.avatar_url,
        hostel: editPayload.hostel,
        updated_at: new Date().toISOString(),
        email: profileData?.email || user?.email || '',
        net_balance: profileData?.net_balance || 0,
      };
      setProfileData(updatedProfileObj);
      memoryCachedProfile = updatedProfileObj;
      lastProfileFetchedAt = Date.now();

      setChosenAvatar(undefined);
      setIsEditing(false);
      Alert.alert('Success', 'Profile updated successfully.');
    } catch (err: any) {
      console.error('[ProfileScreen] Error updating profile:', err);
      Alert.alert('Update Error', err?.message || 'Unable to update profile.');
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
            memoryCachedProfile = null;
            lastProfileFetchedAt = 0;
            invalidateCycleCache(true);
            invalidateMyCyclesCache(true);
            invalidateOngoingRentalsCache(true);
            invalidateNotificationsCache();
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

  const rawBal =
    profileData?.net_balance !== undefined && profileData?.net_balance !== null
      ? profileData.net_balance
      : 0;
  const netBalance = isNaN(Number(rawBal)) ? 0 : Number(rawBal);
  const displayName = profileData?.full_name || collected.full_name || user?.email?.split('@')[0] || 'NITK Student';
  const displayEmail = profileData?.email || user?.email || '';
  const displayPhone = profileData?.phone || collected.phone || 'Not set';
  const displayHostel = profileData?.hostel || collected.hostel || 'Not set';

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://vakajashwanth72-tech.github.io/ugo/').catch((err) => {
      console.warn('Could not open privacy policy URL:', err);
      Alert.alert('Privacy Policy', 'Please visit https://vakajashwanth72-tech.github.io/ugo/ in your browser.');
    });
  };

  const handleRequestAccountDeletion = () => {
    Alert.alert(
      'Account & Data Deletion',
      'Under Google Play policy and UgO guidelines, you can permanently delete your account and personal records.\n\n' +
      '• Profile, cycle listings, and verification photos are permanently purged within 7 business days.\n' +
      '• Statutory payment audit logs are retained as required by Indian financial law.\n\n' +
      'How would you like to proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Web Portal',
          onPress: () => {
            Linking.openURL('https://vakajashwanth72-tech.github.io/ugo/account-deletion.html').catch((err) => {
              console.warn('Could not open deletion URL:', err);
            });
          },
        },
        {
          text: 'Send Email Request',
          style: 'destructive',
          onPress: () => {
            const subject = encodeURIComponent(`UgO Account Deletion Request - ${displayName}`);
            const body = encodeURIComponent(
              `Dear UgO Cycle Sharing Team,\n\n` +
              `I hereby request the permanent deletion of my UgO NITK account and associated data.\n\n` +
              `Account Details:\n` +
              `- Full Name: ${displayName}\n` +
              `- Registered Email: ${displayEmail}\n` +
              `- Registered Phone: ${displayPhone}\n` +
              `- Hostel / Room: ${displayHostel}\n\n` +
              `I understand that active data will be purged within 7 business days, while statutory payment audit records are retained as required by law.\n\n` +
              `Thank you,\n${displayName}`
            );
            Linking.openURL(`mailto:ugocyclesharing@gmail.com?subject=${subject}&body=${body}`).catch(() => {
              Alert.alert(
                'Email Client Unavailable',
                'Please send an email from your registered address to ugocyclesharing@gmail.com with your request.'
              );
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <Header
        title={isEditing ? 'Edit Profile' : 'My Profile'}
        showBack
        rightAction={{
          icon: isEditing ? 'close' : 'create-outline',
          onPress: isEditing ? cancelEditMode : enterEditMode,
        }}
      />

      <SwipeableScreenWrapper currentTab="profile" disableSwipe={isEditing}>
        <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchProfileFromApi(true)}
            colors={[colors.accent]}
            tintColor={colors.accent}
          />
        }
      >
        {loading && !profileData ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading profile details...</Text>
          </View>
        ) : (
          <>
            {/* User Avatar Card */}
            <View style={[styles.avatarCard, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                activeOpacity={isEditing ? 0.7 : 1}
                onPress={isEditing ? handlePickAvatar : undefined}
                style={styles.avatarCircleContainer}
              >
                <View style={[styles.avatarCircle, { backgroundColor: colors.primary }]}>
                  {currentAvatar ? (
                    <Image source={{ uri: currentAvatar }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitials}>
                      {(displayName || displayEmail || 'U')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
                {isEditing && (
                  <View style={[styles.avatarEditBadge, { backgroundColor: colors.accent, borderColor: colors.surface }]}>
                    <Ionicons name="camera" size={16} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>

              {isEditing && (
                <TouchableOpacity onPress={handlePickAvatar} style={[styles.changeAvatarBtn, { backgroundColor: colors.surfaceLight }]}>
                  <Ionicons name="camera-outline" size={16} color={colors.accent} />
                  <Text style={[styles.changeAvatarText, { color: colors.accent }]}>Change Photo</Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.userName, { color: colors.textPrimary }]}>{displayName}</Text>
              <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{displayEmail}</Text>

              <View style={styles.badgeRow}>
                <Badge variant="primary" label={isAdmin ? 'Admin' : 'NITK Member'} />
                {displayHostel !== 'Not set' && <Badge variant="neutral" label={displayHostel} />}
              </View>
            </View>

            {/* Wallet / Net Balance Card (Hidden in edit mode) */}
            {!isEditing && (
              <View style={[styles.balanceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View>
                  <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>UgO Balance / Earnings</Text>
                  <Text style={[styles.balanceAmount, { color: colors.accent }, netBalance < 0 && styles.negativeBalance]}>
                    {netBalance < 0 ? `-₹${Math.abs(netBalance)}` : `₹${netBalance}`}
                  </Text>
                  {netBalance < 0 ? (
                    <Text style={styles.dueHint}>Outstanding dues from overdue rentals</Text>
                  ) : (
                    <Text style={[styles.creditHint, { color: colors.textLight }]}>Available for withdrawal or rides</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.historyBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
                  onPress={() => navigation.navigate('Wallet')}
                >
                  <Ionicons name="wallet-outline" size={18} color={colors.accent} />
                  <Text style={[styles.historyBtnText, { color: colors.accent }]}>Wallet & Payouts</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Edit or View Profile Form */}
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionHeader, { color: colors.textPrimary }]}>Personal Details</Text>
                {!isEditing ? (
                  <TouchableOpacity
                    style={styles.editHeaderBtn}
                    onPress={enterEditMode}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.primary} />
                    <Text style={styles.editHeaderBtnText}>Edit</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.cancelHeaderBtn}
                    onPress={cancelEditMode}
                  >
                    <Text style={styles.cancelHeaderBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>

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

                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    <Button
                      title="Save Profile Changes"
                      onPress={handleSaveProfile}
                      loading={saving}
                      variant="accent"
                    />
                    <Button
                      title="Cancel"
                      onPress={cancelEditMode}
                      variant="outline"
                    />
                  </View>
                </>
              ) : (
                <View style={styles.detailsList}>
                  <View style={styles.detailItem}>
                    <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Full Name</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{displayName}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Phone Number</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{displayPhone}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="home-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Hostel / Residence</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{displayHostel}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email Address</Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{displayEmail}</Text>
                    </View>
                  </View>

                  {/* Member Since (created_at from backend query) */}
                  {Boolean(profileData?.created_at) && (
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                      <View style={styles.detailCol}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Member Since</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                          {(() => {
                            try {
                              return new Date(profileData!.created_at!).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              });
                            } catch {
                              return String(profileData?.created_at);
                            }
                          })()}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Last Updated (updated_at from backend query) */}
                  {Boolean(profileData?.updated_at) && (
                    <View style={styles.detailItem}>
                      <Ionicons name="time-outline" size={20} color={colors.textSecondary} />
                      <View style={styles.detailCol}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Last Updated</Text>
                        <Text style={[styles.detailValue, { color: colors.textPrimary }]}>
                          {(() => {
                            try {
                              return new Date(profileData!.updated_at!).toLocaleDateString(undefined, {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              });
                            } catch {
                              return String(profileData?.updated_at);
                            }
                          })()}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Appearance & Dark Mode Settings Card */}
            {!isEditing && (
              <View style={[styles.themeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.themeHeaderRow}>
                  <View style={styles.themeHeaderLeft}>
                    <View
                      style={[
                        styles.themeIconWrapper,
                        {
                          backgroundColor: isDark ? colors.surfaceLight : '#FEF3C7',
                        },
                      ]}
                    >
                      <Ionicons
                        name={isDark ? 'moon' : 'sunny'}
                        size={22}
                        color={isDark ? colors.accent : '#D97706'}
                      />
                    </View>
                    <View style={styles.themeTextContainer}>
                      <Text style={[styles.themeTitle, { color: colors.textPrimary }]}>
                        Dark Mode
                      </Text>
                      <Text style={[styles.themeSubtitle, { color: colors.textSecondary }]}>
                        {isDark ? 'Dark theme enabled across app' : 'Light theme enabled across app'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={isDark}
                    onValueChange={toggleTheme}
                    trackColor={{ false: '#D1D5DB', true: colors.accent }}
                    thumbColor={colors.white}
                  />
                </View>

                {isDark && (
                  <View style={[styles.palettesSection, { borderTopColor: colors.border }]}>
                    <Text style={[styles.paletteSectionTitle, { color: colors.textPrimary }]}>
                      Dark Theme Aesthetic
                    </Text>
                    <Text style={[styles.paletteSectionSubtitle, { color: colors.textSecondary }]}>
                      Choose from 5 styles inspired by modern glass & minimal dark
                    </Text>

                    <View style={styles.paletteGrid}>
                      {availablePalettes.map((item) => {
                        const isSelected = palette === item.id;
                        return (
                          <TouchableOpacity
                            key={item.id}
                            activeOpacity={0.8}
                            onPress={() => setPalette(item.id)}
                            style={[
                              styles.paletteCard,
                              {
                                backgroundColor: item.bgPreview,
                                borderColor: isSelected ? item.accentColor : colors.border,
                                borderWidth: isSelected ? 2 : 1,
                              },
                            ]}
                          >
                            <View style={styles.paletteCardHeader}>
                              <View style={styles.paletteTitleRow}>
                                <View
                                  style={[
                                    styles.paletteIndicatorDot,
                                    { backgroundColor: item.accentColor },
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.paletteCardName,
                                    { color: isSelected ? item.accentColor : '#F8FAFC' },
                                  ]}
                                >
                                  {item.name}
                                </Text>
                              </View>
                              {isSelected ? (
                                <View
                                  style={[
                                    styles.activeCheckBadge,
                                    { backgroundColor: item.accentColor },
                                  ]}
                                >
                                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.inactiveRadio,
                                    { borderColor: 'rgba(255, 255, 255, 0.3)' },
                                  ]}
                                />
                              )}
                            </View>

                            <Text style={styles.paletteTaglineText} numberOfLines={1}>
                              {item.tagline}
                            </Text>

                            {/* Color Palette Preview Swatches (as shown in user's reference image) */}
                            <View style={styles.paletteSwatchesRow}>
                              <Text style={styles.colorPaletteLabel}>Color Palette</Text>
                              <View style={styles.dotsGroup}>
                                {item.paletteDots.map((dotColor, idx) => (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.colorDot,
                                      {
                                        backgroundColor: dotColor,
                                        borderColor: item.bgPreview,
                                      },
                                    ]}
                                  />
                                ))}
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Action Links & Sign Out (Hidden in edit mode) */}
            {!isEditing && (
              <View style={[styles.linksCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomColor: colors.border }]}
                  onPress={() => navigation.navigate('BookingHistory')}
                >
                  <View style={styles.linkLeft}>
                    <Ionicons name="time-outline" size={20} color={colors.accent} />
                    <Text style={[styles.linkText, { color: colors.textPrimary }]}>Rental & Booking History</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>

                {isAdmin && (
                  <TouchableOpacity
                    style={[styles.linkRow, { borderBottomColor: colors.border }]}
                    onPress={() => navigation.navigate('AdminDashboard')}
                  >
                    <View style={styles.linkLeft}>
                      <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
                      <Text style={[styles.linkText, { color: colors.textPrimary }]}>Admin Portal</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomColor: colors.border }]}
                  onPress={() => navigation.navigate('ResetPassword')}
                  activeOpacity={0.8}
                >
                  <View style={styles.linkLeft}>
                    <Ionicons name="key-outline" size={20} color={colors.accent} />
                    <Text style={[styles.linkText, { color: colors.textPrimary }]}>Reset Password</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomColor: colors.border }]}
                  onPress={handlePrivacyPolicy}
                  activeOpacity={0.8}
                >
                  <View style={styles.linkLeft}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={colors.accent} />
                    <Text style={[styles.linkText, { color: colors.textPrimary }]}>Privacy Policy</Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.textLight} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.linkRow, { borderBottomColor: colors.border }]}
                  onPress={handleRequestAccountDeletion}
                  activeOpacity={0.8}
                >
                  <View style={styles.linkLeft}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    <Text style={[styles.linkText, { color: colors.danger, fontWeight: '700' }]}>
                      Request Account Deletion
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.danger} />
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
            )}
          </>
        )}
        </ScrollView>
      </SwipeableScreenWrapper>

      <RentalBottomNav activeTab="profile" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  avatarCard: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
    ...shadows.md,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarInitials: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
  },
  userName: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  userEmail: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
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
    ...shadows.sm,
  },
  balanceLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  balanceAmount: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.accent,
    marginTop: 2,
  },
  negativeBalance: {
    color: colors.danger,
  },
  dueHint: {
    fontSize: 11,
    color: colors.danger,
    marginTop: 2,
  },
  creditHint: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 2,
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  historyBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.primary,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  sectionHeader: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  editHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.backgroundLight,
  },
  editHeaderBtnText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.primary,
  },
  cancelHeaderBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelHeaderBtnText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.danger,
  },
  avatarCircleContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
    ...shadows.sm,
  },
  changeAvatarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundLight,
    marginBottom: spacing.xs,
    marginTop: 2,
  },
  changeAvatarText: {
    fontSize: typography.caption.fontSize,
    color: colors.primary,
    fontWeight: '700',
  },
  detailsList: {
    gap: spacing.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  detailCol: {
    flex: 1,
  },
  detailLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  detailValue: {
    fontSize: typography.body1.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 1,
  },
  linksCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  linkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  linkText: {
    fontSize: typography.body1.fontSize,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  logoutRow: {
    padding: spacing.md,
  },
  logoutText: {
    fontSize: typography.body1.fontSize,
    color: colors.danger,
    fontWeight: '700',
  },
  themeCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  themeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    flex: 1,
  },
  themeIconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeTextContainer: {
    flex: 1,
  },
  themeTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  themeSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  palettesSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  paletteSectionTitle: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  paletteSectionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: spacing.sm + 4,
  },
  paletteGrid: {
    gap: spacing.sm + 2,
  },
  paletteCard: {
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    overflow: 'hidden',
  },
  paletteCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paletteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paletteIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  paletteCardName: {
    fontSize: 14,
    fontWeight: '700',
  },
  activeCheckBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  paletteTaglineText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 3,
    marginBottom: spacing.xs,
  },
  paletteSwatchesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  colorPaletteLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dotsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
});
