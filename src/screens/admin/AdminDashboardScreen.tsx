import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  TextInput,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { Cycle, Profile } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import NotificationBell from '../../components/NotificationBell';
import RentalBottomNav from '../../components/RentalBottomNav';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const { notifications } = useNotifications(user?.id);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const [totalUsers, setTotalUsers] = useState(0);
  const [activeRentals, setActiveRentals] = useState(0);
  const [totalCycles, setTotalCycles] = useState(0);
  const [pendingCycles, setPendingCycles] = useState<Cycle[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'users'>('pending');
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatsAndPending = async () => {
    try {
      // 1. Stats
      const [usersCountRes, rentalsCountRes, cyclesCountRes] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('booking_table').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('cycles').select('*', { count: 'exact', head: true }),
      ]);

      setTotalUsers(usersCountRes.count || 0);
      setActiveRentals(rentalsCountRes.count || 0);
      setTotalCycles(cyclesCountRes.count || 0);

      // 2. Pending unverified cycles with images
      const { data: pending, error: pendingErr } = await supabase
        .from('cycles')
        .select(`
          *,
          cycle_images (image_url, storage_path, display_order)
        `)
        .eq('is_verified', false)
        .order('created_at', { ascending: false });

      if (pendingErr) throw pendingErr;
      setPendingCycles((pending as any) || []);

      // 3. Registered campus profiles
      const { data: profilesData, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!profilesErr && profilesData) {
        setUsers(profilesData as Profile[]);
      }
    } catch (err) {
      console.error('Admin stats error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatsAndPending();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStatsAndPending();
  };

  const handleToggleBlockUser = (targetUser: Profile) => {
    const willBlock = !targetUser.is_blocked;
    const actionWord = willBlock ? 'Block' : 'Unblock';

    Alert.alert(
      `${actionWord} User?`,
      willBlock
        ? `Are you sure you want to block ${targetUser.full_name || targetUser.email}? They will not be able to rent or list cycles.`
        : `Are you sure you want to unblock ${targetUser.full_name || targetUser.email}? They will regain campus access.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionWord,
          style: willBlock ? 'destructive' : 'default',
          onPress: async () => {
            setActionUserId(targetUser.id);
            try {
              const { error } = await supabase
                .from('profiles')
                .update({
                  is_blocked: willBlock,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', targetUser.id);

              if (error) throw error;

              setUsers((prev) =>
                prev.map((u) =>
                  u.id === targetUser.id ? { ...u, is_blocked: willBlock } : u
                )
              );

              Alert.alert(
                `User ${actionWord}ed ✅`,
                `${targetUser.full_name || 'User'} has been ${actionWord.toLowerCase()}ed successfully.`
              );
            } catch (err: any) {
              Alert.alert('Action Failed', err.message || 'Unable to update user block status.');
            } finally {
              setActionUserId(null);
            }
          },
        },
      ]
    );
  };

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const query = userSearch.toLowerCase();
    const name = (u.full_name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const hostel = (u.hostel || '').toLowerCase();
    return name.includes(query) || email.includes(query) || hostel.includes(query);
  });

  const renderPendingCycle = ({ item }: { item: Cycle }) => {
    const imgs = extractCycleImages(item);
    const thumbUrl = imgs[0] || (item.image ? getCycleImageUrl(item.image) : null);

    return (
      <TouchableOpacity
        style={styles.pendingCard}
        onPress={() => navigation.navigate('CycleVerification', { cycleId: item.id, cycle: item })}
        activeOpacity={0.8}
      >
        {/* Cycle Thumbnail */}
        <View style={styles.pendingThumbWrapper}>
          {thumbUrl ? (
            <Image source={{ uri: thumbUrl }} style={styles.pendingThumb} resizeMode="cover" />
          ) : (
            <View style={styles.pendingThumbPlaceholder}>
              <Ionicons name="bicycle" size={26} color={colors.primary} />
            </View>
          )}
        </View>

        <View style={styles.cardLeft}>
          <Text style={styles.pendingTitle} numberOfLines={1}>
            {item.brand} {item.model}
          </Text>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.pendingLocation} numberOfLines={1}>
              {item.location || 'NITK Campus'}
            </Text>
          </View>
          <Text style={styles.pendingPrice}>
            ₹{item.price_per_hour}/hr • ₹{item.price_per_day}/day
          </Text>
        </View>

        <View style={styles.cardRight}>
          <Badge variant="warning" label="Review" size="sm" />
          <Ionicons name="chevron-forward" size={18} color={colors.textLight} style={{ marginTop: 8 }} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderUserItem = ({ item }: { item: Profile }) => {
    const isActioning = actionUserId === item.id;
    const isBlocked = !!item.is_blocked;
    const initials = (item.full_name || item.email || 'U')
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <View style={[styles.userCard, isBlocked && styles.userCardBlocked]}>
        <View style={styles.userCardLeft}>
          {/* Avatar or Initials */}
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatarPlaceholder, isBlocked && styles.avatarBlocked]}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}

          <View style={styles.userInfoCol}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName} numberOfLines={1}>
                {item.full_name || 'NITK Student'}
              </Text>
              {item.role === 'admin' && <Badge variant="primary" label="Admin" size="sm" />}
            </View>

            <Text style={styles.userEmail} numberOfLines={1}>
              {item.email || 'No email registered'}
            </Text>

            <View style={styles.userMetaRow}>
              <Ionicons name="home-outline" size={12} color={colors.textSecondary} />
              <Text style={styles.userHostel} numberOfLines={1}>
                {item.hostel || 'NITK Campus'}
              </Text>
              <View style={styles.metaDot} />
              <Badge
                variant={isBlocked ? 'danger' : 'success'}
                label={isBlocked ? 'Blocked' : 'Active'}
                size="sm"
              />
            </View>
          </View>
        </View>

        {/* Block / Unblock Action Button */}
        <TouchableOpacity
          style={[
            styles.blockActionBtn,
            isBlocked ? styles.unblockBtn : styles.blockBtn,
          ]}
          onPress={() => handleToggleBlockUser(item)}
          disabled={isActioning}
          activeOpacity={0.8}
        >
          {isActioning ? (
            <ActivityIndicator size="small" color={isBlocked ? colors.white : colors.danger} />
          ) : (
            <>
              <Ionicons
                name={isBlocked ? 'checkmark-circle-outline' : 'ban-outline'}
                size={14}
                color={isBlocked ? colors.white : colors.danger}
              />
              <Text
                style={[
                  styles.blockActionText,
                  isBlocked ? styles.unblockActionText : styles.blockActionTextRed,
                ]}
              >
                {isBlocked ? 'Unblock' : 'Block'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title="Admin Portal"
        showBack={true}
        onBack={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Home');
          }
        }}
        rightComponent={
          <View style={styles.headerRightGroup}>
            <NotificationBell
              unreadCount={unreadCount}
              onPress={() => navigation.navigate('Notifications')}
            />
            <TouchableOpacity
              style={styles.studentViewBtn}
              onPress={() => navigation.navigate('Home')}
              activeOpacity={0.8}
            >
              <Ionicons name="bicycle" size={16} color={colors.white} />
              <Text style={styles.studentViewText}>Student View</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Campus Administration Banner */}
      <View style={styles.topBanner}>
        <View style={styles.topBannerLeft}>
          <Text style={styles.topBannerTitle}>Campus Administration</Text>
          <Text style={styles.topBannerSubtitle}>Manage verified cycles, students & campus activity</Text>
        </View>
      </View>

      {/* KPI Stats Grid */}
      <View style={styles.statsGrid}>
        <TouchableOpacity
          style={[styles.statCard, activeTab === 'users' && styles.statCardActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={24} color={colors.primary} />
          <Text style={styles.statNumber}>{totalUsers}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </TouchableOpacity>

        <View style={styles.statCard}>
          <Ionicons name="bicycle-outline" size={24} color={colors.accent} />
          <Text style={styles.statNumber}>{activeRentals}</Text>
          <Text style={styles.statLabel}>Active Rides</Text>
        </View>

        <TouchableOpacity
          style={[styles.statCard, activeTab === 'pending' && styles.statCardActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.8}
        >
          <Ionicons name="cube-outline" size={24} color={colors.info} />
          <Text style={styles.statNumber}>{totalCycles}</Text>
          <Text style={styles.statLabel}>Total Cycles</Text>
        </TouchableOpacity>
      </View>

      {/* Segmented Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={16}
            color={activeTab === 'pending' ? colors.white : colors.textSecondary}
          />
          <Text
            style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}
          >
            Pending Cycles ({pendingCycles.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'users' && styles.tabBtnActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.8}
        >
          <Ionicons
            name="people"
            size={16}
            color={activeTab === 'users' ? colors.white : colors.textSecondary}
          />
          <Text
            style={[styles.tabBtnText, activeTab === 'users' && styles.tabBtnTextActive]}
          >
            All Users ({users.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab: Users Search Bar */}
      {activeTab === 'users' && (
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search users by name, email, hostel..."
              placeholderTextColor={colors.textLight}
              value={userSearch}
              onChangeText={setUserSearch}
            />
            {userSearch.length > 0 && (
              <TouchableOpacity onPress={() => setUserSearch('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading admin data...</Text>
        </View>
      ) : activeTab === 'pending' ? (
        <FlatList
          data={pendingCycles}
          keyExtractor={(item) => item.id}
          renderItem={renderPendingCycle}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={60} color={colors.accent} />
              <Text style={styles.emptyTitle}>All caught up!</Text>
              <Text style={styles.emptySubtitle}>There are no cycles currently awaiting verification.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="person-remove-outline" size={54} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No users found</Text>
              <Text style={styles.emptySubtitle}>No registered users match your search query.</Text>
            </View>
          }
        />
      )}

      {/* Persistent Bottom Navigation */}
      <RentalBottomNav activeTab="admin" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  studentViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  studentViewText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  topBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  topBannerLeft: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  topBannerTitle: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  topBannerSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  statCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#EFF6FF',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: 4,
  },
  statLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  searchSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body2.fontSize,
    color: colors.textPrimary,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: 95,
  },
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    ...shadows.sm,
  },
  pendingThumbWrapper: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceLight,
  },
  pendingThumb: {
    width: '100%',
    height: '100%',
  },
  pendingThumbPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  cardLeft: {
    flex: 1,
  },
  pendingTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  pendingLocation: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },
  pendingPrice: {
    fontSize: typography.caption.fontSize,
    color: colors.accent,
    fontWeight: '700',
    marginTop: 4,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  userCardBlocked: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FECACA',
  },
  userCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginRight: spacing.sm,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBlocked: {
    backgroundColor: '#FEE2E2',
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.primary,
  },
  userInfoCol: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userName: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  userEmail: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 1,
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  userHostel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    maxWidth: 120,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textLight,
  },
  blockActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    gap: 5,
  },
  blockBtn: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  unblockBtn: {
    backgroundColor: colors.accent,
  },
  blockActionText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
  },
  blockActionTextRed: {
    color: colors.danger,
  },
  unblockActionText: {
    color: colors.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl,
  },
  emptyTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
