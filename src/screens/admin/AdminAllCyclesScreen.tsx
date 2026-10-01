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
import { getCycleImageUrl } from '../../lib/cycleUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export interface CampusCycle {
  id: string;
  brand: string;
  model: string;
  cycle_type: 'gear' | 'non-gear' | 'hybrid' | 'electric' | string;
  condition?: string;
  location: string;
  price_per_hour: number;
  price_per_day: number;
  rating: number;
  review_count: number;
  description: string;
  owner_name: string;
  owner_phone?: string;
  owner_hostel?: string;
  status: 'available' | 'rented' | 'maintenance' | string;
  image_url: string | null;
  updated_at?: string;
  created_at?: string;
  stand_number?: string;
}

function formatCycleDate(dateStr?: string): string {
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

const ALL_CYCLES_MOCK: CampusCycle[] = [
  {
    id: 'cyc-101',
    brand: 'B-Twin',
    model: 'Riverside 120',
    cycle_type: 'gear',
    location: 'Block-4 Satpura',
    stand_number: 'Stand #04',
    price_per_hour: 4,
    price_per_day: 35,
    rating: 4.8,
    review_count: 28,
    description: '7-speed hybrid cycle with smooth Shimano shifting, front suspension, and sturdy rear mudguard.',
    owner_name: 'Jaswanth V.',
    owner_phone: '+91 98451 23456',
    owner_hostel: 'Mega Tower Block-A',
    status: 'available',
    image_url: null,
  },
  {
    id: 'cyc-102',
    brand: 'Hero',
    model: 'Sprint Pro',
    cycle_type: 'gear',
    location: 'Central Library Stand',
    stand_number: 'Stand #12',
    price_per_hour: 3,
    price_per_day: 25,
    rating: 4.6,
    review_count: 19,
    description: 'Reliable campus commuter with dual disc brakes, wide handlebars, and quick seat adjuster.',
    owner_name: 'Rahul Sharma',
    owner_phone: '+91 97412 34567',
    owner_hostel: 'Block-4 Satpura',
    status: 'available',
    image_url: null,
  },
  {
    id: 'cyc-103',
    brand: 'Hercules',
    model: 'Roadeo Hardliner',
    cycle_type: 'gear',
    location: 'Aravali Hostel Hub',
    stand_number: 'Stand #02',
    price_per_hour: 5,
    price_per_day: 40,
    rating: 4.9,
    review_count: 34,
    description: 'MTB with high-traction tires, front shock absorbers, and bottle cage. Excellent on campus slopes.',
    owner_name: 'Ananya Rao',
    owner_phone: '+91 99003 45678',
    owner_hostel: 'Aravali Hostel',
    status: 'rented',
    image_url: null,
  },
  {
    id: 'cyc-104',
    brand: 'Avon',
    model: 'Elements Single Speed',
    cycle_type: 'non-gear',
    location: 'Mega Hostel Tower',
    stand_number: 'Stand #08',
    price_per_hour: 2,
    price_per_day: 18,
    rating: 4.5,
    review_count: 14,
    description: 'Lightweight city cycle, easy pedaling with front carrier basket. Ideal for quick trips between departments.',
    owner_name: 'Kiran Patel',
    owner_phone: '+91 96321 87654',
    owner_hostel: 'Satpura Block-3',
    status: 'available',
    image_url: null,
  },
  {
    id: 'cyc-105',
    brand: 'Firefox',
    model: 'Target 29',
    cycle_type: 'gear',
    location: 'Main Gate Station',
    stand_number: 'Stand #01',
    price_per_hour: 6,
    price_per_day: 50,
    rating: 4.9,
    review_count: 42,
    description: 'Premium alloy frame 21-speed Firefox with hydraulic brakes. Very responsive and fast.',
    owner_name: 'Siddharth M.',
    owner_phone: '+91 94481 98765',
    owner_hostel: 'Mega Tower Block-C',
    status: 'rented',
    image_url: null,
  },
  {
    id: 'cyc-106',
    brand: 'Btwin',
    model: 'Rockrider ST 100',
    cycle_type: 'gear',
    location: 'Health Center Stand',
    stand_number: 'Stand #03',
    price_per_hour: 4,
    price_per_day: 35,
    rating: 4.2,
    review_count: 9,
    description: 'Sturdy mountain cycle. Chain and brake pads recently adjusted by owner.',
    owner_name: 'Divya Sharma',
    owner_phone: '+91 98860 11223',
    owner_hostel: 'PG Block-2',
    status: 'maintenance',
    image_url: null,
  },
  {
    id: 'cyc-107',
    brand: 'Hero',
    model: 'Lectro E-Cycle',
    cycle_type: 'electric',
    location: 'Central Computer Centre',
    stand_number: 'Stand #06',
    price_per_hour: 8,
    price_per_day: 70,
    rating: 5.0,
    review_count: 16,
    description: 'Pedal-assist electric cycle with 25 km range per charge. Battery fully charged at stand dock.',
    owner_name: 'Pooja Hegde',
    owner_phone: '+91 91122 33445',
    owner_hostel: 'PG Block-1',
    status: 'available',
    image_url: null,
  },
  {
    id: 'cyc-108',
    brand: 'Mach City',
    model: 'iBike 7 Speed',
    cycle_type: 'hybrid',
    location: 'Sports Complex Stand',
    stand_number: 'Stand #05',
    price_per_hour: 3,
    price_per_day: 28,
    rating: 4.7,
    review_count: 22,
    description: 'Urban hybrid with comfortable foam saddle, kickstand, and integrated combination cable lock.',
    owner_name: 'Mohit Rao',
    owner_phone: '+91 93456 78901',
    owner_hostel: 'Mega Tower Block-B',
    status: 'available',
    image_url: null,
  },
];

export default function AdminAllCyclesScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [cycles, setCycles] = useState<CampusCycle[]>([]);
  const [loadingCycles, setLoadingCycles] = useState(true);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'rented' | 'maintenance'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'gear' | 'non-gear' | 'hybrid' | 'electric'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchCycles = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoadingCycles(true);
    try {
      console.log('[AdminAllCyclesScreen] Calling GET /api/admin/cycles with raw access token...');
      const res = await apiClient.getAdminCycles();
      console.log('[AdminAllCyclesScreen] Received GET /api/admin/cycles response:', res);
      try {
        console.log('[AdminAllCyclesScreen] Full cycles data JSON:\n', JSON.stringify(res, null, 2));
      } catch (_) {}

      const rawList =
        res?.data?.rows ||
        res?.data ||
        res?.cycles?.rows ||
        res?.cycles ||
        res?.rows ||
        (Array.isArray(res) ? res : []);

      if (Array.isArray(rawList)) {
        const mapped: CampusCycle[] = rawList.map((item: any, idx: number) => {
          const cId = String(item.id || item.cycle_id || `cyc-${idx}`);
          const rawImg =
            item.image_url ||
            item.image ||
            (Array.isArray(item.images) ? item.images[0]?.image_url || item.images[0] : null);
          const normalizedImg = rawImg ? getCycleImageUrl(rawImg) : null;

          return {
            id: cId,
            brand: item.brand || 'Campus Cycle',
            model: item.model || '',
            cycle_type: item.cycle_type || 'gear',
            condition: item.condition || 'Good',
            location: item.location || 'NITK Campus Stand',
            price_per_hour: Number(item.price_per_hour) || 0,
            price_per_day: Number(item.price_per_day) || 0,
            status: item.status || 'available',
            rating: item.rating !== undefined && item.rating !== null ? Number(item.rating) : 4.8,
            review_count: item.review_count ? Number(item.review_count) : 0,
            description: item.description || 'No description provided.',
            owner_name: item.full_name || item.owner_name || 'Student Owner',
            owner_phone: item.owner_number || item.phone || item.owner_phone || '',
            owner_hostel: item.hostel || item.owner_hostel || 'NITK Campus',
            image_url: normalizedImg,
            updated_at: item.updated_at || '',
            created_at: item.created_at || '',
          };
        });
        setCycles(mapped);
      }
    } catch (err: any) {
      console.warn('[AdminAllCyclesScreen] Error fetching cycles from GET /api/admin/cycles:', err?.message || err);
    } finally {
      setLoadingCycles(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchCycles(false);
    }
  }, [fetchCycles]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCycles(true);
  };

  const handleToggleExpand = (cycleId: string) => {
    setExpandedCycleId((prev) => (prev === cycleId ? null : cycleId));
  };

  const handleCallOwner = (phone?: string, name?: string) => {
    if (!phone) {
      Alert.alert('Owner Contact', `${name || 'Owner'} contact number not provided in profile.`);
      return;
    }
    Alert.alert(
      'Contact Owner',
      `Would you like to call ${name || 'Owner'}? (${phone})`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => {
            Linking.openURL(`tel:${phone}`).catch(() => {
              Alert.alert('Unable to make call', `Phone number: ${phone}`);
            });
          },
        },
      ]
    );
  };

  const filteredCycles = cycles.filter((c) => {
    // Status filter
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    // Type filter
    if (typeFilter !== 'all' && c.cycle_type !== typeFilter) return false;
    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.brand.toLowerCase().includes(q) ||
      c.model.toLowerCase().includes(q) ||
      c.location.toLowerCase().includes(q) ||
      c.owner_name.toLowerCase().includes(q) ||
      (c.owner_phone ? c.owner_phone.includes(q) : false)
    );
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Screen Header */}
      <Header
        title="Total Cycles"
        showBack={true}
        onBack={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerBadge}>
            <Ionicons name="cube-outline" size={14} color={colors.primary} />
            <Text style={styles.headerBadgeText}>{filteredCycles.length} Cycles</Text>
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
              placeholder="Search cycles by brand, model, location, owner..."
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

        {/* Top Filters: Status Pills */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterPillText, statusFilter === 'all' && styles.filterPillTextActive]}>
                All Status ({cycles.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'available' && styles.filterPillActive]}
              onPress={() => setStatusFilter('available')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
              <Text style={[styles.filterPillText, statusFilter === 'available' && styles.filterPillTextActive]}>
                Available ({cycles.filter((c) => c.status === 'available').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'rented' && styles.filterPillActive]}
              onPress={() => setStatusFilter('rented')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.info }]} />
              <Text style={[styles.filterPillText, statusFilter === 'rented' && styles.filterPillTextActive]}>
                Active Rides ({cycles.filter((c) => c.status === 'rented').length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'maintenance' && styles.filterPillActive]}
              onPress={() => setStatusFilter('maintenance')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.filterPillText, statusFilter === 'maintenance' && styles.filterPillTextActive]}>
                Under Maintenance ({cycles.filter((c) => c.status === 'maintenance').length})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Secondary Filter: Cycle Type */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterPillsRow, { marginTop: 6 }]}>
            <TouchableOpacity
              style={[styles.typePill, typeFilter === 'all' && styles.typePillActive]}
              onPress={() => setTypeFilter('all')}
            >
              <Text style={[styles.typePillText, typeFilter === 'all' && styles.typePillTextActive]}>
                All Types
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typePill, typeFilter === 'gear' && styles.typePillActive]}
              onPress={() => setTypeFilter('gear')}
            >
              <Text style={[styles.typePillText, typeFilter === 'gear' && styles.typePillTextActive]}>
                ⚙️ Gear
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typePill, typeFilter === 'non-gear' && styles.typePillActive]}
              onPress={() => setTypeFilter('non-gear')}
            >
              <Text style={[styles.typePillText, typeFilter === 'non-gear' && styles.typePillTextActive]}>
                🚲 Non-Gear
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typePill, typeFilter === 'hybrid' && styles.typePillActive]}
              onPress={() => setTypeFilter('hybrid')}
            >
              <Text style={[styles.typePillText, typeFilter === 'hybrid' && styles.typePillTextActive]}>
                ⚡ Hybrid
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.typePill, typeFilter === 'electric' && styles.typePillActive]}
              onPress={() => setTypeFilter('electric')}
            >
              <Text style={[styles.typePillText, typeFilter === 'electric' && styles.typePillTextActive]}>
                🔋 Electric
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Loading Banner */}
        {loadingCycles && !refreshing && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingBannerText}>Loading campus cycles...</Text>
          </View>
        )}

        {/* Cycles Strips List */}
        <View style={styles.listContainer}>
          {loadingCycles && cycles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptyTitle}>Fetching Cycles</Text>
              <Text style={styles.emptySubtitle}>Retrieving verified cycles from campus server...</Text>
            </View>
          ) : filteredCycles.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Cycles Found</Text>
              <Text style={styles.emptySubtitle}>No cycles match your current search or filter criteria.</Text>
            </View>
          ) : (
            filteredCycles.map((cycle) => {
              const isExpanded = expandedCycleId === cycle.id;
              const isAvailable = cycle.status === 'available';
              const isRented = cycle.status === 'rented';

              return (
                <View
                  key={cycle.id}
                  style={[styles.stripCard, isExpanded && styles.stripCardExpanded]}
                >
                  {/* Single Compact Strip (Collapsed state: Photo, Location, Owner Name) */}
                  <TouchableOpacity
                    style={styles.stripHeaderRow}
                    onPress={() => handleToggleExpand(cycle.id)}
                    activeOpacity={0.8}
                  >
                    {/* Cycle Photo */}
                    <View style={styles.stripPhotoWrapper}>
                      {cycle.image_url ? (
                        <Image source={{ uri: cycle.image_url }} style={styles.stripPhoto} resizeMode="cover" />
                      ) : (
                        <View style={styles.stripPhotoPlaceholder}>
                          <Ionicons name="bicycle" size={24} color={colors.primary} />
                        </View>
                      )}
                      <View
                        style={[
                          styles.statusCornerDot,
                          {
                            backgroundColor: isAvailable
                              ? colors.accent
                              : isRented
                              ? colors.info
                              : colors.warning,
                          },
                        ]}
                      />
                    </View>

                    {/* Strip Main Content: Brand/Model, Location, Owner Name */}
                    <View style={styles.stripMainCol}>
                      <View style={styles.stripTitleRow}>
                        <Text style={styles.stripBrandModel} numberOfLines={1}>
                          {cycle.brand} {cycle.model}
                        </Text>
                        <Badge
                          variant={isAvailable ? 'success' : isRented ? 'primary' : 'warning'}
                          label={isAvailable ? 'Available' : isRented ? 'Rented' : 'Service'}
                          size="sm"
                        />
                      </View>

                      {/* Location */}
                      <View style={styles.stripMetaItem}>
                        <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.stripLocationText} numberOfLines={1}>
                          {cycle.location} {cycle.stand_number ? `• ${cycle.stand_number}` : ''}
                        </Text>
                      </View>

                      {/* Owner Name & Phone */}
                      <View style={styles.stripMetaItem}>
                        <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.stripOwnerText} numberOfLines={1}>
                          Owner: <Text style={styles.stripOwnerBold}>{cycle.owner_name}</Text>
                          {Boolean(cycle.owner_phone) ? ` • ${cycle.owner_phone}` : ''}
                        </Text>
                      </View>

                      {/* Listed Date */}
                      {Boolean(cycle.created_at) && (
                        <View style={styles.stripMetaItem}>
                          <Ionicons name="calendar-outline" size={12} color={colors.textLight} />
                          <Text style={styles.stripDateText} numberOfLines={1}>
                            Listed: {formatCycleDate(cycle.created_at)}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Expand/Collapse Chevron Indicator */}
                    <View style={styles.stripChevronWrapper}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={isExpanded ? colors.primary : colors.textLight}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Details: Price per day/hr, Description, Owner Mobile, Rating, Location */}
                  {isExpanded && (
                    <View style={styles.stripExpandedBody}>
                      <View style={styles.divider} />

                      {/* Pricing & Rating Row */}
                      <View style={styles.priceRatingRow}>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Hourly Rate</Text>
                          <Text style={styles.rateValue}>₹{cycle.price_per_hour}/hr</Text>
                        </View>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Daily Pass</Text>
                          <Text style={styles.rateValue}>₹{cycle.price_per_day}/day</Text>
                        </View>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Rider Rating</Text>
                          <View style={styles.ratingInline}>
                            <Ionicons name="star" size={14} color="#F59E0B" />
                            <Text style={styles.ratingScore}>{cycle.rating}</Text>
                            {cycle.review_count > 0 && (
                              <Text style={styles.ratingCount}>({cycle.review_count})</Text>
                            )}
                          </View>
                          {Boolean(cycle.created_at) && (
                            <Text style={styles.createdDateText}>Listed: {formatCycleDate(cycle.created_at)}</Text>
                          )}
                          {Boolean(cycle.updated_at) && !cycle.created_at && (
                            <Text style={styles.updatedDateText}>Updated: {formatCycleDate(cycle.updated_at)}</Text>
                          )}
                        </View>
                      </View>

                      {/* Specs Row: Cycle Type & Condition */}
                      <View style={styles.specsRow}>
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeLabel}>Type:</Text>
                          <Text style={styles.specBadgeValue}>{String(cycle.cycle_type).toUpperCase()}</Text>
                        </View>
                        {Boolean(cycle.condition) && (
                          <View style={styles.specBadge}>
                            <Text style={styles.specBadgeLabel}>Condition:</Text>
                            <Text style={styles.specBadgeValue}>{cycle.condition}</Text>
                          </View>
                        )}
                      </View>

                      {/* Description */}
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedSectionTitle}>Description</Text>
                        <Text style={styles.expandedDescText}>{cycle.description}</Text>
                      </View>

                      {/* Owner Info & Contact Button */}
                      <View style={styles.ownerContactCard}>
                        <View style={styles.ownerAvatar}>
                          <Text style={styles.ownerAvatarText}>
                            {cycle.owner_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.ownerDetailsCol}>
                          <Text style={styles.ownerCardName}>{cycle.owner_name}</Text>
                          {Boolean(cycle.owner_hostel) && (
                            <Text style={styles.ownerCardHostel}>{cycle.owner_hostel}</Text>
                          )}
                          <TouchableOpacity
                            disabled={!cycle.owner_phone}
                            onPress={() => handleCallOwner(cycle.owner_phone, cycle.owner_name)}
                            activeOpacity={0.7}
                            style={styles.ownerPhoneRow}
                          >
                            <Ionicons
                              name="call-outline"
                              size={12}
                              color={cycle.owner_phone ? colors.primary : colors.textLight}
                            />
                            <Text
                              style={[
                                styles.ownerCardPhone,
                                !cycle.owner_phone && styles.ownerCardPhoneMissing,
                              ]}
                            >
                              {cycle.owner_phone ? cycle.owner_phone : 'Phone not provided in profile'}
                            </Text>
                          </TouchableOpacity>
                          {Boolean(cycle.created_at) && (
                            <Text style={styles.ownerCardListedDate}>
                              📅 Listed on {formatCycleDate(cycle.created_at)}
                            </Text>
                          )}
                        </View>
                        {Boolean(cycle.owner_phone) && (
                          <TouchableOpacity
                            style={styles.callOwnerBtn}
                            onPress={() => handleCallOwner(cycle.owner_phone, cycle.owner_name)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="call" size={14} color={colors.white} />
                            <Text style={styles.callOwnerBtnText}>Call</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Detailed Location */}
                      <View style={styles.locationFooter}>
                        <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                        <Text style={styles.locationFooterText}>
                          Current Campus Stand: <Text style={{ fontWeight: '700' }}>{cycle.location}</Text>
                        </Text>
                      </View>
                    </View>
                  )}
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
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
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

  /* Filters */
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
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  typePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: '#EDF2F7',
  },
  typePillActive: {
    backgroundColor: colors.accent,
  },
  typePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  typePillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  /* Strips List */
  listContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  stripCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
    ...shadows.sm,
  },
  stripCardExpanded: {
    borderColor: colors.primary,
    ...shadows.md,
  },
  stripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md - 2,
  },
  stripPhotoWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  stripPhoto: {
    width: 54,
    height: 54,
    borderRadius: borderRadius.md,
  },
  stripPhotoPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  statusCornerDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.white,
  },
  stripMainCol: {
    flex: 1,
    justifyContent: 'center',
  },
  stripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  stripBrandModel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  stripMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  stripLocationText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  stripOwnerText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  stripOwnerBold: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stripDateText: {
    fontSize: 11,
    color: colors.textLight,
  },
  stripChevronWrapper: {
    marginLeft: 6,
    padding: 4,
  },

  /* Expanded Body */
  stripExpandedBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.md - 4,
  },
  priceRatingRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  rateBox: {
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  rateValue: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
  ratingInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingScore: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  ratingCount: {
    fontSize: 10,
    color: colors.textLight,
  },
  updatedDateText: {
    fontSize: 9,
    color: colors.textLight,
    marginTop: 2,
  },
  createdDateText: {
    fontSize: 9,
    color: colors.textLight,
    marginTop: 2,
  },
  specsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  specBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  specBadgeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  specBadgeValue: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expandedSection: {
    marginTop: spacing.sm + 2,
  },
  expandedSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 3,
  },
  expandedDescText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  ownerContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: borderRadius.md,
    padding: 10,
    marginTop: spacing.sm + 4,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  ownerAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  ownerDetailsCol: {
    flex: 1,
  },
  ownerCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ownerCardHostel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  ownerPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ownerCardPhone: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '600',
  },
  ownerCardPhoneMissing: {
    color: colors.textLight,
    fontWeight: '400',
  },
  ownerCardListedDate: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 3,
  },
  callOwnerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  callOwnerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  locationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm + 2,
    paddingTop: spacing.xs,
  },
  locationFooterText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
  },
  loadingBannerText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
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
