import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  TextInput,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { apiClient } from '../../lib/apiClient';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export interface CampusUserItem {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  hostel: string;
  role: 'student' | 'admin' | string;
  avatar_url: string | null;
  is_blocked: boolean;
  total_bookings?: number;
  created_at?: string;
  joined_date?: string;
  cycles_owned?: number;
  total_rides?: number;
}

function formatUserDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return dateStr;
  }
}

const ALL_USERS_MOCK: CampusUserItem[] = [
  {
    id: 'usr-1',
    full_name: 'Jaswanth V.',
    email: 'vakareddyjaswanth.251cs164@nitk.edu.in',
    phone: '+91 97412 34567',
    hostel: 'Mega Tower Block-A',
    role: 'owner',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 2,
    total_rides: 45,
    joined_date: 'Aug 2024',
  },
  {
    id: 'usr-2',
    full_name: 'Rahul Sharma',
    email: 'rahul.sharma@nitk.edu.in',
    phone: '+91 98451 23456',
    hostel: 'Block-4 Satpura',
    role: 'student',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 0,
    total_rides: 38,
    joined_date: 'Sep 2024',
  },
  {
    id: 'usr-3',
    full_name: 'Ananya Rao',
    email: 'ananya.rao@nitk.edu.in',
    phone: '+91 99003 45678',
    hostel: 'Aravali Hostel',
    role: 'owner',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 1,
    total_rides: 24,
    joined_date: 'Jul 2024',
  },
  {
    id: 'usr-4',
    full_name: 'Siddharth Menon',
    email: 'siddharth.m@nitk.edu.in',
    phone: '+91 94481 98765',
    hostel: 'Mega Tower Block-C',
    role: 'owner',
    avatar_url: null,
    is_blocked: true,
    cycles_owned: 1,
    total_rides: 19,
    joined_date: 'Oct 2024',
  },
  {
    id: 'usr-5',
    full_name: 'Divya Sharma',
    email: 'divya.s@nitk.edu.in',
    phone: '+91 98860 11223',
    hostel: 'PG Block-2',
    role: 'student',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 0,
    total_rides: 52,
    joined_date: 'Aug 2024',
  },
  {
    id: 'usr-6',
    full_name: 'Kiran Patel',
    email: 'kiran.patel@nitk.edu.in',
    phone: '+91 96321 87654',
    hostel: 'Satpura Block-3',
    role: 'student',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 0,
    total_rides: 11,
    joined_date: 'Nov 2024',
  },
  {
    id: 'usr-7',
    full_name: 'Pooja Hegde',
    email: 'pooja.hegde@nitk.edu.in',
    phone: '+91 91122 33445',
    hostel: 'PG Block-1',
    role: 'owner',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 1,
    total_rides: 29,
    joined_date: 'Jun 2024',
  },
  {
    id: 'usr-8',
    full_name: 'Mohit Rao',
    email: 'mohit.rao@nitk.edu.in',
    phone: '+91 93456 78901',
    hostel: 'Mega Tower Block-B',
    role: 'student',
    avatar_url: null,
    is_blocked: true,
    cycles_owned: 0,
    total_rides: 7,
    joined_date: 'Jan 2025',
  },
  {
    id: 'usr-9',
    full_name: 'Campus Admin Officer',
    email: 'admin.cyclehub@nitk.edu.in',
    phone: '+91 82424 74000',
    hostel: 'Main Administration Block',
    role: 'admin',
    avatar_url: null,
    is_blocked: false,
    cycles_owned: 0,
    total_rides: 0,
    joined_date: 'Jan 2024',
  },
];

