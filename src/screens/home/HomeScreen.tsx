import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { apiClient, extractCyclesList } from '../../lib/apiClient';
import { Cycle } from '../../types';
import Header from '../../components/ui/Header';
import RentalBottomNav from '../../components/RentalBottomNav';
import NotificationBell from '../../components/NotificationBell';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../hooks/useAuth';
import { getAccessToken } from '../../lib/secureStorage';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';
import SwipeableScreenWrapper from '../../components/SwipeableScreenWrapper';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function HomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { profile, user, isAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    getAccessToken().then((token) => setHasToken(Boolean(token)));
  }, [user]);

  const isAuthenticated = Boolean(user || hasToken);
  const [search, setSearch] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [hourlyPrice, setHourlyPrice] = useState<number>(100);
  const [dailyPrice, setDailyPrice] = useState<number>(500);
  const [rating, setRating] = useState<number>(0);
  const [selectedGear, setSelectedGear] = useState<'All' | 'Geared' | 'Non-Geared'>('All');
  const [selectedLocation, setSelectedLocation] = useState('All');

  const fetchCycles = useCallback(async () => {
    try {
      console.log('[HomeScreen] Fetching cycles via apiClient.getCycles()...');
      const res = await apiClient.getCycles();
      const rawCycles: any[] = extractCyclesList(res);
      console.log(`[HomeScreen] Loaded ${rawCycles.length} cycle(s) from backend.`);

      const formatted: Cycle[] = rawCycles.map((cycle: any, index: number) => {
        const cycleId = String(cycle.cycle_id || cycle.id || `cycle-${index}`).trim();
        const id = cycleId;
        const shortCode = (cycleId.replace(/-/g, '').slice(0, 5) || `${index + 1}`).toUpperCase();

        const imageUrls = extractCycleImages(cycle);
        const primaryImage = imageUrls[0] || (cycle.image ? getCycleImageUrl(cycle.image) : null);

        const rawStatus = (cycle.status || cycle.cycle_status || 'available').toLowerCase().trim();
        const isAvailable = ['available', 'active', 'true', '1'].includes(rawStatus);
        const status = isAvailable ? 'available' : 'unavailable';

        const isGeared =
          cycle.cycle_type?.toLowerCase().includes('gear') ||
          cycle.geared === true ||
          cycle.gear_type?.toLowerCase().includes('gear');

        const brand = cycle.brand || cycle.make || cycle.title || 'Cycle';
        const model = cycle.model || `Ride #${shortCode}`;
        const location = cycle.location || cycle.hostel || cycle.place || 'Campus Stand';

        const hourlyPrice = Number(
          cycle.price_per_hour ?? cycle.hourlyPrice ?? cycle.hourly_price ?? 15
        );
        const dailyPrice = Number(
          cycle.price_per_day ?? cycle.dailyPrice ?? cycle.daily_price ?? 100
        );
        const rating = Number(cycle.rating ?? 4.8);

        const rawOwnerName =
          cycle.owner_name ||
          cycle.ownerName ||
          cycle.owner?.name ||
          cycle.owner?.full_name ||
          cycle.owner_full_name ||
          cycle.full_name ||
          null;

        return {
          ...cycle,
          id,
          cycle_id: cycleId,
          owner_id: String(cycle.owner_id || cycle.ownerId || ''),
          owner_name: rawOwnerName ? String(rawOwnerName).trim() : null,
          ownerName: rawOwnerName ? String(rawOwnerName).trim() : null,
          brand,
          model,
          geared: Boolean(isGeared),
          image: primaryImage,
          images: imageUrls,
          cycle_images: cycle.cycle_images,
          hourlyPrice,
          dailyPrice,
          price_per_hour: hourlyPrice,
          price_per_day: dailyPrice,
          location,
          status: status as any,
          rating,
          is_verified: true,
        };
      });

      // Sort: Available first, then hourly price ascending
      formatted.sort((a, b) => {
        const aAvail = a.status === 'available' ? 0 : 1;
        const bAvail = b.status === 'available' ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
        return (a.hourlyPrice || 0) - (b.hourlyPrice || 0);
      });

      setCycles(formatted);
    } catch (err) {
      console.error('[HomeScreen] Error fetching cycles:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCycles();
  };

  // Distinct locations from live data
  const locations = useMemo(() => {
    const locSet = new Set(cycles.map((c) => c.location).filter(Boolean));
    return ['All', ...Array.from(locSet)];
  }, [cycles]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (hourlyPrice < 100) count++;
    if (dailyPrice < 500) count++;
    if (rating > 0) count++;
    if (selectedLocation !== 'All') count++;
    if (selectedGear !== 'All') count++;
    return count;
  }, [hourlyPrice, dailyPrice, rating, selectedLocation, selectedGear]);

  const resetFilters = () => {
    setHourlyPrice(100);
    setDailyPrice(500);
    setRating(0);
    setSelectedLocation('All');
    setSelectedGear('All');
  };

  // Filtered cycles
  const filteredCycles = useMemo(() => {
    return cycles.filter((cycle) => {
      const searchText = search.trim().toLowerCase();
      const matchesSearch =
        !searchText ||
        cycle.brand.toLowerCase().includes(searchText) ||
        cycle.model.toLowerCase().includes(searchText) ||
        cycle.location.toLowerCase().includes(searchText);

      const matchesGear =
        selectedGear === 'All' ||
        (selectedGear === 'Geared' && cycle.geared) ||
        (selectedGear === 'Non-Geared' && !cycle.geared);

      const matchesLocation = selectedLocation === 'All' || cycle.location === selectedLocation;
      const matchesHourly = (cycle.hourlyPrice ?? 0) <= hourlyPrice;
      const matchesDaily = (cycle.dailyPrice ?? 0) <= dailyPrice;
      const matchesRating = (cycle.rating || 0) >= rating;

      return matchesSearch && matchesGear && matchesLocation && matchesHourly && matchesDaily && matchesRating;
    });
  }, [cycles, search, selectedGear, selectedLocation, hourlyPrice, dailyPrice, rating]);

  const handleViewDetails = async (cycleItem: Cycle) => {
    const token = await getAccessToken();
    if (!token && !user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to view cycle details and book your ride.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }
    navigation.navigate('BookingDetail', { cycle: cycleItem });
  };

  const handleNotificationsPress = async () => {
    const token = await getAccessToken();
    if (!token && !user) {
      Alert.alert(
        'Sign In Required',
        'Please sign in to view your notifications.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }
    navigation.navigate('Notifications');
  };

  const renderCycleCard = ({ item }: { item: Cycle }) => {
    const isAvailable = item.status === 'available';

    return (
      <View style={styles.card}>
        {/* Left: Cycle Image with Available Badge */}
        <View style={styles.cardImageWrapper}>
          {item.image && getCycleImageUrl(item.image) ? (
            <Image source={{ uri: getCycleImageUrl(item.image) }} style={styles.cardImage} resizeMode="cover" />
          ) : (
            <View style={styles.noImage}>
              <Ionicons name="bicycle-outline" size={36} color={colors.textLight} />
            </View>
          )}
          <View style={[styles.statusBadge, isAvailable ? styles.statusAvailable : styles.statusBooked]}>
            <Text style={[styles.statusBadgeText, isAvailable ? styles.statusAvailableText : styles.statusBookedText]}>
              {isAvailable ? 'Available' : 'Booked'}
            </Text>
          </View>
          {item.images && item.images.length > 1 && (
            <View style={styles.photoCountBadge}>
              <Ionicons name="images" size={9} color="#FFFFFF" style={{ marginRight: 2 }} />
              <Text style={styles.photoCountText}>{item.images.length}</Text>
            </View>
          )}
        </View>

        {/* Middle: Details */}
        <View style={styles.cardMiddle}>
          <Text style={styles.cycleTitle} numberOfLines={1}>
            {item.brand} {item.model}
          </Text>

          <View style={styles.tagsRow}>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>New</Text>
            </View>
            <View style={styles.tagPill}>
              <Text style={styles.tagText}>{item.geared ? '⚙ Geared' : '○ Non-Geared'}</Text>
            </View>
            <View style={[styles.tagPill, styles.ratingTagPill]}>
              <Ionicons name="star" size={9} color="#D97706" style={{ marginRight: 2 }} />
              <Text style={styles.ratingTagText}>{(item.rating || 4.8).toFixed(1)}</Text>
            </View>
            {!!item.location && (
              <View style={[styles.tagPill, styles.locationTagPill]}>
                <Ionicons name="location-sharp" size={10} color={colors.accent} style={{ marginRight: 2 }} />
                <Text style={styles.tagText} numberOfLines={1}>
                  {item.location}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.ownerRow}>
            <Ionicons name="checkmark-circle" size={13} color={colors.accent} />
            <Text style={styles.ownerText} numberOfLines={1}>
              {item.owner_name || item.ownerName || 'NITK Owner'}
            </Text>
          </View>
        </View>

        {/* Right: Price & View Details Button */}
        <View style={styles.cardRight}>
          <View style={styles.priceCol}>
            <Text style={styles.priceMain}>
              ₹{item.hourlyPrice}<Text style={styles.priceUnit}> /hr</Text>
            </Text>
            <Text style={styles.priceSub}>₹{item.dailyPrice} /day</Text>
          </View>

          <TouchableOpacity
            style={[styles.viewDetailsBtn, !isAvailable && styles.viewDetailsBtnDisabled]}
            disabled={!isAvailable}
            onPress={() => handleViewDetails(item)}
            activeOpacity={0.8}
          >
            <Text style={styles.viewDetailsText}>
              {isAvailable ? 'View Details' : 'Booked'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <Header
        showLogo
        rightComponent={
          <View style={styles.headerRightGroup}>
            {isAdmin && (
              <TouchableOpacity
                style={styles.adminChip}
                onPress={() => navigation.navigate('AdminDashboard')}
                activeOpacity={0.8}
              >
                <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                <Text style={styles.adminChipText}>Admin</Text>
              </TouchableOpacity>
            )}
            {!isAuthenticated && (
              <TouchableOpacity
                style={styles.loginChip}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.8}
              >
                <Ionicons name="log-in-outline" size={15} color={colors.white} />
                <Text style={styles.loginChipText}>Sign In</Text>
              </TouchableOpacity>
            )}
            <NotificationBell
              unreadCount={unreadCount}
              onPress={handleNotificationsPress}
            />
          </View>
        }
      />

      <SwipeableScreenWrapper currentTab="home" disableSwipe={filterModalVisible}>
        {/* Admin Notice Banner if logged in as Admin */}
        {isAdmin && (
          <TouchableOpacity
            style={styles.adminNoticeBanner}
            onPress={() => navigation.navigate('AdminDashboard')}
            activeOpacity={0.85}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="shield-checkmark" size={16} color="#B45309" />
              <Text style={styles.adminNoticeText}>
                Campus Admin Active • Review pending cycles
              </Text>
            </View>
            <Text style={styles.adminNoticeLink}>Open Portal →</Text>
          </TouchableOpacity>
        )}

        {/* Top Search & Filter Bar */}
        <View style={styles.topControlSection}>
          {/* Search Input */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search cycles, brands, locations..."
              placeholderTextColor={colors.textLight}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Action Row: Filters button & Result count */}
          <View style={styles.filterBarRow}>
            <TouchableOpacity
              style={[styles.filterToggleBtn, activeFilterCount > 0 && styles.filterToggleBtnActive]}
              onPress={() => setFilterModalVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons
                name="options-outline"
                size={16}
                color={activeFilterCount > 0 ? colors.accent : colors.textPrimary}
              />
              <Text
                style={[styles.filterToggleText, activeFilterCount > 0 && styles.filterToggleTextActive]}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.resultCountText}>
              {loading ? 'Searching...' : `${filteredCycles.length} cycles`}
            </Text>
          </View>
        </View>

        {/* Browse Cycles Heading */}
        <View style={styles.headingSection}>
          <Text style={styles.headingTag}>NITK CYCLE SHARING</Text>
          <Text style={styles.headingTitle}>Browse Cycles</Text>
          <Text style={styles.headingSubtitle}>Find an available cycle and start your ride.</Text>
        </View>

        {/* Cycles Feed */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Finding available cycles...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredCycles}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderCycleCard}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.accent]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="bicycle-outline" size={60} color={colors.textLight} />
                <Text style={styles.emptyTitle}>No cycles found</Text>
                <Text style={styles.emptySubtitle}>Try changing your filters or search terms.</Text>
                {activeFilterCount > 0 && (
                  <TouchableOpacity style={styles.clearFiltersBtn} onPress={resetFilters}>
                    <Text style={styles.clearFiltersText}>Clear Filters</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </SwipeableScreenWrapper>

      {/* Bottom Nav */}
      <RentalBottomNav activeTab="home" />

      {/* Comprehensive Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Filters</Text>
                <Text style={styles.modalSub}>Find your perfect ride</Text>
              </View>

              <View style={styles.modalHeaderActions}>
                <TouchableOpacity onPress={resetFilters} style={styles.resetBtn}>
                  <Text style={styles.resetBtnText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setFilterModalVisible(false)}
                  style={styles.closeBtn}
                >
                  <Ionicons name="close" size={22} color={colors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
              {/* Hourly Price Filter */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterLabel}>Max Price / hour</Text>
                  <Text style={styles.filterValueTag}>₹{hourlyPrice}</Text>
                </View>
                <View style={styles.optionsWrap}>
                  {[10, 20, 30, 50, 100].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.filterChip, hourlyPrice === val && styles.filterChipActive]}
                      onPress={() => setHourlyPrice(val)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          hourlyPrice === val && styles.filterChipTextActive,
                        ]}
                      >
                        {val === 100 ? 'Any Price' : `Under ₹${val}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Daily Price Filter */}
              <View style={styles.filterSection}>
                <View style={styles.filterSectionHeader}>
                  <Text style={styles.filterLabel}>Max Price / day</Text>
                  <Text style={styles.filterValueTag}>₹{dailyPrice}</Text>
                </View>
                <View style={styles.optionsWrap}>
                  {[50, 100, 200, 300, 500].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.filterChip, dailyPrice === val && styles.filterChipActive]}
                      onPress={() => setDailyPrice(val)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          dailyPrice === val && styles.filterChipTextActive,
                        ]}
                      >
                        {val === 500 ? 'Any Price' : `Under ₹${val}`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Rating Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Minimum Rating</Text>
                <View style={styles.optionsWrap}>
                  {[0, 3, 4, 4.5].map((val) => (
                    <TouchableOpacity
                      key={val}
                      style={[styles.filterChip, rating === val && styles.filterChipActive]}
                      onPress={() => setRating(val)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          rating === val && styles.filterChipTextActive,
                        ]}
                      >
                        {val === 0 ? 'All Ratings' : `★ ${val}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Location Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Campus Location</Text>
                <View style={styles.optionsWrap}>
                  {locations.map((loc) => (
                    <TouchableOpacity
                      key={loc}
                      style={[styles.filterChip, selectedLocation === loc && styles.filterChipActive]}
                      onPress={() => setSelectedLocation(loc)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedLocation === loc && styles.filterChipTextActive,
                        ]}
                      >
                        {loc === 'All' ? 'All Locations' : loc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Gear Type Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Gear Type</Text>
                <View style={styles.optionsWrap}>
                  {(['All', 'Geared', 'Non-Geared'] as const).map((gear) => (
                    <TouchableOpacity
                      key={gear}
                      style={[styles.filterChip, selectedGear === gear && styles.filterChipActive]}
                      onPress={() => setSelectedGear(gear)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selectedGear === gear && styles.filterChipTextActive,
                        ]}
                      >
                        {gear === 'All' ? 'All Types' : gear === 'Geared' ? '⚙ Geared' : '○ Non-Geared'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Apply Button */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => setFilterModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.applyBtnText}>
                  Apply Filters ({filteredCycles.length} available)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  adminChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(22, 58, 95, 0.15)',
  },
  adminChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  loginChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    gap: 4,
    ...shadows.sm,
  },
  loginChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  adminNoticeBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  adminNoticeText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  adminNoticeLink: {
    fontSize: 12,
    color: '#B45309',
    fontWeight: '800',
  },
  topControlSection: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.sm + 2,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: typography.body2.fontSize,
  },
  filterBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingBottom: 4,
  },
  filterToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    gap: 6,
    ...shadows.sm,
  },
  filterToggleBtnActive: {
    borderColor: colors.accent,
    backgroundColor: '#F0FDF4',
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  filterToggleTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  filterBadge: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  resultCountText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  headingSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.backgroundDark,
  },
  headingTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accentBlue,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  headingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  headingSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: 90,
    backgroundColor: colors.backgroundDark,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm + 4,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...shadows.sm,
  },
  cardImageWrapper: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F1F5F9',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  noImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  statusAvailable: {
    backgroundColor: '#DCFCE7',
  },
  statusBooked: {
    backgroundColor: '#FEE2E2',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  statusAvailableText: {
    color: '#15803D',
  },
  statusBookedText: {
    color: '#B91C1C',
  },
  photoCountBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  photoCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  cardMiddle: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
  },
  cycleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 4,
  },
  tagPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.xs,
  },
  locationTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 120,
  },
  tagText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
  ratingTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF9C3',
  },
  ratingTagText: {
    fontSize: 10,
    color: '#92400E',
    fontWeight: '700',
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ownerText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minWidth: 86,
  },
  priceCol: {
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  priceMain: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.textPrimary,
  },
  priceUnit: {
    fontSize: 11,
    fontWeight: 'normal',
    color: colors.textSecondary,
  },
  priceSub: {
    fontSize: 11,
    color: colors.textLight,
  },
  viewDetailsBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
  },
  viewDetailsBtnDisabled: {
    backgroundColor: colors.border,
  },
  viewDetailsText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.backgroundDark,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
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
  clearFiltersBtn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  clearFiltersText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    paddingBottom: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  resetBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.sm,
    backgroundColor: '#F1F5F9',
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  closeBtn: {
    padding: 4,
  },
  modalBody: {
    padding: spacing.lg,
  },
  filterSection: {
    marginBottom: spacing.lg,
  },
  filterSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  filterValueTag: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: '#F0FDF4',
    borderColor: colors.accent,
  },
  filterChipText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  modalFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  applyBtn: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
});
