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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { apiClient, normalizeProfileData, UserProfileData } from '../../lib/apiClient';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import RentalBottomNav from '../../components/RentalBottomNav';
import SwipeableScreenWrapper from '../../components/SwipeableScreenWrapper';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, isAdmin, logout } = useAuth();

  // Ephemeral component state - strictly exists ONLY while this screen is active
  const [profileData, setProfileData] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [hostel, setHostel] = useState('');
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
  // Backend query: select created_at,full_name,email,phone,avatar_url,updated_at,hostel,net_balance from profiles where id = $1 and is_verified = true
  const fetchProfileFromApi = useCallback(async (isPullToRefresh = false) => {
    if (isFetchingRef.current && !isPullToRefresh) {
      console.log('[ProfileScreen] Profile fetch already running, skipping duplicate call.');
      return;
    }
    isFetchingRef.current = true;

    try {
      if (!isPullToRefresh) setLoading(true);
      console.log('[ProfileScreen] Fetching profile from GET /api/profile with session access token...');
      const res = await apiClient.getProfile();
      console.log('[ProfileScreen] Received profile response from backend:', res);

      const data = normalizeProfileData(res);
      if (data) {
        setProfileData(data);
        const meta = (user as any)?.user_metadata || {};
        const initialName = data.full_name || meta.full_name || meta.name || user?.email?.split('@')[0] || '';
        const initialPhone = data.phone || meta.phone || '';
        const initialHostel = data.hostel || meta.hostel || '';
        setFullName(initialName);
        setPhone(initialPhone);
        setHostel(initialHostel);
      }
    } catch (err: any) {
      console.error('[ProfileScreen] Error fetching profile from /api/profile:', err?.message || err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  // Screen Lifecycle:
  // 1. When user navigates TO this screen (focus): makes API call to GET /api/profile, stores in local state, and renders.
  // 2. When user moves OUT of this screen (blur / unmount): immediately DELETES profile data from memory.
  // 3. When user returns: automatically triggers a fresh API call and stores afresh.
  useFocusEffect(
    useCallback(() => {
      console.log('[ProfileScreen] Screen focused: fetching user profile from API...');
      fetchProfileFromApi();

      return () => {
        console.log('[ProfileScreen] Navigated away: deleting user profile data from memory.');
        // Completely wipe data from component memory
        setProfileData(null);
        setFullName('');
        setPhone('');
        setHostel('');
        setChosenAvatar(undefined);
        setIsEditing(false);
        setLoading(true);
        isFetchingRef.current = false;
      };
    }, [fetchProfileFromApi])
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

      // Optimistically update ephemeral component state
      setProfileData((prev) => ({
        created_at: prev?.created_at || null,
        full_name: editPayload.full_name,
        phone: editPayload.phone,
        avatar_url: editPayload.avatar_url,
        hostel: editPayload.hostel,
        updated_at: new Date().toISOString(),
        email: prev?.email || user?.email || '',
        net_balance: prev?.net_balance || 0,
      }));

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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
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
        style={styles.container}
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
            <Text style={styles.loadingText}>Loading profile details...</Text>
          </View>
        ) : (
          <>
            {/* User Avatar Card */}
            <View style={styles.avatarCard}>
              <TouchableOpacity
                activeOpacity={isEditing ? 0.7 : 1}
                onPress={isEditing ? handlePickAvatar : undefined}
                style={styles.avatarCircleContainer}
              >
                <View style={styles.avatarCircle}>
                  {currentAvatar ? (
                    <Image source={{ uri: currentAvatar }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitials}>
                      {(displayName || displayEmail || 'U')[0].toUpperCase()}
                    </Text>
                  )}
                </View>
                {isEditing && (
                  <View style={styles.avatarEditBadge}>
                    <Ionicons name="camera" size={16} color={colors.white} />
                  </View>
                )}
              </TouchableOpacity>

              {isEditing && (
                <TouchableOpacity onPress={handlePickAvatar} style={styles.changeAvatarBtn}>
                  <Ionicons name="camera-outline" size={16} color={colors.primary} />
                  <Text style={styles.changeAvatarText}>Change Photo</Text>
                </TouchableOpacity>
              )}

              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.userEmail}>{displayEmail}</Text>

              <View style={styles.badgeRow}>
                <Badge variant="primary" label={isAdmin ? 'Admin' : 'NITK Member'} />
                {displayHostel !== 'Not set' && <Badge variant="neutral" label={displayHostel} />}
              </View>
            </View>

            {/* Wallet / Net Balance Card (Hidden in edit mode) */}
            {!isEditing && (
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
                  onPress={() => navigation.navigate('Wallet')}
                >
                  <Ionicons name="wallet-outline" size={18} color={colors.primary} />
                  <Text style={styles.historyBtnText}>Wallet & Payouts</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Edit or View Profile Form */}
            <View style={styles.formCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>Personal Details</Text>
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
                      <Text style={styles.detailLabel}>Full Name</Text>
                      <Text style={styles.detailValue}>{displayName}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="call-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={styles.detailLabel}>Phone Number</Text>
                      <Text style={styles.detailValue}>{displayPhone}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="home-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={styles.detailLabel}>Hostel / Residence</Text>
                      <Text style={styles.detailValue}>{displayHostel}</Text>
                    </View>
                  </View>

                  <View style={styles.detailItem}>
                    <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
                    <View style={styles.detailCol}>
                      <Text style={styles.detailLabel}>Email Address</Text>
                      <Text style={styles.detailValue}>{displayEmail}</Text>
                    </View>
                  </View>

                  {/* Member Since (created_at from backend query) */}
                  {Boolean(profileData?.created_at) && (
                    <View style={styles.detailItem}>
                      <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
                      <View style={styles.detailCol}>
                        <Text style={styles.detailLabel}>Member Since</Text>
                        <Text style={styles.detailValue}>
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
                        <Text style={styles.detailLabel}>Last Updated</Text>
                        <Text style={styles.detailValue}>
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

            {/* Action Links & Sign Out (Hidden in edit mode) */}
            {!isEditing && (
              <View style={styles.linksCard}>
                <TouchableOpacity
                  style={styles.linkRow}
                  onPress={() => navigation.navigate('BookingHistory')}
                >
                  <View style={styles.linkLeft}>
                    <Ionicons name="time-outline" size={20} color={colors.primary} />
                    <Text style={styles.linkText}>Rental & Booking History</Text>
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
});
