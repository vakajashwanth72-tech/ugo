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
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, extractCyclesList } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { Cycle } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import RentalBottomNav from '../../components/RentalBottomNav';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';
import SwipeableScreenWrapper from '../../components/SwipeableScreenWrapper';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const OWNER_CYCLES_STORAGE_KEY = '@ugo_stored_owner_cycles';

const formatListingDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return (
      d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return String(dateStr);
  }
};

export default function CycleOwnerScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<any>();
  const { user, profile } = useAuth();

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingCycleId, setUpdatingCycleId] = useState<string | null>(null);
  const [selectedCycle, setSelectedCycle] = useState<Cycle | null>(null);
  const [modalActiveImageIndex, setModalActiveImageIndex] = useState(0);

  const isFetchingRef = useRef(false);
  const lastFetchTimestampRef = useRef(0);
  const userRef = useRef(user);
  userRef.current = user;

  // Hydrate cached owner cycles from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(OWNER_CYCLES_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCycles(parsed);
            setLoading(false);
          }
        }
      } catch {
        // Ignore cache read error
      }
    })();
  }, []);

  const fetchOwnerCycles = useCallback(async (isManualRefresh = false) => {
    const now = Date.now();
    // Guard against duplicate rapid calls (600ms debounce)
    if (isFetchingRef.current || (!isManualRefresh && now - lastFetchTimestampRef.current < 600)) {
      console.log('[CycleOwnerScreen] Skipping duplicate getMyCycles call.');
      return;
    }

    isFetchingRef.current = true;
    lastFetchTimestampRef.current = now;

    try {
      console.log('[CycleOwnerScreen] Fetching user cycles via apiClient.getMyCycles()...');
      const res = await apiClient.getMyCycles();
      console.log('[CycleOwnerScreen] getMyCycles raw response received:', res);

      // Directly extract cycles and cycle_images from backend response
      const rawCycles: any[] = Array.isArray(res?.cycles)
        ? res.cycles
        : extractCyclesList(res);
      console.log(`[CycleOwnerScreen] Extracted ${rawCycles.length} cycle item(s) from backend.`);

      const allCycleImages: any[] = Array.isArray(res?.cycle_images)
        ? res.cycle_images
        : [];

      // Group images by cycle_id in order of appearance
      const imagesByCycleId = new Map<string, any[]>();
      const imageGroups: any[][] = [];
      for (const img of allCycleImages) {
        const cId = String(img?.cycle_id || '').toLowerCase().trim();
        if (cId) {
          if (!imagesByCycleId.has(cId)) {
            const group: any[] = [];
            imagesByCycleId.set(cId, group);
            imageGroups.push(group);
          }
          imagesByCycleId.get(cId)!.push(img);
        } else {
          imageGroups.push([img]);
        }
      }

      // Check if any cycle has a direct cycle_id match in cycle_images
      const hasAnyStrictMatch = rawCycles.some((rc: any) => {
        const c =
          rc?.getmycycles ||
          rc?.getMyCycles ||
          rc?.mycycles ||
          rc?.myCycles ||
          rc?.my_cycles ||
          rc?.cycles ||
          rc?.cycle ||
          rc?.data ||
          rc?.payload ||
          rc?.attributes ||
          rc?.getcycles ||
          rc?.rows ||
          rc ||
          {};
        const cId = String(
          c.id ?? c.cycle_id ?? c.cycleId ?? c._id ?? c.cycleid ?? c.id_cycle ?? ''
        ).trim().toLowerCase();
        return cId && imagesByCycleId.has(cId);
      });

      const formatted: Cycle[] = rawCycles.map((rawCycle: any, index: number) => {
        // Unwrap nested cycle container if present
        const cycle =
          rawCycle?.getmycycles ||
          rawCycle?.getMyCycles ||
          rawCycle?.mycycles ||
          rawCycle?.myCycles ||
          rawCycle?.my_cycles ||
          rawCycle?.cycles ||
          rawCycle?.cycle ||
          rawCycle?.data ||
          rawCycle?.payload ||
          rawCycle?.attributes ||
          rawCycle?.getcycles ||
          rawCycle?.rows ||
          rawCycle ||
          {};

        const rawCycleId =
          cycle.id ??
          cycle.cycle_id ??
          cycle.cycleId ??
          cycle._id ??
          cycle.cycleid ??
          cycle.id_cycle ??
          null;

        const resolvedCycleId = rawCycleId !== null && rawCycleId !== undefined ? String(rawCycleId).trim().toLowerCase() : '';

        // Match cycle_images:
        // 1. Direct ID match if cycle_id matches
        // 2. Otherwise row-wise: cycles that have their image rows in backend (index < imageGroups.length) get their group.
        // Cycles where index >= imageGroups.length receive [] (empty, backend will send later).
        // Absolutely NO modulo (%) operations!
        let matchedRawImages: any[] = [];
        if (resolvedCycleId && imagesByCycleId.has(resolvedCycleId)) {
          matchedRawImages = imagesByCycleId.get(resolvedCycleId)!;
        } else if (!hasAnyStrictMatch && index < imageGroups.length) {
          matchedRawImages = imageGroups[index];
        }

        let imageUrls: string[] = [];
        if (matchedRawImages.length > 0) {
          const sorted = [...matchedRawImages].sort(
            (a: any, b: any) => (parseInt(a?.display_order, 10) || 0) - (parseInt(b?.display_order, 10) || 0)
          );
          imageUrls = sorted
            .map((img: any) => getCycleImageUrl(img?.image_url || img?.imageUrl || img?.storage_path || img))
            .filter(Boolean);
        }

        const primaryImage = imageUrls.length > 0 ? imageUrls[0] : null;

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
          cycle_images: matchedRawImages.length > 0 ? matchedRawImages : cycle.cycle_images,
          location: cycle.location || cycle.hostel || cycle.place || cycle.address || 'NITK Campus',
          rating: Number(cycle.rating ?? 5.0),
          total_trips: Number(cycle.total_trips ?? cycle.totalTrips ?? 0),
          condition: cycle.condition || 'Good',
          description: cycle.description || '',
          created_at: cycle.created_at || cycle.createdAt || cycle.date || new Date().toISOString(),
          updated_at: cycle.updated_at || cycle.updatedAt || cycle.created_at || cycle.createdAt || null,
        } as Cycle;
      });

      setCycles(formatted);
      AsyncStorage.setItem(OWNER_CYCLES_STORAGE_KEY, JSON.stringify(formatted)).catch(() => {});
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
    const isCurrentlyAvailable = cycle.status === 'available';
    // If it is available send status available; if unavailable send status unavailable.
    // The backend takes the current status and makes it the counter status.
    const currentStatus = isCurrentlyAvailable ? 'available' : 'unavailable';
    const counterStatus = isCurrentlyAvailable ? 'unavailable' : 'available';

    const cycleId = String((cycle as any).cycle_id || cycle.id || '').trim();
    setUpdatingCycleId(cycle.id);

    try {
      console.log(
        `[CycleOwnerScreen] Toggling availability for cycle ${cycleId}. Sending current status: '${currentStatus}' (backend will flip to '${counterStatus}')`
      );
      const res = await apiClient.changeAvailabilityStatus(cycleId, currentStatus);

      const resolvedNewStatus =
        res?.status ||
        res?.data?.status ||
        counterStatus;

      setCycles((prev) =>
        prev.map((c) =>
          c.id === cycle.id || (c as any).cycle_id === cycleId
            ? { ...c, status: resolvedNewStatus, is_active: resolvedNewStatus === 'available' }
            : c
        )
      );

      setSelectedCycle((curr) =>
        curr && (curr.id === cycle.id || (curr as any).cycle_id === cycleId)
          ? { ...curr, status: resolvedNewStatus, is_active: resolvedNewStatus === 'available' }
          : curr
      );
    } catch (err: any) {
      console.error('[CycleOwnerScreen] Toggle availability error:', err);
      Alert.alert('Update Failed', err?.data?.message || err?.message || 'Unable to update availability.');
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
              setCycles((prev) => {
                const filtered = prev.filter(
                  (c) =>
                    String(c.id).trim() !== cycleId &&
                    String((c as any).cycle_id || '').trim() !== cycleId
                );
                AsyncStorage.setItem(OWNER_CYCLES_STORAGE_KEY, JSON.stringify(filtered)).catch(() => {});
                return filtered;
              });
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
              <Text style={styles.cycleTitle} numberOfLines={2}>
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

            {/* Lower row: Listed/Edited date on left, Details button on side low (right) */}
            <View style={styles.bottomInfoRow}>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={11} color={colors.textLight} />
                <Text style={styles.dateText} numberOfLines={1}>
                  {item.updated_at &&
                  item.created_at &&
                  new Date(item.updated_at).getTime() - new Date(item.created_at).getTime() > 60000
                    ? `Edited: ${formatListingDate(item.updated_at)}`
                    : `Listed: ${formatListingDate(item.created_at)}`}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.detailsBtn}
                onPress={() => {
                  setModalActiveImageIndex(0);
                  setSelectedCycle(item);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="eye-outline" size={12} color={colors.accent} />
                <Text style={styles.detailsBtnText}>Details</Text>
              </TouchableOpacity>
            </View>
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

      <SwipeableScreenWrapper currentTab="cycles" disableSwipe={Boolean(selectedCycle)}>
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
            keyExtractor={(item, index) => (item.id ? `${item.id}-${index}` : String(index))}
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
      </SwipeableScreenWrapper>

      {/* Details Modal */}
      <Modal
        visible={Boolean(selectedCycle)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCycle(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.modalSubtag}>CYCLE SPECIFICATIONS</Text>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedCycle?.brand} {selectedCycle?.model}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedCycle(null)}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* Photo gallery with navigation arrows */}
              {(() => {
                const modalImages: string[] =
                  selectedCycle?.images && selectedCycle.images.length > 0
                    ? selectedCycle.images
                    : selectedCycle?.image
                    ? [selectedCycle.image]
                    : [];

                if (modalImages.length === 0) {
                  return (
                    <View style={styles.modalNoPhoto}>
                      <Ionicons name="bicycle-outline" size={48} color={colors.textLight} />
                    </View>
                  );
                }

                const currentImageUri = modalImages[modalActiveImageIndex] || modalImages[0];

                return (
                  <View style={styles.modalCarouselWrapper}>
                    <View style={styles.modalCarouselContainer}>
                      <Image
                        source={{ uri: getCycleImageUrl(currentImageUri) }}
                        style={styles.modalCarouselImage}
                        resizeMode="cover"
                      />

                      {modalImages.length > 1 && (
                        <>
                          {/* Left Arrow Button */}
                          <TouchableOpacity
                            style={[styles.modalArrowBtn, styles.modalLeftArrow]}
                            onPress={() =>
                              setModalActiveImageIndex((prev) =>
                                prev > 0 ? prev - 1 : modalImages.length - 1
                              )
                            }
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                          </TouchableOpacity>

                          {/* Right Arrow Button */}
                          <TouchableOpacity
                            style={[styles.modalArrowBtn, styles.modalRightArrow]}
                            onPress={() =>
                              setModalActiveImageIndex((prev) =>
                                prev < modalImages.length - 1 ? prev + 1 : 0
                              )
                            }
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          >
                            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
                          </TouchableOpacity>

                          {/* Image Counter Badge */}
                          <View style={styles.modalImageCounter}>
                            <Ionicons name="images-outline" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.modalImageCounterText}>
                              {modalActiveImageIndex + 1} / {modalImages.length}
                            </Text>
                          </View>
                        </>
                      )}
                    </View>

                    {/* Dots / Pagination indicator */}
                    {modalImages.length > 1 && (
                      <View style={styles.modalDotsRow}>
                        {modalImages.map((_, idx) => (
                          <TouchableOpacity
                            key={idx}
                            onPress={() => setModalActiveImageIndex(idx)}
                            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                          >
                            <View
                              style={[
                                styles.modalDot,
                                modalActiveImageIndex === idx && styles.modalActiveDot,
                              ]}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Status & Pricing Banner */}
              <View style={styles.modalStatusRow}>
                <View style={styles.badgeRow}>
                  <Badge
                    variant={selectedCycle?.is_verified ? 'success' : 'warning'}
                    label={selectedCycle?.is_verified ? 'Verified by Admin' : 'Pending Verification'}
                    size="sm"
                  />
                  <Badge
                    variant={selectedCycle?.status === 'available' ? 'primary' : 'neutral'}
                    label={selectedCycle?.status === 'available' ? 'Active & Available' : (selectedCycle?.status === 'rented' ? 'Currently Rented' : 'Paused')}
                    size="sm"
                  />
                </View>
                <Text style={styles.modalPriceText}>
                  ₹{selectedCycle?.hourlyPrice}/hr • ₹{selectedCycle?.dailyPrice}/day
                </Text>
              </View>

              {/* Specifications Grid */}
              <Text style={styles.modalSectionHeading}>Specifications</Text>
              <View style={styles.specsGrid}>
                <View style={styles.specItem}>
                  <Ionicons name="bicycle-outline" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.specItemLabel}>Cycle Type</Text>
                    <Text style={styles.specItemValue}>{selectedCycle?.cycle_type || 'Standard'}</Text>
                  </View>
                </View>
                <View style={styles.specItem}>
                  <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.specItemLabel}>Condition</Text>
                    <Text style={styles.specItemValue}>{selectedCycle?.condition || 'Good'}</Text>
                  </View>
                </View>
                <View style={styles.specItem}>
                  <Ionicons name="flash-outline" size={16} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.specItemLabel}>Gear Type</Text>
                    <Text style={styles.specItemValue}>{selectedCycle?.gear_type || (selectedCycle?.geared ? 'Geared' : 'Non-Geared')}</Text>
                  </View>
                </View>
                <View style={styles.specItem}>
                  <Ionicons name="location-outline" size={16} color="#2563EB" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.specItemLabel}>Location</Text>
                    <Text style={styles.specItemValue} numberOfLines={1}>{selectedCycle?.location || 'Campus'}</Text>
                  </View>
                </View>
              </View>

              {/* Description */}
              {Boolean(selectedCycle?.description) && (
                <View style={styles.modalDescBox}>
                  <Text style={styles.modalSectionHeading}>Description</Text>
                  <Text style={styles.modalDescText}>{selectedCycle?.description}</Text>
                </View>
              )}

              {/* Timestamps Section: Listed at & Last edited at */}
              <View style={styles.modalDatesCard}>
                <View style={styles.modalDateItem}>
                  <Ionicons name="calendar-outline" size={14} color={colors.textLight} />
                  <Text style={styles.modalDateLabel}>Listed at:</Text>
                  <Text style={styles.modalDateVal}>{formatListingDate(selectedCycle?.created_at)}</Text>
                </View>
                {selectedCycle?.updated_at && (
                  <View style={styles.modalDateItem}>
                    <Ionicons name="time-outline" size={14} color={colors.textLight} />
                    <Text style={styles.modalDateLabel}>Last edited at:</Text>
                    <Text style={styles.modalDateVal}>{formatListingDate(selectedCycle?.updated_at)}</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.modalActionButtons}>
                <TouchableOpacity
                  style={styles.modalEditBtn}
                  onPress={() => {
                    const cycleToEdit = selectedCycle;
                    setSelectedCycle(null);
                    if (cycleToEdit) {
                      navigation.navigate('Listing', {
                        editCycleId: String(cycleToEdit.id),
                        cycleId: cycleToEdit.id,
                        cycle: cycleToEdit,
                      });
                    }
                  }}
                >
                  <Ionicons name="pencil" size={16} color={colors.white} />
                  <Text style={styles.modalEditBtnText}>Edit This Cycle</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalDismissBtn}
                  onPress={() => setSelectedCycle(null)}
                >
                  <Text style={styles.modalDismissBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
    borderRadius: borderRadius.md,
  },
  addCycleBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body2.fontSize,
  },
  bottomInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  detailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  detailsBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 6,
  },
  dateText: {
    fontSize: 10,
    color: colors.textLight,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  modalSubtag: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: {
    paddingBottom: spacing.sm,
  },
  modalCarouselWrapper: {
    marginVertical: spacing.xs,
  },
  modalCarouselContainer: {
    width: '100%',
    height: 180,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCarouselImage: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.md,
  },
  modalArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    zIndex: 10,
    ...shadows.sm,
  },
  modalLeftArrow: {
    left: 8,
  },
  modalRightArrow: {
    right: 8,
  },
  modalImageCounter: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    zIndex: 10,
  },
  modalImageCounterText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  modalDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  modalDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  modalActiveDot: {
    width: 16,
    backgroundColor: colors.primary,
  },
  modalNoPhoto: {
    width: '100%',
    height: 120,
    borderRadius: borderRadius.md,
    marginVertical: spacing.sm,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  modalPriceText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
  modalSectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  specsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.xs,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: '48%',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  specItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textLight,
    textTransform: 'uppercase',
  },
  specItemValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalDescBox: {
    backgroundColor: 'rgba(10, 25, 47, 0.03)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  modalDescText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  modalDatesCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  modalDateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalDateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  modalDateVal: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalActionButtons: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  modalEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
  },
  modalEditBtnText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  modalDismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  modalDismissBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
