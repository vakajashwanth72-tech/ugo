import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { apiClient, BookingHistoryItem, extractBookingHistory } from '../../lib/apiClient';
import { getCycleImageUrl } from '../../lib/cycleUtils';
import Header from '../../components/ui/Header';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'Not recorded';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dateStr);
  }
}

// Only allow cancellation for requested, slot booked, payment pending, and payment failed
function canCancelBooking(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase().replace(/[\s-]+/g, '_').trim();
  return (
    s === 'requested' ||
    s === 'slot_booked' ||
    s === 'payment_pending' ||
    s === 'payment_failed'
  );
}

function getStatusTheme(status: string) {
  const s = (status || '').toLowerCase().replace(/[\s-]+/g, '_').trim();
  switch (s) {
    case 'completed':
      return {
        bg: '#ECFDF5',
        border: '#10B981',
        text: '#065F46',
        label: 'COMPLETED',
        icon: 'checkmark-circle' as const,
      };
    case 'cancelled':
    case 'canceled':
    case 'rejected':
      return {
        bg: '#FEF2F2',
        border: '#EF4444',
        text: '#B91C1C',
        label: 'CANCELLED',
        icon: 'close-circle' as const,
      };
    case 'requested':
      return {
        bg: '#EFF6FF',
        border: '#3B82F6',
        text: '#1D4ED8',
        label: 'REQUESTED',
        icon: 'time' as const,
      };
    case 'payment_pending':
      return {
        bg: '#FFFBEB',
        border: '#F59E0B',
        text: '#B45309',
        label: 'PAYMENT PENDING',
        icon: 'card' as const,
      };
    case 'payment_failed':
      return {
        bg: '#FEF2F2',
        border: '#DC2626',
        text: '#991B1B',
        label: 'PAYMENT FAILED',
        icon: 'alert-circle' as const,
      };
    case 'active':
    case 'ongoing':
    case 'slot_booked':
      return {
        bg: '#F5F3FF',
        border: '#8B5CF6',
        text: '#6D28D9',
        label: s.replace(/_/g, ' ').toUpperCase(),
        icon: 'bicycle' as const,
      };
    default:
      return {
        bg: colors.surfaceLight,
        border: colors.borderLight,
        text: colors.textSecondary,
        label: s.replace(/_/g, ' ').toUpperCase() || 'RECORDED',
        icon: 'help-circle' as const,
      };
  }
}

