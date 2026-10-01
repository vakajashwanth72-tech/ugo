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
 * Matches the exact query from backend:
 * SELECT
 *   b.created_at,
 *   b.updated_at,
 *   b.id AS booking_id,
 *   b.start_time,
 *   b.end_time,
 *   b.status,
 *   b.return_image_url,
 *   b.total_amount,
 *   owner.full_name AS owner_name,
 *   renter.full_name AS renter_name
 * FROM booking_table b
 * JOIN profiles owner ON b.owner_id = owner.id
 * JOIN profiles renter ON b.renter_id = renter.id
 * WHERE b.status IN ('requested','slot_booked','payment_pending','active','payment_failed','return_pending','return_requested');
 */
export interface ActiveRideBooking {
  booking_id: string;
  status:
    | 'requested'
    | 'slot_booked'
    | 'payment_pending'
    | 'active'
    | 'payment_failed'
    | 'return_pending'
    | 'return_requested'
    | string;
  total_amount: number | string;
  start_time: string | null;
  end_time: string | null;
  return_image_url: string | null;
  owner_name: string;
  renter_name: string;
  created_at: string;
  updated_at: string;
}

function formatRideDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'Not scheduled';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (_) {
    return dateStr;
  }
}

function formatRideDate(dateStr?: string | null): string {
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

function getStatusConfig(status: string): {
  label: string;
  variant: 'success' | 'primary' | 'warning' | 'danger' | 'neutral';
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
} {
  const s = String(status || '').toLowerCase().trim();
  switch (s) {
    case 'active':
      return {
        label: 'Active Ride',
        variant: 'success',
        icon: 'bicycle',
        color: '#10B981',
        bgColor: '#ECFDF5',
      };
    case 'slot_booked':
      return {
        label: 'Slot Booked',
        variant: 'primary',
        icon: 'calendar-outline',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
      };
    case 'requested':
      return {
        label: 'Requested',
        variant: 'warning',
        icon: 'hourglass-outline',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
      };
    case 'payment_pending':
      return {
        label: 'Payment Pending',
        variant: 'warning',
        icon: 'cash-outline',
        color: '#F97316',
        bgColor: '#FFF7ED',
      };
    case 'payment_failed':
      return {
        label: 'Payment Failed',
        variant: 'danger',
        icon: 'alert-circle-outline',
        color: '#EF4444',
        bgColor: '#FEF2F2',
      };
    case 'return_pending':
      return {
        label: 'Return Pending',
        variant: 'neutral',
        icon: 'time-outline',
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
      };
    case 'return_requested':
      return {
        label: 'Return Requested',
        variant: 'neutral',
        icon: 'checkmark-circle-outline',
        color: '#6366F1',
        bgColor: '#EEF2FF',
      };
    default:
      return {
        label: status ? status.replace(/_/g, ' ').toUpperCase() : 'BOOKED',
        variant: 'primary',
        icon: 'bicycle-outline',
        color: colors.primary,
        bgColor: '#EFF6FF',
      };
  }
}

const MOCK_ACTIVE_RIDES: ActiveRideBooking[] = [
  {
    booking_id: 'b81f9a20-4e1b-4f40-8b01-192a7f5b3310',
    owner_name: 'Jaswanth V.',
    renter_name: 'Rahul Sharma',
    status: 'active',
    total_amount: '40',
    start_time: '2026-09-25T13:30:00.000Z',
    end_time: '2026-09-25T16:30:00.000Z',
    return_image_url: null,
    created_at: '2026-09-25T13:20:00.000Z',
    updated_at: '2026-09-25T13:30:00.000Z',
  },
  {
    booking_id: 'c90e21a4-78bb-4421-99af-412f88aa0192',
    owner_name: 'Sneha Patel',
    renter_name: 'Aditya Verma',
    status: 'return_requested',
    total_amount: '60',
    start_time: '2026-09-25T11:00:00.000Z',
    end_time: '2026-09-25T14:00:00.000Z',
    return_image_url: null,
    created_at: '2026-09-25T10:45:00.000Z',
    updated_at: '2026-09-25T14:05:00.000Z',
  },
  {
    booking_id: 'a71d8820-2210-410a-ba33-88201fe89441',
    owner_name: 'Vikram Singh',
    renter_name: 'Priya Nair',
    status: 'slot_booked',
    total_amount: '25',
    start_time: '2026-09-25T15:00:00.000Z',
    end_time: '2026-09-25T17:00:00.000Z',
    return_image_url: null,
    created_at: '2026-09-25T12:00:00.000Z',
    updated_at: '2026-09-25T12:00:00.000Z',
  },
  {
    booking_id: 'd4401fa9-3388-4e12-8700-112048aa7742',
    owner_name: 'Jaswanth V.',
    renter_name: 'Karthik Rao',
    status: 'requested',
    total_amount: '50',
    start_time: '2026-09-25T16:00:00.000Z',
    end_time: '2026-09-25T19:00:00.000Z',
    return_image_url: null,
    created_at: '2026-09-25T14:10:00.000Z',
    updated_at: '2026-09-25T14:10:00.000Z',
  },
  {
    booking_id: 'e10098fa-5512-4211-b009-9944101e4a19',
    owner_name: 'Anish Kumar',
    renter_name: 'Deepak Reddy',
    status: 'payment_pending',
    total_amount: '35',
    start_time: '2026-09-25T14:30:00.000Z',
    end_time: '2026-09-25T17:30:00.000Z',
    return_image_url: null,
    created_at: '2026-09-25T14:00:00.000Z',
    updated_at: '2026-09-25T14:05:00.000Z',
  },
];

export default function AdminActiveRidesScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [items, setItems] = useState<ActiveRideBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'slot_booked' | 'requested' | 'returns' | 'payment_issues'
  >('all');
  const [refreshing, setRefreshing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchActiveBookings = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      console.log('[AdminActiveRidesScreen] Calling GET /api/admin/activeBookings with raw access token...');
      const res = await apiClient.getActiveBookings();
      console.log('[AdminActiveRidesScreen] Received GET /api/admin/activeBookings response:', res);
      try {
        console.log('[AdminActiveRidesScreen] Full active bookings JSON:\n', JSON.stringify(res, null, 2));
      } catch (_) {}

      const rawList =
        res?.data?.rows ||
        res?.data ||
        res?.active_bookings?.rows ||
        res?.active_bookings ||
        res?.bookings?.rows ||
        res?.bookings ||
        res?.rows ||
        (Array.isArray(res) ? res : []);

      if (Array.isArray(rawList) && rawList.length > 0) {
        const mapped: ActiveRideBooking[] = rawList.map((item: any, idx: number) => {
          const bId = String(item.booking_id || item.id || `act-${idx}`);
          const rawReturnImg = item.return_image_url || item.return_image || item.returnImageUrl;
          const normalizedReturnImg = rawReturnImg ? getCycleImageUrl(rawReturnImg) : null;

          return {
            booking_id: bId,
            owner_name: item.owner_name || 'Owner',
            renter_name: item.renter_name || 'Renter',
            status: String(item.status || 'active').toLowerCase(),
            total_amount: item.total_amount !== undefined && item.total_amount !== null ? item.total_amount : 0,
            start_time: item.start_time || null,
            end_time: item.end_time || null,
            return_image_url: normalizedReturnImg,
            created_at: item.created_at || '',
            updated_at: item.updated_at || '',
          };
        });
        setItems(mapped);
      } else if (Array.isArray(rawList) && rawList.length === 0) {
        setItems([]);
      } else {
        // Fallback to sample data if backend returned non-array
        setItems(MOCK_ACTIVE_RIDES);
      }
    } catch (err: any) {
      console.warn('[AdminActiveRidesScreen] Error fetching active bookings from GET /api/admin/activeBookings:', err?.message || err);
      // Fallback mock to allow admin testing
      setItems((prev) => (prev.length > 0 ? prev : MOCK_ACTIVE_RIDES));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchActiveBookings(false);
    }
  }, [fetchActiveBookings]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchActiveBookings(true);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleCopyBookingId = (bookingId: string) => {
    Alert.alert('Booking Reference', `Full Booking ID:\n\n${bookingId}`);
  };

  const filteredItems = items.filter((item) => {
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'active' && item.status !== 'active') return false;
      if (statusFilter === 'slot_booked' && item.status !== 'slot_booked') return false;
      if (statusFilter === 'requested' && item.status !== 'requested') return false;
      if (statusFilter === 'returns') {
        if (item.status !== 'return_pending' && item.status !== 'return_requested') return false;
      }
      if (statusFilter === 'payment_issues') {
        if (item.status !== 'payment_pending' && item.status !== 'payment_failed') return false;
      }
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.renter_name.toLowerCase().includes(q) ||
      item.owner_name.toLowerCase().includes(q) ||
      item.booking_id.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      String(item.total_amount).includes(q)
    );
  });

  const activeCount = items.filter((i) => i.status === 'active').length;
  const slotBookedCount = items.filter((i) => i.status === 'slot_booked').length;
  const requestedCount = items.filter((i) => i.status === 'requested').length;
  const returnsCount = items.filter((i) => i.status === 'return_pending' || i.status === 'return_requested').length;
  const paymentIssuesCount = items.filter((i) => i.status === 'payment_pending' || i.status === 'payment_failed').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Screen Header */}
      <Header
        title="Active Rides & Bookings"
        showBack={true}
        onBack={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerBadge}>
            <Ionicons name="bicycle" size={14} color={colors.accent} />
            <Text style={styles.headerBadgeText}>{filteredItems.length} Rides</Text>
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
              placeholder="Search by renter, owner, ID, status..."
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

        {/* Status Filters */}
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
              style={[styles.filterPill, statusFilter === 'active' && styles.filterPillActive]}
              onPress={() => setStatusFilter('active')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.filterPillText, statusFilter === 'active' && styles.filterPillTextActive]}>
                Active ({activeCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'slot_booked' && styles.filterPillBlueActive]}
              onPress={() => setStatusFilter('slot_booked')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#3B82F6' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'slot_booked' && styles.filterPillBlueTextActive,
                ]}
              >
                Slot Booked ({slotBookedCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'requested' && styles.filterPillWarningActive]}
              onPress={() => setStatusFilter('requested')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'requested' && styles.filterPillWarningTextActive,
                ]}
              >
                Requested ({requestedCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'returns' && styles.filterPillPurpleActive]}
              onPress={() => setStatusFilter('returns')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#8B5CF6' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'returns' && styles.filterPillPurpleTextActive,
                ]}
              >
                Returns ({returnsCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'payment_issues' && styles.filterPillRedActive]}
              onPress={() => setStatusFilter('payment_issues')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'payment_issues' && styles.filterPillRedTextActive,
                ]}
              >
                Payment Issues ({paymentIssuesCount})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Loading Indicator */}
        {loading && items.length > 0 && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingBannerText}>Refreshing active campus rides...</Text>
          </View>
        )}

        {/* List of Active Bookings */}
        <View style={styles.listContainer}>
          {loading && items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.emptyTitle}>Fetching Active Rides</Text>
              <Text style={styles.emptySubtitle}>Connecting to campus booking server...</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="bicycle-outline" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Active Rides Found</Text>
              <Text style={styles.emptySubtitle}>No records match your search or filter selection.</Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedId === item.booking_id;
              const statusCfg = getStatusConfig(item.status);
              const returnImg = item.return_image_url;

              return (
                <View
                  key={item.booking_id}
                  style={[styles.stripCard, isExpanded && styles.stripCardExpanded]}
                >
                  {/* Single Compact Strip Header */}
                  <TouchableOpacity
                    style={styles.stripHeaderRow}
                    onPress={() => handleToggleExpand(item.booking_id)}
                    activeOpacity={0.8}
                  >
                    {/* Visual Icon / Return Photo Thumbnail */}
                    <View style={styles.stripPhotoWrapper}>
                      {returnImg ? (
                        <Image source={{ uri: returnImg }} style={styles.stripPhoto} resizeMode="cover" />
                      ) : (
                        <View style={[styles.stripPhotoPlaceholder, { backgroundColor: statusCfg.bgColor }]}>
                          <Ionicons name={statusCfg.icon} size={22} color={statusCfg.color} />
                        </View>
                      )}
                      <View style={[styles.statusCornerDot, { backgroundColor: statusCfg.color }]} />
                    </View>

                    {/* Strip Main Info */}
                    <View style={styles.stripMainCol}>
                      {/* Top Row: Renter Name & Status Badge */}
                      <View style={styles.stripTitleRow}>
                        <View style={styles.renterNameRow}>
                          <Text style={styles.stripRenterName} numberOfLines={1}>
                            {item.renter_name}
                          </Text>
                          <Text style={styles.renterRoleBadge}>Renter</Text>
                        </View>
                        <Badge variant={statusCfg.variant} label={statusCfg.label} size="sm" />
                      </View>

                      {/* Second Row: Owner Name */}
                      <View style={styles.stripMetaItem}>
                        <Ionicons name="person-outline" size={12} color={colors.textSecondary} />
                        <Text style={styles.stripMetaText} numberOfLines={1}>
                          Owner: <Text style={styles.stripMetaBold}>{item.owner_name}</Text>
                        </Text>
                      </View>

                      {/* Third Row: Time & Amount */}
                      <View style={styles.stripBottomRow}>
                        <View style={styles.stripTimeItem}>
                          <Ionicons name="time-outline" size={12} color={colors.textLight} />
                          <Text style={styles.stripTimeText} numberOfLines={1}>
                            {formatRideDateTime(item.start_time)}
                          </Text>
                        </View>
                        <View style={styles.amountPill}>
                          <Text style={styles.amountPillText}>₹{item.total_amount}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Chevron Indicator */}
                    <View style={styles.stripChevronWrapper}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={isExpanded ? colors.accent : colors.textLight}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Card Details */}
                  {isExpanded && (
                    <View style={styles.stripExpandedBody}>
                      <View style={styles.divider} />

                      {/* Highlights: Fare, Status, Booking ID */}
                      <View style={styles.summaryRow}>
                        <View style={styles.summaryBox}>
                          <Text style={styles.summaryLabel}>Total Amount</Text>
                          <Text style={styles.summaryValueAmount}>₹{item.total_amount}</Text>
                        </View>
                        <View style={styles.summaryBox}>
                          <Text style={styles.summaryLabel}>Ride Status</Text>
                          <View style={styles.summaryStatusBadge}>
                            <View style={[styles.statusMiniDot, { backgroundColor: statusCfg.color }]} />
                            <Text style={[styles.summaryStatusText, { color: statusCfg.color }]}>
                              {statusCfg.label}
                            </Text>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.summaryBox}
                          onPress={() => handleCopyBookingId(item.booking_id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.summaryLabel}>Booking Ref</Text>
                          <View style={styles.bookingIdRow}>
                            <Text style={styles.bookingIdShort} numberOfLines={1}>
                              #{item.booking_id.slice(0, 8)}
                            </Text>
                            <Ionicons name="copy-outline" size={11} color={colors.primary} />
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Ride Schedule Timeline */}
                      <View style={styles.scheduleCard}>
                        <Text style={styles.cardSectionTitle}>Ride Schedule & Timestamps</Text>

                        <View style={styles.scheduleTimelineRow}>
                          <View style={styles.timelinePoint}>
                            <View style={[styles.timelineDot, { backgroundColor: colors.accent }]} />
                            <View style={styles.timelineContent}>
                              <Text style={styles.timelineLabel}>Start Time</Text>
                              <Text style={styles.timelineValue}>{formatRideDateTime(item.start_time)}</Text>
                            </View>
                          </View>

                          <View style={styles.timelinePoint}>
                            <View style={[styles.timelineDot, { backgroundColor: colors.info }]} />
                            <View style={styles.timelineContent}>
                              <Text style={styles.timelineLabel}>End / Scheduled Return</Text>
                              <Text style={styles.timelineValue}>{formatRideDateTime(item.end_time)}</Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.timestampsMetaRow}>
                          {Boolean(item.created_at) && (
                            <Text style={styles.metaTimestampText}>
                              📅 Booked: {formatRideDateTime(item.created_at)}
                            </Text>
                          )}
                          {Boolean(item.updated_at) && (
                            <Text style={styles.metaTimestampText}>
                              ⏱️ Updated: {formatRideDateTime(item.updated_at)}
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Parties Involved: Renter & Owner Card */}
                      <View style={styles.partiesGrid}>
                        {/* Renter Box */}
                        <View style={styles.partyCard}>
                          <View style={[styles.partyAvatar, { backgroundColor: '#EFF6FF' }]}>
                            <Ionicons name="person" size={16} color={colors.primary} />
                          </View>
                          <View style={styles.partyDetails}>
                            <Text style={styles.partyRoleLabel}>Renter / Rider</Text>
                            <Text style={styles.partyName} numberOfLines={1}>
                              {item.renter_name}
                            </Text>
                          </View>
                        </View>

                        {/* Owner Box */}
                        <View style={styles.partyCard}>
                          <View style={[styles.partyAvatar, { backgroundColor: '#ECFDF5' }]}>
                            <Ionicons name="bicycle" size={16} color={colors.accent} />
                          </View>
                          <View style={styles.partyDetails}>
                            <Text style={styles.partyRoleLabel}>Cycle Owner</Text>
                            <Text style={styles.partyName} numberOfLines={1}>
                              {item.owner_name}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Return Image Photo Verification (if uploaded) */}
                      {Boolean(item.return_image_url) && (
                        <View style={styles.returnImageSection}>
                          <View style={styles.returnImageHeaderRow}>
                            <Ionicons name="camera-outline" size={14} color={colors.textPrimary} />
                            <Text style={styles.returnImageTitle}>Return Verification Photo</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setPreviewImage(item.return_image_url)}
                            activeOpacity={0.9}
                            style={styles.returnImageWrapper}
                          >
                            <Image
                              source={{ uri: item.return_image_url! }}
                              style={styles.returnImagePreview}
                              resizeMode="cover"
                            />
                            <View style={styles.returnImageOverlay}>
                              <Ionicons name="scan-outline" size={18} color={colors.white} />
                              <Text style={styles.returnImageOverlayText}>Tap to inspect full photo</Text>
                            </View>
                          </TouchableOpacity>
                        </View>
                      )}

                      {/* Footer Actions */}
                      <View style={styles.cardFooter}>
                        <TouchableOpacity
                          style={styles.viewRefBtn}
                          onPress={() => handleCopyBookingId(item.booking_id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="document-text-outline" size={13} color={colors.primary} />
                          <Text style={styles.viewRefBtnText}>View Full Reference ID</Text>
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

      {/* Full Photo Preview Modal */}
      <Modal visible={Boolean(previewImage)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <TouchableOpacity
            style={styles.modalCloseBtn}
            onPress={() => setPreviewImage(null)}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </TouchableOpacity>
          {Boolean(previewImage) && (
            <Image source={{ uri: previewImage! }} style={styles.modalFullImage} resizeMode="contain" />
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
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
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
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterPillBlueActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterPillWarningActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  filterPillPurpleActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
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
  filterPillBlueTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillWarningTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillPurpleTextActive: {
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

  /* Card */
  stripCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
    overflow: 'hidden',
  },
  stripCardExpanded: {
    borderColor: '#A7F3D0',
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
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
  },
  stripPhotoPlaceholder: {
    width: 48,
    height: 48,
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
  renterNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
    marginRight: 6,
  },
  stripRenterName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  renterRoleBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  stripMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  stripMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  stripMetaBold: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stripBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  stripTimeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  stripTimeText: {
    fontSize: 10,
    color: colors.textLight,
  },
  amountPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  amountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.accent,
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

  /* Summary Row */
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  summaryBox: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  summaryValueAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
  },
  summaryStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  summaryStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  bookingIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bookingIdShort: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  /* Schedule Card */
  scheduleCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: 10,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  scheduleTimelineRow: {
    gap: 8,
  },
  timelinePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  timelineValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timestampsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 8,
    paddingTop: 6,
  },
  metaTimestampText: {
    fontSize: 9,
    color: colors.textLight,
  },

  /* Parties Grid */
  partiesGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
  },
  partyCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  partyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  partyDetails: {
    flex: 1,
  },
  partyRoleLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  partyName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  /* Return Image */
  returnImageSection: {
    marginTop: spacing.sm,
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  returnImageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  returnImageTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  returnImageWrapper: {
    position: 'relative',
    height: 120,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  returnImagePreview: {
    width: '100%',
    height: '100%',
  },
  returnImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
  },
  returnImageOverlayText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },

  /* Footer */
  cardFooter: {
    marginTop: spacing.sm,
    alignItems: 'flex-end',
  },
  viewRefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  viewRefBtnText: {
    fontSize: 11,
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

  /* Full Photo Modal */
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
