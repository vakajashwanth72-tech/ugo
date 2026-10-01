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
  ActivityIndicator,
  Modal,
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

/**
 * Matches backend query:
 * select 
 *   cv.status,
 *   c.id,
 *   c.description,
 *   c.cycle_type,
 *   c.brand,
 *   c.model,
 *   c.condition,
 *   c.price_per_hour,
 *   c.price_per_day,
 *   c.location,
 *   c.updated_at,
 *   c.rating,
 *   p.full_name as owner_name,
 *   COALESCE(
 *     json_agg(
 *       json_build_object('image_url', ci.image_url, 'display_order', ci.display_order) 
 *       ORDER BY ci.display_order
 *     ) FILTER (WHERE ci.image_url IS NOT NULL),
 *     '[]'::json
 *   ) AS images 
 * from cycle_verification cv 
 * JOIN cycles c ON cv.cycle_id = c.id 
 * JOIN profiles p ON c.owner_id = p.id 
 * LEFT JOIN cycle_images ci ON ci.cycle_id = c.id 
 * where cv.assigned_admin_id = $1 
 * GROUP BY cv.status, c.id, p.full_name;
 */
export interface AdminCycleVerificationItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'verified' | 'completed' | string;
  description: string;
  cycle_type: string;
  brand: string;
  model: string;
  condition: string;
  price_per_hour: number;
  price_per_day: number;
  location: string;
  updated_at: string;
  rating: number | null;
  owner_name: string;
  images: { image_url: string; display_order?: number }[];
}

