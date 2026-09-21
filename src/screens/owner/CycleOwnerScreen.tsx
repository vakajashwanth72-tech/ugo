import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Switch,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { apiClient, extractCyclesList } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { Cycle } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import RentalBottomNav from '../../components/RentalBottomNav';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function CycleOwnerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { user, profile } = useAuth();

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingCycleId, setUpdatingCycleId] = useState<string | null>(null);

  const isFetchingRef = useRef(false);
  const lastFetchTimestampRef = useRef(0);
  const userRef = useRef(user);
  userRef.current = user;

  const fetchOwnerCycles = useCallback(async (isManualRefresh = false) => {
    const now = Date.now();
    // Guard against duplicate / rapid calls when navigating or tapping tab (2.5s debounce)
    if (isFetchingRef.current || (!isManualRefresh && now - lastFetchTimestampRef.current < 2500)) {
      console.log('[CycleOwnerScreen] Skipping duplicate getMyCycles call.');
      return;
    }

    isFetchingRef.current = true;
    lastFetchTimestampRef.current = now;

    try {
      console.log('[CycleOwnerScreen] Fetching user cycles via apiClient.getMyCycles()...');
      const res = await apiClient.getMyCycles();
      console.log('[CycleOwnerScreen] getMyCycles raw response received:', res);

      // Collect cycles list from backend response using multi-structure extractor
      const rawList: any[] = extractCyclesList(res);
      console.log(`[CycleOwnerScreen] Extracted ${rawList.length} cycle item(s) from backend.`);

      const formatted: Cycle[] = rawList.map((rawCycle: any, index: number) => {
        // Unwrap nested cycle container if present (e.g. { getmycycles: { ... } } or { cycles: { ... } })
        const cycle =
          rawCycle?.getmycycles ||
          rawCycle?.getMyCycles ||
          rawCycle?.cycles ||
          rawCycle?.cycle ||
          rawCycle?.data ||
          rawCycle?.payload ||
          rawCycle?.attributes ||
          rawCycle?.getcycles ||
          rawCycle ||
          {};

        const cycleImagesSource =
          cycle.cycle_images ||
          cycle.cycleImages ||
          rawCycle?.cycle_images ||
          res?.cycle_images;

        const imageUrls = extractCycleImages(cycle);
        if (imageUrls.length === 0 && rawCycle) {
          imageUrls.push(...extractCycleImages(rawCycle));
        }
        if (imageUrls.length === 0 && res?.cycle_images) {
          imageUrls.push(...extractCycleImages(res.cycle_images));
        }
        if (imageUrls.length === 0 && cycleImagesSource) {
          imageUrls.push(...extractCycleImages(cycleImagesSource));
        }

        const primaryImage =
          imageUrls[0] ||
          getCycleImageUrl(cycle.image) ||
          getCycleImageUrl(cycle.image_url) ||
          getCycleImageUrl(cycle.imageUrl) ||
          getCycleImageUrl(cycle.storage_path) ||
          getCycleImageUrl(res?.cycle_images) ||
          null;

        const isVerified =
          cycle.is_verified === true ||
          cycle.isVerified === true ||
          cycle.verified === true ||
          String(cycle.is_verified || '').toLowerCase() === 'true' ||
          String(cycle.verification_status || cycle.verificationStatus || '').toLowerCase() === 'approved' ||
          String(cycle.verification_status || cycle.verificationStatus || '').toLowerCase() === 'verified';

        const rawStatus = String(
          cycle.status ||
          cycle.cycle_status ||
          (cycle.is_active !== undefined ? (cycle.is_active ? 'available' : 'unavailable') : '') ||
          'available'
        ).toLowerCase().trim();

        const isAvailable = ['available', 'active', 'true', '1'].includes(rawStatus);
        const status = isAvailable ? 'available' : rawStatus === 'rented' ? 'rented' : 'unavailable';

        const hourlyPrice = Number(
          cycle.price_per_hour ??
          cycle.hourly_price ??
          cycle.hourlyPrice ??
          cycle.pricePerHour ??
          cycle.hourly_rate ??
          cycle.hourlyRate ??
          cycle.price_hour ??
          cycle.rate_hour ??
          10
        );

        const dailyPrice = Number(
          cycle.price_per_day ??
          cycle.daily_price ??
          cycle.dailyPrice ??
          cycle.pricePerDay ??
          cycle.daily_rate ??
          cycle.dailyRate ??
          cycle.price_day ??
          cycle.rate_day ??
          50
        );

        const rawCycleId =
          cycle.cycle_id ??
          cycle.cycleId ??
          cycle.id ??
          cycle._id ??
          cycle.cycleid ??
          cycle.id_cycle ??
          null;

        const resolvedCycleId = rawCycleId !== null && rawCycleId !== undefined ? String(rawCycleId).trim() : '';

        return {
          ...cycle,
          id: resolvedCycleId || `cycle-${index}`,
          cycle_id: rawCycleId !== null && rawCycleId !== undefined ? rawCycleId : (resolvedCycleId || null),
          cycleId: rawCycleId !== null && rawCycleId !== undefined ? rawCycleId : (resolvedCycleId || null),
          owner_id: String(
            cycle.owner_id ||
            cycle.ownerId ||
            cycle.userId ||
            cycle.user_id ||
            userRef.current?.id ||
            ''
          ),
          brand: cycle.brand || cycle.make || cycle.cycle_brand || cycle.cycleBrand || cycle.name || cycle.title || 'Cycle',
          model: cycle.model || cycle.cycle_model || cycle.cycleModel || '',
          cycle_type: cycle.cycle_type || cycle.cycleType || cycle.type || 'Standard',
          gear_type: cycle.gear_type || cycle.gearType || (cycle.geared ? 'Geared' : 'Non-Geared') || 'Non-Geared',
          frame_size: cycle.frame_size || cycle.frameSize || 'Medium',
          hourlyPrice,
          dailyPrice,
          price_per_hour: hourlyPrice,
          price_per_day: dailyPrice,
          status,
          is_verified: isVerified,
          is_active: isAvailable,
          image: primaryImage,
          images: imageUrls,
          cycle_images: cycle.cycle_images,
          location: cycle.location || cycle.hostel || cycle.place || cycle.address || 'NITK Campus',
          rating: Number(cycle.rating ?? 5.0),
          total_trips: Number(cycle.total_trips ?? cycle.totalTrips ?? 0),
          condition: cycle.condition || 'Good',
          created_at: cycle.created_at || cycle.createdAt || cycle.date || new Date().toISOString(),
        } as Cycle;
      });

      setCycles(formatted);
    } catch (err: any) {
      console.error('[CycleOwnerScreen] Error fetching owner cycles via getMyCycles:', err);
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Single unified focus hook: fetches once when screen is focused or when fresh timestamp is received
  const lastRefreshParamRef = useRef<number | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      const isParamRefresh =
        Boolean(route.params?.refresh && route.params.refresh !== lastRefreshParamRef.current);
      if (route.params?.refresh) {
        lastRefreshParamRef.current = route.params.refresh;
      }
      fetchOwnerCycles(isParamRefresh);
    }, [fetchOwnerCycles, route.params?.refresh])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchOwnerCycles(true);
  };

  const toggleCycleAvailability = async (cycle: Cycle) => {
    const nextStatus = cycle.status === 'available' ? 'unavailable' : 'available';
    setUpdatingCycleId(cycle.id);

    try {
      await apiClient.updateCycleAvailability(cycle.id, nextStatus);
      setCycles((prev) =>
        prev.map((c) =>
          c.id === cycle.id
            ? { ...c, status: nextStatus, is_active: nextStatus === 'available' }
            : c
        )
      );
    } catch (err: any) {
      console.error('[CycleOwnerScreen] Toggle availability error:', err);
      Alert.alert('Update Failed', err?.message || 'Unable to update availability.');
    } finally {
      setUpdatingCycleId(null);
    }
  };

  const handleDeleteCycle = (cycle: Cycle) => {
    const cycleId = String(cycle.id || (cycle as any).cycle_id || '').trim();
    console.log('[CycleOwnerScreen] handleDeleteCycle clicked for:', {
      cycleId,
      brand: cycle.brand,
      model: cycle.model,
    });

    Alert.alert(
      'Delete Cycle',
      `Are you sure you want to remove ${cycle.brand} ${cycle.model}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdatingCycleId(cycleId);
              console.log('[CycleOwnerScreen] Dispatching delete to backend with full cycle details:', cycle);
              const res = await apiClient.deleteCycle(cycle);
              console.log('[CycleOwnerScreen] Delete cycle response:', res);
              setCycles((prev) =>
                prev.filter(
                  (c) =>
                    String(c.id).trim() !== cycleId &&
                    String((c as any).cycle_id || '').trim() !== cycleId
                )
              );
              Alert.alert('Deleted ✅', res?.message || 'Cycle listing has been removed successfully.');
            } catch (err: any) {
              console.error('[CycleOwnerScreen] Delete cycle error:', err);
              Alert.alert('Delete Failed', err?.message || 'Unable to delete cycle.');
            } finally {
              setUpdatingCycleId(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderCycleItem = ({ item }: { item: Cycle }) => {
    const isAvailable = item.status === 'available';
    const isUpdating =
      updatingCycleId === item.id ||
      updatingCycleId === (item as any).cycle_id ||
      Boolean(updatingCycleId && (String(updatingCycleId) === String(item.id) || String(updatingCycleId) === String((item as any).cycle_id)));

    const imageUri = getCycleImageUrl(item.image);

    return (
      <View style={styles.cycleCard}>
        <View style={styles.cardTop}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.cycleImage} />
          ) : (
            <View style={styles.noImage}>
              <Ionicons name="bicycle-outline" size={32} color={colors.textLight} />
            </View>
          )}

          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.cycleTitle} numberOfLines={1}>
                {item.brand} {item.model}
              </Text>
              <View style={styles.actionButtonsRow}>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    const cycleIdToPass = (item as any).cycle_id ?? item.id ?? null;
                    console.log('[CycleOwnerScreen] Edit clicked for cycle:', {
                      cycleIdToPass,
                      brand: item.brand,
                      model: item.model,
                    });
                    navigation.navigate('Listing', {
                      editCycleId: cycleIdToPass ? String(cycleIdToPass) : undefined,
                      cycleId: cycleIdToPass,
                      cycle: item,
                    });
                  }}
                  activeOpacity={0.7}
                  disabled={isUpdating}
                >
                  <Ionicons name="pencil" size={13} color={colors.primary} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteBtn, isUpdating && { opacity: 0.6 }]}
                  onPress={() => handleDeleteCycle(item)}
                  activeOpacity={0.7}
                  disabled={isUpdating}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  {isUpdating ? (
                    <ActivityIndicator size={12} color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={13} color={colors.danger} />
                      <Text style={styles.deleteBtnText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.badgeRow}>
              <Badge
                variant={item.is_verified ? 'success' : 'warning'}
                label={item.is_verified ? 'Verified' : 'Pending Verification'}
                size="sm"
              />
              <Badge
                variant={isAvailable ? 'primary' : 'neutral'}
                label={isAvailable ? 'Active' : 'Paused'}
                size="sm"
              />
            </View>

            <Text style={styles.priceLabel}>
              ₹{item.hourlyPrice}/hr • ₹{item.dailyPrice}/day
            </Text>
          </View>
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleText}>
              Listing {isAvailable ? 'Available for Rent' : 'Temporarily Paused'}
            </Text>
            {isUpdating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Switch
                value={isAvailable}
                onValueChange={() => toggleCycleAvailability(item)}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.white}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title="My Listed Cycles"
        rightAction={{
          icon: 'add-circle-outline',
          onPress: () => navigation.navigate('Listing')}}
      />

      {/* Owner stats summary */}
      <View style={styles.summaryBar}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{cycles.length}</Text>
          <Text style={styles.statLabel}>Total Cycles</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            {cycles.filter((c) => c.status === 'available').length}
          </Text>
          <Text style={styles.statLabel}>Active Listings</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>
            ₹{profile?.net_balance || 0}
          </Text>
          <Text style={styles.statLabel}>Net Balance</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading your cycles...</Text>
        </View>
      ) : (
        <FlatList
          data={cycles}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderCycleItem}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bicycle-outline" size={64} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No cycles listed yet</Text>
              <Text style={styles.emptySubtitle}>
                Turn your idle bicycle into earnings! List your cycle in just 2 minutes.
              </Text>
              <TouchableOpacity
                style={styles.addCycleBtn}
                onPress={() => navigation.navigate('Listing')}
              >
                <Ionicons name="add" size={20} color={colors.white} />
                <Text style={styles.addCycleBtnText}>List New Cycle</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      <RentalBottomNav activeTab="cycles" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm},
  statBox: {
    flex: 1,
    alignItems: 'center'},
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primary},
  statLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2},
  statDivider: {
    width: 1,
    backgroundColor: colors.borderLight},
  listContainer: {
    padding: spacing.md,
    paddingBottom: 90},
  cycleCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm},
  cardTop: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md},
  cycleImage: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight},
  noImage: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center'},
  infoCol: {
    flex: 1},
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'},
  cycleTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.xs,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(22, 58, 95, 0.15)',
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  deleteBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.danger,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: 4},
  priceLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2},
  cardBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surfaceLight},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'},
  toggleText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.textPrimary},
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'},
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize},
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl * 2},
  emptyTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.md},
  emptySubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
    maxWidth: 280},
  addCycleBtn: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md},
  addCycleBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body2.fontSize}});