export default function AdminAllUsersScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [users, setUsers] = useState<CampusUserItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'admin'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchUsers = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoadingUsers(true);
    try {
      console.log('[AdminAllUsersScreen] Calling GET /api/admin/users...');
      const res = await apiClient.getAdminUsers();
      console.log('[AdminAllUsersScreen] Received GET /api/admin/users response:', res);

      const rawList =
        res?.data?.rows ||
        res?.data ||
        res?.users?.rows ||
        res?.users ||
        res?.rows ||
        (Array.isArray(res) ? res : []);

      if (Array.isArray(rawList)) {
        const mapped: CampusUserItem[] = rawList.map((item: any, idx: number) => {
          const uId = String(item.id || item.user_id || item.profile_id || item.email || `usr-${idx}`);
          const totalBookings =
            item.total_bookings !== undefined && item.total_bookings !== null
              ? Number(item.total_bookings)
              : item.total_rides !== undefined && item.total_rides !== null
              ? Number(item.total_rides)
              : undefined;

          return {
            id: uId,
            full_name: item.full_name || 'Campus Member',
            email: item.email || '',
            phone: item.phone || '',
            hostel: item.hostel || 'NITK Campus',
            role: item.role === 'admin' ? 'admin' : 'student',
            avatar_url: item.avatar_url || null,
            is_blocked: Boolean(item.is_blocked),
            total_bookings: totalBookings,
            created_at: item.created_at || '',
            joined_date: item.created_at ? formatUserDate(item.created_at) : (item.joined_date || ''),
          };
        });
        setUsers(mapped);
      }
    } catch (err: any) {
      console.warn('[AdminAllUsersScreen] Error fetching users from GET /api/admin/users:', err?.message || err);
    } finally {
      setLoadingUsers(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchUsers(false);
    }
  }, [fetchUsers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers(true);
  };

  const handleToggleBlock = (targetUser: CampusUserItem) => {
    const willBlock = !targetUser.is_blocked;
    const actionWord = willBlock ? 'Block' : 'Unblock';

    Alert.alert(
      `${actionWord} User?`,
      willBlock
        ? `Are you sure you want to block ${targetUser.full_name}? They will not be able to rent or list cycles.`
        : `Are you sure you want to unblock ${targetUser.full_name}? They will regain full campus cycling access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionWord,
          style: willBlock ? 'destructive' : 'default',
          onPress: async () => {
            setUsers((prev) =>
              prev.map((u) => (u.id === targetUser.id ? { ...u, is_blocked: willBlock } : u))
            );

            Alert.alert(
              `User ${actionWord}ed ✅`,
              `${targetUser.full_name} has been ${actionWord.toLowerCase()}ed successfully.`
            );
          },
        },
      ]
    );
  };

  const handleCallUser = (phone: string, name: string) => {
    Alert.alert(
      'Contact User',
      `Call ${name} at ${phone}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${phone}`).catch(() => {
              Alert.alert('Unable to place call', `Phone number: ${phone}`);
            });
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter((u) => {
    // Status filter
    if (statusFilter === 'active' && u.is_blocked) return false;
    if (statusFilter === 'blocked' && !u.is_blocked) return false;

    // Role filter
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q) ||
      u.hostel.toLowerCase().includes(q)
    );
  });

  const blockedCount = users.filter((u) => u.is_blocked).length;
  const activeCount = users.filter((u) => !u.is_blocked).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Screen Header */}
      <Header
        title="Total Users"
        showBack={true}
        onBack={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerBadge}>
            <Ionicons name="people-outline" size={14} color="#7C3AED" />
            <Text style={styles.headerBadgeText}>{filteredUsers.length} Users</Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users by name, email, phone, hostel..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filters Section: Status & Role Pills */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterPillText, statusFilter === 'all' && styles.filterPillTextActive]}>
                All Users ({users.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'active' && styles.filterPillActive]}
              onPress={() => setStatusFilter('active')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.filterPillText, statusFilter === 'active' && styles.filterPillTextActive]}>
                Active ({activeCount})
              </Text>
            </TouchableOpacity>

            {/* Blocked Filter Highlighted */}
            <TouchableOpacity
              style={[
                styles.filterPill,
                statusFilter === 'blocked' && styles.filterPillBlockedActive,
              ]}
              onPress={() => setStatusFilter('blocked')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.danger }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'blocked' && styles.filterPillBlockedTextActive,
                ]}
              >
                Blocked ({blockedCount})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Role Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterPillsRow, { marginTop: 6 }]}>
            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'all' && styles.rolePillActive]}
              onPress={() => setRoleFilter('all')}
            >
              <Text style={[styles.rolePillText, roleFilter === 'all' && styles.rolePillTextActive]}>
                All Roles
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'student' && styles.rolePillActive]}
              onPress={() => setRoleFilter('student')}
            >
              <Text style={[styles.rolePillText, roleFilter === 'student' && styles.rolePillTextActive]}>
                🎓 Students
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rolePill, roleFilter === 'admin' && styles.rolePillActive]}
              onPress={() => setRoleFilter('admin')}
            >
              <Text style={[styles.rolePillText, roleFilter === 'admin' && styles.rolePillTextActive]}>
                🛡️ Admins
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Loading Banner */}
        {loadingUsers && !refreshing && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingBannerText}>Loading campus users...</Text>
          </View>
        )}

        {/* Users List */}
        <View style={styles.listContainer}>
          {loadingUsers && users.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptyTitle}>Fetching Users</Text>
              <Text style={styles.emptySubtitle}>Connecting to campus administration server...</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="person-remove-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Users Found</Text>
              <Text style={styles.emptySubtitle}>No registered campus users match your search query or filter.</Text>
            </View>
          ) : (
            filteredUsers.map((user) => {
              const isBlocked = user.is_blocked;
              const initials = user.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);

              return (
                <View
                  key={user.id}
                  style={[styles.userCard, isBlocked && styles.userCardBlocked]}
                >
                  <View style={styles.userCardTopRow}>
                    {/* User Avatar */}
                    {user.avatar_url ? (
                      <Image source={{ uri: user.avatar_url }} style={styles.userAvatar} />
                    ) : (
                      <View style={[styles.avatarPlaceholder, isBlocked && styles.avatarPlaceholderBlocked]}>
                        <Text style={[styles.avatarInitials, isBlocked && styles.avatarInitialsBlocked]}>
                          {initials}
                        </Text>
                      </View>
                    )}

                    {/* Main User Info */}
                    <View style={styles.userInfoCol}>
                      <View style={styles.nameRow}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {user.full_name}
                        </Text>
                        <Badge
                          variant={isBlocked ? 'danger' : 'success'}
                          label={isBlocked ? 'Blocked' : 'Active'}
                          size="sm"
                        />
                      </View>

                      {/* Email */}
                      <View style={styles.metaRow}>
                        <Ionicons name="mail-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.emailText} numberOfLines={1}>
                          {user.email}
                        </Text>
                      </View>

                      {/* Mobile Number */}
                      <View style={styles.metaRow}>
                        <Ionicons name="call-outline" size={13} color={colors.primary} />
                        <TouchableOpacity
                          onPress={() => handleCallUser(user.phone, user.full_name)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.phoneText} numberOfLines={1}>
                            {user.phone}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Hostel Location */}
                      <View style={styles.metaRow}>
                        <Ionicons name="home-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.hostelText} numberOfLines={1}>
                          {user.hostel}
                        </Text>
                      </View>

                      {/* Joined Date (created_at) */}
                      {Boolean(user.created_at || user.joined_date) && (
                        <View style={styles.metaRow}>
                          <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.createdDateText} numberOfLines={1}>
                            Joined {user.joined_date || formatUserDate(user.created_at)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Footer: User Role, Stats & Block Action Button */}
                  <View style={styles.userCardFooter}>
                    <View style={styles.roleStatsRow}>
                      <Badge
                        variant={user.role === 'admin' ? 'primary' : 'neutral'}
                        label={user.role === 'admin' ? 'Admin' : 'Student'}
                        size="sm"
                      />
                      {user.total_bookings !== undefined && (
                        <Text style={styles.statMiniText}>
                          🏁 {user.total_bookings} completed booking{user.total_bookings === 1 ? '' : 's'}
                        </Text>
                      )}
                      {user.cycles_owned !== undefined && user.cycles_owned > 0 && (
                        <Text style={styles.statMiniText}>
                          🚲 {user.cycles_owned} cycle{user.cycles_owned > 1 ? 's' : ''}
                        </Text>
                      )}
                      {user.total_rides !== undefined && user.total_bookings === undefined && user.total_rides > 0 && (
                        <Text style={styles.statMiniText}>
                          🏁 {user.total_rides} rides
                        </Text>
                      )}
                    </View>

                    {/* Block / Unblock Action Button */}
                    <TouchableOpacity
                      style={[
                        styles.blockActionBtn,
                        isBlocked ? styles.unblockBtn : styles.blockBtn,
                      ]}
                      onPress={() => handleToggleBlock(user)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={isBlocked ? 'shield-checkmark-outline' : 'ban-outline'}
                        size={13}
                        color={isBlocked ? colors.white : colors.danger}
                      />
                      <Text
                        style={[
                          styles.blockActionText,
                          isBlocked ? styles.unblockText : styles.blockText,
                        ]}
                      >
                        {isBlocked ? 'Unblock' : 'Block'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C3AED',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  /* Search */
  searchSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    padding: 0,
  },

  /* Filter Section */
  filterSection: {
    marginTop: spacing.sm,
  },
  filterPillsRow: {
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillBlockedActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillBlockedTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rolePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: '#EDF2F7',
  },
  rolePillActive: {
    backgroundColor: '#7C3AED',
  },
  rolePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rolePillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  /* User Cards */
  listContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  userCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md - 2,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  userCardBlocked: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  userCardTopRow: {
    flexDirection: 'row',
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarPlaceholderBlocked: {
    backgroundColor: '#FEE2E2',
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primary,
  },
  avatarInitialsBlocked: {
    color: colors.danger,
  },
  userInfoCol: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  emailText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  phoneText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  hostelText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  createdDateText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
  },
  loadingBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  /* User Card Footer */
  userCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
    marginTop: 8,
  },
  roleStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statMiniText: {
    fontSize: 10,
    color: colors.textLight,
  },
  blockActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  blockBtn: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  unblockBtn: {
    backgroundColor: colors.accent,
  },
  blockActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  blockText: {
    color: colors.danger,
  },
  unblockText: {
    color: colors.white,
  },

  /* Empty state */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: 4,
  },
});