export default function BookingHistoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, profile, refreshProfile } = useAuth();

  const [bookings, setBookings] = useState<BookingHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'requested' | 'completed' | 'cancelled'>('all');
  const [loadingCycleId, setLoadingCycleId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);


  // Fetches booking and rental history from backend GET /api/profile/booking-history
  const fetchBookings = useCallback(async (isPullToRefresh = false) => {
    if (!isPullToRefresh) setLoading(true);

    try {
      console.log('[BookingHistoryScreen] Fetching booking history from GET /api/profile/booking-history...');
      const res = await apiClient.getBookingHistory();
      console.log('[BookingHistoryScreen] Received booking history response from backend:', res);

      const list = extractBookingHistory(res);
      setBookings(list);
    } catch (err: any) {
      console.error('[BookingHistoryScreen] Error fetching booking history:', err?.message || err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch fresh data upon screen entry; clean memory when moving away
  useFocusEffect(
    useCallback(() => {
      fetchBookings();

      return () => {
        setBookings([]);
        setLoading(true);
      };
    }, [fetchBookings])
  );

  const onRefresh = () => {
    setRefreshing(true);
    refreshProfile();
    fetchBookings(true);
  };

  // Makes API call to the same endpoint used by homepage view details:
  // GET /api/notifications/viewdetails/:cycle_id
  const handleViewDetails = async (item: BookingHistoryItem) => {
    const cycleId = item.cycle_id;
    if (!cycleId) {
      Alert.alert('Details Unavailable', 'Cycle ID is missing for this booking.');
      return;
    }

    setLoadingCycleId(item.id);
    try {
      console.log(`[BookingHistoryScreen] Calling viewdetails API for cycle: ${cycleId}`);
      const res = await apiClient.getCycleDetails(String(cycleId));
      console.log(`[BookingHistoryScreen] Received cycle viewdetails:`, res);

      const rawDetail =
        res?.cycle_details ||
        res?.cycle ||
        res?.cycle_data ||
        res?.cycles ||
        res?.data ||
        res?.details ||
        res;

      navigation.navigate('BookingDetail', {
        cycle: {
          ...item,
          ...rawDetail,
          id: cycleId,
          cycle_id: cycleId,
          brand: rawDetail?.brand || item.brand || 'Cycle',
          model: rawDetail?.model || item.model || '',
          cycle_type: rawDetail?.cycle_type || item.cycle_type || 'Cycle',
          image_url: rawDetail?.image_url || item.image_url,
          rating: rawDetail?.rating !== undefined ? rawDetail.rating : item.rating,
        } as any,
      });
    } catch (err: any) {
      console.warn('[BookingHistoryScreen] Error calling view details endpoint, falling back to cached details:', err);
      navigation.navigate('BookingDetail', {
        cycle: {
          ...item,
          id: cycleId,
          cycle_id: cycleId,
        } as any,
      });
    } finally {
      setLoadingCycleId(null);
    }
  };

  // Handles booking cancellation only for requested / slot booked / payment pending / payment failed
  const handleCancelBooking = (bookingId: string) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking request?',
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(bookingId);
            try {
              console.log(`[BookingHistoryScreen] Cancelling booking request: ${bookingId}`);
              await apiClient.cancelBooking(bookingId, user?.id);
              Alert.alert('Booking Cancelled', 'The booking request has been successfully cancelled.');
              fetchBookings(true);
            } catch (err: any) {
              console.error('[BookingHistoryScreen] Error cancelling booking:', err);
              Alert.alert('Cancellation Error', err?.message || 'Failed to cancel booking.');
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };


  const filteredBookings = bookings.filter((b) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'completed') return b.status === 'completed';
    if (activeFilter === 'requested') {
      const s = (b.status || '').toLowerCase().replace(/[\s-]+/g, '_');
      return (
        s === 'requested' ||
        s === 'payment_pending' ||
        s === 'payment_failed' ||
        s === 'active' ||
        s === 'ongoing' ||
        s === 'slot_booked' ||
        s === 'pending'
      );
    }
    if (activeFilter === 'cancelled') return b.status === 'cancelled' || b.status === 'canceled';
    return true;
  });


  const renderBookingCard = ({ item }: { item: BookingHistoryItem }) => {
    const isCompleted = item.status === 'completed';
    const isCancelled = item.status === 'cancelled' || item.status === 'canceled';
    const statusTheme = getStatusTheme(item.status);
    const resolvedImage = getCycleImageUrl(item.image_url);
    const resolvedReturnImage = getCycleImageUrl(item.return_image_url);
    const canCancel = canCancelBooking(item.status);

    const cycleTitle = [item.brand, item.model].filter(Boolean).join(' ').trim() || 'UgO Cycle';
    const ratingDisplay = item.rating !== null && item.rating !== undefined && !isNaN(Number(item.rating))
      ? Number(item.rating).toFixed(1)
      : '0';

    return (
      <View style={[styles.bookingCard, { borderLeftColor: statusTheme.border }]}>
        {/* Top Header: Booking ID & Highlighted Status */}
        <View style={styles.bookingIdRow}>
          <View style={styles.bookingIdBadge}>
            <Ionicons name="receipt-outline" size={13} color={colors.textSecondary} />
            <Text style={styles.bookingIdText} numberOfLines={1}>
              Booking #{item.id ? item.id.substring(0, 8) : 'N/A'}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusTheme.bg, borderColor: statusTheme.border }]}>
            <Ionicons name={statusTheme.icon} size={13} color={statusTheme.text} style={{ marginRight: 4 }} />
            <Text style={[styles.statusBadgeText, { color: statusTheme.text }]}>
              {statusTheme.label}
            </Text>
          </View>
        </View>

        {/* Main Cycle Info Row: Thumbnail, Title, Type, Rating */}
        <View style={styles.cardHeaderRow}>
          {resolvedImage ? (
            <Image source={{ uri: resolvedImage }} style={styles.cycleThumb} resizeMode="cover" />
          ) : (
            <View style={styles.cycleThumbPlaceholder}>
              <Ionicons name="bicycle" size={26} color={colors.primary} />
            </View>
          )}

          <View style={styles.headerInfoCol}>
            <Text style={styles.cycleTitle} numberOfLines={1}>
              {cycleTitle}
            </Text>

            <View style={styles.subMetaRow}>
              {Boolean(item.cycle_type) && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.cycle_type}</Text>
                </View>
              )}

              {/* Rating: Always show rating, if null show 0 */}
              <View style={styles.ratingBadge}>
                <Ionicons name="star" size={12} color="#F59E0B" />
                <Text style={styles.ratingText}>{ratingDisplay}</Text>
              </View>

              {Boolean(item.full_name) && (
                <View style={styles.partyBadge}>
                  <Ionicons name="person-outline" size={11} color={colors.textSecondary} />
                  <Text style={styles.partyText} numberOfLines={1}>
                    {item.full_name}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Dynamic Timestamps Section (Completed vs Cancelled vs Other) */}
        <View style={styles.timestampsCard}>
          {isCompleted ? (
            <>
              <View style={styles.timeRow}>
                <Ionicons name="play-circle-outline" size={15} color={colors.accent} />
                <Text style={styles.timeLabel}>Started:</Text>
                <Text style={styles.timeVal}>{formatDateTime(item.start_time)}</Text>
              </View>
              <View style={styles.timeRow}>
                <Ionicons name="checkmark-done-circle-outline" size={15} color="#10B981" />
                <Text style={styles.timeLabel}>Returned:</Text>
                <Text style={styles.timeVal}>{formatDateTime(item.returned_at)}</Text>
              </View>
            </>
          ) : isCancelled ? (
            <View style={styles.timeRow}>
              <Ionicons name="close-circle-outline" size={15} color="#EF4444" />
              <Text style={styles.timeLabel}>Cancelled at:</Text>
              <Text style={[styles.timeVal, { color: '#B91C1C' }]}>{formatDateTime(item.cancelled_at)}</Text>
            </View>
          ) : (
            <>
              {item.start_time ? (
                <View style={styles.timeRow}>
                  <Ionicons name="play-circle-outline" size={15} color={colors.accent} />
                  <Text style={styles.timeLabel}>Started:</Text>
                  <Text style={styles.timeVal}>{formatDateTime(item.start_time)}</Text>
                </View>
              ) : (
                <View style={styles.timeRow}>
                  <Ionicons name="information-circle-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.timeVal}>
                    {item.status === 'payment_pending'
                      ? 'Payment awaiting processing.'
                      : item.status === 'payment_failed'
                      ? 'Payment failed. Please retry or cancel.'
                      : 'Rental requested, awaiting cycle release.'}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Financials Row: Base charge, Overdue fee, Total Price */}
        <View style={styles.financialsRow}>
          <View style={styles.chargeCol}>
            <Text style={styles.chargeLabel}>Base Charge</Text>
            <Text style={styles.chargeVal}>₹{item.renter_charge}</Text>
          </View>

          {item.overdue_charge > 0 && (
            <View style={styles.chargeCol}>
              <Text style={[styles.chargeLabel, { color: colors.danger }]}>Overdue Fee</Text>
              <Text style={[styles.chargeVal, { color: colors.danger }]}>+₹{item.overdue_charge}</Text>
            </View>
          )}

          <View style={styles.chargeColTotal}>
            <Text style={styles.chargeLabelTotal}>Total Price</Text>
            <Text style={styles.chargeValTotal}>₹{item.total_amout}</Text>
          </View>
        </View>

        {/* Return Image Preview (if return photo exists) */}
        {Boolean(resolvedReturnImage) && (
          <View style={styles.returnImageCard}>
            <Image source={{ uri: resolvedReturnImage }} style={styles.returnThumb} />
            <View style={styles.returnInfoCol}>
              <Text style={styles.returnImageTitle}>Return Verification Photo</Text>
              <Text style={styles.returnImageSubtitle}>Drop-off verification proof</Text>
            </View>
            <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
          </View>
        )}

        {/* Action Buttons Row */}
        <View style={styles.actionsRow}>
          {canCancel && (
            <TouchableOpacity
              style={styles.cancelBookingBtn}
              onPress={() => handleCancelBooking(item.id)}
              disabled={cancellingId === item.id}
              activeOpacity={0.8}
            >
              {cancellingId === item.id ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
                  <Text style={styles.cancelBookingBtnText}>Cancel</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.viewDetailsBtn, canCancel && styles.viewDetailsBtnFlex]}
            onPress={() => handleViewDetails(item)}
            disabled={loadingCycleId === item.id}
            activeOpacity={0.8}
          >
            {loadingCycleId === item.id ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Ionicons name="eye-outline" size={16} color={colors.primary} />
                <Text style={styles.viewDetailsBtnText}>View Details</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="Rental & Booking History" showBack />


      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {(
          [
            { key: 'all', label: `All (${bookings.length})` },
            { key: 'requested', label: 'Requested / Active' },
            { key: 'completed', label: 'Completed' },
            { key: 'cancelled', label: 'Cancelled' },
          ] as const
        ).map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === filter.key && styles.filterTabTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Booking History List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading rental and booking history...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => String(item.id || item.cycle_id || Math.random())}
          renderItem={renderBookingCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={56} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No bookings found</Text>
              <Text style={styles.emptySubtitle}>
                Completed and past rental records will appear here.
              </Text>
            </View>
          }
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  balanceHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm,
  },
  headerBalanceLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  headerBalanceAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.accent,
    marginTop: 2,
  },
  negativeText: {
    color: colors.danger,
  },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  withdrawBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.body2.fontSize,
  },
  payDuesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  payDuesBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.body2.fontSize,
  },
  filterTabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: colors.white,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  bookingCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderLeftWidth: 5,
    ...shadows.sm,
  },
  bookingIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bookingIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  bookingIdText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cycleThumb: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
  },
  cycleThumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfoCol: {
    flex: 1,
  },
  cycleTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  typeBadge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
  },
  partyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  partyText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    maxWidth: 120,
  },
  timestampsCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    gap: 4,
    marginBottom: spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  timeVal: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  financialsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  chargeCol: {
    alignItems: 'flex-start',
  },
  chargeLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  chargeVal: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  chargeColTotal: {
    alignItems: 'flex-end',
  },
  chargeLabelTotal: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
    fontWeight: '600',
  },
  chargeValTotal: {
    fontSize: typography.body1.fontSize,
    fontWeight: '900',
    color: colors.accent,
  },
  returnImageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.xs,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  returnThumb: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.borderLight,
  },
  returnInfoCol: {
    flex: 1,
  },
  returnImageTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  returnImageSubtitle: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBookingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  cancelBookingBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.danger,
  },
  viewDetailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  viewDetailsBtnFlex: {
    flex: 1,
  },
  viewDetailsBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.primary,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    paddingTop: spacing.xxl * 2,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalBalanceHint: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
});