function formatDate(dateStr?: string | null): string {
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

function getVerificationStatusConfig(status: string): {
  label: string;
  variant: 'warning' | 'success' | 'danger' | 'primary' | 'neutral';
  color: string;
  bgColor: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  const s = String(status || '').toLowerCase().trim();
  switch (s) {
    case 'pending':
      return {
        label: 'Pending Review',
        variant: 'warning',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
        icon: 'hourglass-outline',
      };
    case 'approved':
    case 'verified':
    case 'completed':
      return {
        label: 'Approved',
        variant: 'success',
        color: '#10B981',
        bgColor: '#ECFDF5',
        icon: 'shield-checkmark',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        variant: 'danger',
        color: '#EF4444',
        bgColor: '#FEF2F2',
        icon: 'close-circle-outline',
      };
    default:
      return {
        label: status ? status.toUpperCase() : 'PENDING',
        variant: 'neutral',
        color: colors.primary,
        bgColor: '#EFF6FF',
        icon: 'bicycle-outline',
      };
  }
}

const MOCK_VERIFICATIONS: AdminCycleVerificationItem[] = [
  {
    id: '6f3e8803-d103-45c6-9843-add6ca4fbbfc',
    status: 'pending',
    description: 'Helmet available with high durability hybrid tires.',
    cycle_type: 'hybrid',
    brand: 'Hero',
    model: 'Vaka',
    condition: 'good',
    price_per_hour: 10,
    price_per_day: 50,
    location: 'Block-11 Shiwalik',
    updated_at: '2026-09-21T15:48:07.705Z',
    rating: null,
    owner_name: 'jaswanth',
    images: [],
  },
  {
    id: 'c6939f95-aed1-43e6-8d31-7c28fae58a65',
    status: 'pending',
    description: 'Well maintained daily campus commuter cycle.',
    cycle_type: 'hybrid',
    brand: 'Vaka',
    model: 'Hel',
    condition: 'good',
    price_per_hour: 10,
    price_per_day: 50,
    location: 'Block-8 Trishul',
    updated_at: '2026-09-22T10:14:02.100Z',
    rating: null,
    owner_name: 'jaswanth',
    images: [],
  },
  {
    id: 'a1002341-9921-4d44-8800-449102aa8810',
    status: 'approved',
    description: 'B-Twin Riverside 7-speed hybrid cycle with Shimano gears and mudguard.',
    cycle_type: 'gear',
    brand: 'B-Twin',
    model: 'Riverside 120',
    condition: 'excellent',
    price_per_hour: 5,
    price_per_day: 35,
    location: 'Mega Tower Block-A',
    updated_at: '2026-09-20T12:00:00.000Z',
    rating: 4.8,
    owner_name: 'Jaswanth V.',
    images: [
      { image_url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=600&q=80', display_order: 1 },
    ],
  },
];

export default function AdminCycleVerificationsScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [items, setItems] = useState<AdminCycleVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'approved' | 'rejected'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'gear' | 'non-gear' | 'hybrid' | 'electric'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchVerifications = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      console.log('[AdminCycleVerificationsScreen] Calling GET /api/admin/cycleVerifications with raw access token...');
      const res = await apiClient.getAdminCycleVerifications();
      console.log('[AdminCycleVerificationsScreen] Received GET /api/admin/cycleVerifications response:', res);
      try {
        console.log('[AdminCycleVerificationsScreen] Full cycle verifications JSON:\n', JSON.stringify(res, null, 2));
      } catch (_) {}

      const rawList =
        res?.data?.rows ||
        res?.data ||
        res?.cycle_verification_data?.rows ||
        res?.cycle_verification_data ||
        res?.cycle_verifications?.rows ||
        res?.cycle_verifications ||
        res?.cycleVerifications ||
        res?.rows ||
        (Array.isArray(res) ? res : []);

      if (Array.isArray(rawList) && rawList.length > 0) {
        const mapped: AdminCycleVerificationItem[] = rawList.map((item: any, idx: number) => {
          let parsedImages: { image_url: string; display_order?: number }[] = [];
          const rawImgs = item.images || item.cycle_images || item.coalesce || item.json_agg;
          if (Array.isArray(rawImgs)) {
            parsedImages = rawImgs;
          } else if (typeof rawImgs === 'string' && rawImgs.trim().startsWith('[')) {
            try {
              parsedImages = JSON.parse(rawImgs);
            } catch (_) {}
          } else if (item.image_url || item.image) {
            parsedImages = [{ image_url: item.image_url || item.image, display_order: 1 }];
          }

          return {
            id: String(item.id || item.cycle_id || `cv-${idx}`),
            status: String(item.status || 'pending').toLowerCase().trim(),
            description: item.description || 'No description provided.',
            cycle_type: item.cycle_type || 'gear',
            brand: item.brand || 'Campus Cycle',
            model: item.model || '',
            condition: item.condition || 'Good',
            price_per_hour: Number(item.price_per_hour) || 0,
            price_per_day: Number(item.price_per_day) || 0,
            location: item.location || 'NITK Campus Stand',
            updated_at: item.updated_at || '',
            rating: item.rating !== null && item.rating !== undefined ? Number(item.rating) : null,
            owner_name: item.owner_name || item.full_name || 'Student Owner',
            images: parsedImages,
          };
        });
        setItems(mapped);
      } else if (Array.isArray(rawList) && rawList.length === 0) {
        setItems([]);
      } else {
        setItems(MOCK_VERIFICATIONS);
      }
    } catch (err: any) {
      console.warn('[AdminCycleVerificationsScreen] Error fetching cycle verifications:', err?.message || err);
      setItems((prev) => (prev.length > 0 ? prev : MOCK_VERIFICATIONS));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchVerifications(false);
    }
  }, [fetchVerifications]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchVerifications(true);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleOpenVerification = (item: AdminCycleVerificationItem) => {
    const primaryImg = item.images[0]?.image_url ? getCycleImageUrl(item.images[0].image_url) : undefined;
    const allImgs = item.images
      .map((img) => (img?.image_url ? getCycleImageUrl(img.image_url) : null))
      .filter(Boolean) as string[];

    navigation.navigate('CycleVerification', {
      cycleId: item.id,
      cycle: {
        id: item.id,
        brand: item.brand,
        model: item.model,
        cycle_type: item.cycle_type as any,
        condition: item.condition,
        location: item.location,
        price_per_hour: item.price_per_hour,
        price_per_day: item.price_per_day,
        description: item.description,
        is_verified: item.status === 'approved' || item.status === 'verified',
        owner_id: '',
        owner_name: item.owner_name,
        images: allImgs,
        image: primaryImg,
        status: item.status as any,
        created_at: item.updated_at || new Date().toISOString(),
      } as any,
    });
  };

  const filteredItems = items.filter((item) => {
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && item.status !== 'pending') return false;
      if (statusFilter === 'completed') {
        if (item.status === 'pending') return false;
      }
      if (statusFilter === 'approved') {
        if (item.status !== 'approved' && item.status !== 'verified' && item.status !== 'completed') return false;
      }
      if (statusFilter === 'rejected' && item.status !== 'rejected') return false;
    }

    // Type filter
    if (typeFilter !== 'all' && item.cycle_type.toLowerCase() !== typeFilter) return false;

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.brand.toLowerCase().includes(q) ||
      item.model.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.owner_name.toLowerCase().includes(q) ||
      item.condition.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q)
    );
  });

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const completedCount = items.filter((i) => i.status !== 'pending').length;
  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'verified' || i.status === 'completed').length;
  const rejectedCount = items.filter((i) => i.status === 'rejected').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <Header
        title="Cycle Verifications"
        showBack={true}
        onBack={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={styles.headerBadgeText}>{filteredItems.length} Cycles</Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by brand, model, location, owner..."
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

        {/* Status Filters: All, Pending, Completed, Approved, Rejected */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterPillText, statusFilter === 'all' && styles.filterPillTextActive]}>
                All ({items.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'pending' && styles.filterPillWarningActive]}
              onPress={() => setStatusFilter('pending')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'pending' && styles.filterPillWarningTextActive,
                ]}
              >
                Pending ({pendingCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'completed' && styles.filterPillGreenActive]}
              onPress={() => setStatusFilter('completed')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'completed' && styles.filterPillGreenTextActive,
                ]}
              >
                Completed ({completedCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'approved' && styles.filterPillGreenActive]}
              onPress={() => setStatusFilter('approved')}
            >
              <Ionicons
                name="checkmark"
                size={12}
                color={statusFilter === 'approved' ? colors.white : '#10B981'}
              />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'approved' && styles.filterPillGreenTextActive,
                ]}
              >
                Approved ({approvedCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'rejected' && styles.filterPillRedActive]}
              onPress={() => setStatusFilter('rejected')}
            >
              <Ionicons
                name="close"
                size={12}
                color={statusFilter === 'rejected' ? colors.white : '#EF4444'}
              />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'rejected' && styles.filterPillRedTextActive,
                ]}
              >
                Rejected ({rejectedCount})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Cycle Type Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterPillsRow, { marginTop: 6 }]}
          >
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
        {loading && items.length > 0 && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingBannerText}>Refreshing cycle verifications...</Text>
          </View>
        )}

        {/* Verification Items List */}
        <View style={styles.listContainer}>
          {loading && items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.emptyTitle}>Fetching Cycle Verifications</Text>
              <Text style={styles.emptySubtitle}>Connecting to campus administration server...</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.accent} />
              <Text style={styles.emptyTitle}>No Verification Records Found</Text>
              <Text style={styles.emptySubtitle}>
                No cycle verification requests match your filter selection.
              </Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const isPending = item.status === 'pending';
              const statusCfg = getVerificationStatusConfig(item.status);
              const thumbUrl = item.images[0]?.image_url ? getCycleImageUrl(item.images[0].image_url) : null;

              return (
                <View key={item.id} style={[styles.stripCard, isExpanded && styles.stripCardExpanded]}>
                  {/* Single Compact Strip Header */}
                  <TouchableOpacity
                    style={styles.stripHeaderRow}
                    onPress={() => handleToggleExpand(item.id)}
                    activeOpacity={0.8}
                  >
                    {/* Thumbnail Photo with Status Dot */}
                    <View style={styles.stripPhotoWrapper}>
                      {thumbUrl ? (
                        <Image source={{ uri: thumbUrl }} style={styles.stripPhoto} resizeMode="cover" />
                      ) : (
                        <View style={[styles.stripPhotoPlaceholder, { backgroundColor: statusCfg.bgColor }]}>
                          <Ionicons name="bicycle" size={24} color={statusCfg.color} />
                        </View>
                      )}
                      <View style={[styles.statusCornerDot, { backgroundColor: statusCfg.color }]} />
                    </View>

                    {/* Middle Info Column */}
                    <View style={styles.stripMainCol}>
                      <View style={styles.stripTitleRow}>
                        <Text style={styles.stripBrandModel} numberOfLines={1}>
                          {item.brand} {item.model}
                        </Text>
                        <Badge variant={statusCfg.variant} label={statusCfg.label} size="sm" />
                      </View>

                      {/* Location */}
                      <View style={styles.stripMetaItem}>
                        <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                        <Text style={styles.stripLocationText} numberOfLines={1}>
                          {item.location}
                        </Text>
                      </View>

                      {/* Owner & Price */}
                      <View style={styles.stripMetaRow}>
                        <View style={styles.stripMetaItem}>
                          <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.stripOwnerText} numberOfLines={1}>
                            Owner: <Text style={styles.stripOwnerBold}>{item.owner_name}</Text>
                          </Text>
                        </View>
                        <Text style={styles.stripPricePill}>
                          ₹{item.price_per_hour}/hr • ₹{item.price_per_day}/day
                        </Text>
                      </View>
                    </View>

                    {/* Chevron Indicator */}
                    <View style={styles.stripChevronWrapper}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={isExpanded ? colors.primary : colors.textLight}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded View */}
                  {isExpanded && (
                    <View style={styles.stripExpandedBody}>
                      <View style={styles.divider} />

                      {/* Pricing & Rating Row */}
                      <View style={styles.priceRatingRow}>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Hourly Rate</Text>
                          <Text style={styles.rateValue}>₹{item.price_per_hour}/hr</Text>
                        </View>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Daily Pass</Text>
                          <Text style={styles.rateValue}>₹{item.price_per_day}/day</Text>
                        </View>
                        <View style={styles.rateBox}>
                          <Text style={styles.rateLabel}>Status</Text>
                          <View style={styles.statusInline}>
                            <View style={[styles.statusMiniDot, { backgroundColor: statusCfg.color }]} />
                            <Text style={[styles.statusScore, { color: statusCfg.color }]}>
                              {statusCfg.label}
                            </Text>
                          </View>
                          {Boolean(item.updated_at) && (
                            <Text style={styles.updatedDateText}>Updated: {formatDate(item.updated_at)}</Text>
                          )}
                        </View>
                      </View>

                      {/* Specs: Type & Condition */}
                      <View style={styles.specsRow}>
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeLabel}>Type:</Text>
                          <Text style={styles.specBadgeValue}>{String(item.cycle_type).toUpperCase()}</Text>
                        </View>
                        <View style={styles.specBadge}>
                          <Text style={styles.specBadgeLabel}>Condition:</Text>
                          <Text style={styles.specBadgeValue}>{item.condition}</Text>
                        </View>
                      </View>

                      {/* Description */}
                      <View style={styles.expandedSection}>
                        <Text style={styles.expandedSectionTitle}>Description</Text>
                        <Text style={styles.expandedDescText}>{item.description}</Text>
                      </View>

                      {/* Image Gallery (if images exist) */}
                      {item.images.length > 0 && (
                        <View style={styles.gallerySection}>
                          <Text style={styles.gallerySectionTitle}>
                            Verification Photos ({item.images.length})
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
                            {item.images.map((imgObj, imgIdx) => {
                              const imgUrl = getCycleImageUrl(imgObj.image_url);
                              return (
                                <TouchableOpacity
                                  key={imgIdx}
                                  onPress={() => setModalImage(imgUrl)}
                                  activeOpacity={0.85}
                                  style={styles.galleryThumbWrapper}
                                >
                                  <Image source={{ uri: imgUrl }} style={styles.galleryThumb} resizeMode="cover" />
                                  <View style={styles.galleryOverlay}>
                                    <Ionicons name="scan-outline" size={14} color={colors.white} />
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}

                      {/* Owner Details Card & Action Button */}
                      <View style={styles.ownerContactCard}>
                        <View style={styles.ownerAvatar}>
                          <Text style={styles.ownerAvatarText}>
                            {item.owner_name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.ownerDetailsCol}>
                          <Text style={styles.ownerCardName}>{item.owner_name}</Text>
                          <Text style={styles.ownerCardSub}>NITK Student Owner</Text>
                        </View>

                        {/* Direct Verify / View Details Action */}
                        <TouchableOpacity
                          style={[
                            styles.verifyBtn,
                            !isPending && { backgroundColor: colors.accent },
                          ]}
                          onPress={() => handleOpenVerification(item)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name={isPending ? 'shield-checkmark' : 'eye-outline'}
                            size={14}
                            color={colors.white}
                          />
                          <Text style={styles.verifyBtnText}>
                            {isPending ? 'Review & Verify' : 'View Details'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Full Photo Modal */}
      <Modal visible={Boolean(modalImage)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setModalImage(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          {Boolean(modalImage) && (
            <Image source={{ uri: modalImage! }} style={styles.modalFullImage} resizeMode="contain" />
          )}
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
  filterPillWarningActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  filterPillGreenActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterPillRedActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
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
  filterPillWarningTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillGreenTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillRedTextActive: {
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
    backgroundColor: colors.primary,
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

  /* Loading Banner */
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  loadingBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  /* List */
  listContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 10,
  },

  /* Strip Card */
  stripCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
    overflow: 'hidden',
  },
  stripCardExpanded: {
    borderColor: '#BFDBFE',
    backgroundColor: colors.white,
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
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
  },
  stripPhotoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCornerDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  stripMainCol: {
    flex: 1,
  },
  stripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
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
  stripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  stripOwnerText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  stripOwnerBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stripPricePill: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stripChevronWrapper: {
    paddingLeft: 6,
  },

  /* Expanded */
  stripExpandedBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.sm + 2,
  },
  priceRatingRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    justifyContent: 'space-around',
    alignItems: 'center',
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
    color: colors.primary,
  },
  statusInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusScore: {
    fontSize: 12,
    fontWeight: '700',
  },
  updatedDateText: {
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

  /* Gallery */
  gallerySection: {
    marginTop: spacing.sm + 2,
  },
  gallerySectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  galleryRow: {
    gap: 8,
  },
  galleryThumbWrapper: {
    position: 'relative',
    width: 70,
    height: 70,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  galleryThumb: {
    width: '100%',
    height: '100%',
  },
  galleryOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 2,
  },

  /* Owner Card */
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
  ownerCardSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
  },
  verifyBtnText: {
    fontSize: 12,
    fontWeight: '700',
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

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  modalFullImage: {
    width: '90%',
    height: '80%',
  },
});
