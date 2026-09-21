import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Linking,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationItem } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface RenterBookingDetails {
  notificationId: string;
  bookingId?: string;
  cycleId?: string;
  cycleName?: string;
  renterId?: string;
  renterName: string;
  renterPhone: string;
  renterEmail?: string;
  rentalDuration: string;
  totalAmount?: number | string | null;
  status?: string;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    refetch,
  } = useNotifications(user?.id);

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to mark all as read');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to delete all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllNotifications();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to clear notifications');
            }
          },
        },
      ]
    );
  };

  const handleDeleteNotification = (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Are you sure you want to delete this notification?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotification(id);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete notification');
            }
          },
        },
      ]
    );
  };

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rentalDecisions, setRentalDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [rentalDetailsMap, setRentalDetailsMap] = useState<Record<string, RenterBookingDetails>>({});
  const [otpBookingMap, setOtpBookingMap] = useState<Record<string, any>>({});
  const [activeRentalCycleIds, setActiveRentalCycleIds] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [selectedRenterModal, setSelectedRenterModal] = useState<{
    details: RenterBookingDetails;
    notification: NotificationItem;
  } | null>(null);

  // Real-time ticking clock for notification countdowns
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper to safely extract parsed action_data or payload response
  const getActionData = useCallback((item: NotificationItem): any => {
    const raw =
      (item as any)?.payload_response ??
      (item as any)?.payload ??
      item?.action_data ??
      (item as any)?.data ??
      {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw || {};
  }, []);

  // Check if notification is an OTP action
  const isOtpNotification = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();
    return (
      rawAction.includes('otp') ||
      rawTitle.includes('otp') ||
      rawMsg.includes('otp') ||
      rawAction === 'pickup_otp_generated' ||
      rawAction === 'rental_otp_generated' ||
      rawAction === 'enter_rental_otp' ||
      rawAction === 'enter_return_otp' ||
      rawAction === 'return_otp_generated'
    );
  }, []);

  // Check if notification pertains to return
  const isReturnOtpAction = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();
    return (
      rawAction.includes('return') ||
      rawTitle.includes('return') ||
      rawMsg.includes('return')
    );
  }, []);

  // Determine if OTP notification is intended for the cycle OWNER (to enter OTP) vs RENTER (to view OTP)
  const isOwnerOtpNotification = useCallback(
    (item: NotificationItem): boolean => {
      if (!isOtpNotification(item)) return false;
      const actionData = getActionData(item);
      const bookingId = actionData?.booking_id || actionData?.bookingId;

      // 1. Authoritative check via booking table
      if (bookingId && otpBookingMap[bookingId] && user?.id) {
        const b = otpBookingMap[bookingId];
        if (b.owner_id === user.id) return true;
        if (b.renter_id === user.id) return false;
      }

      // 2. Explicit role in actionData
      const role = String(
        actionData.role || actionData.recipient_role || actionData.user_role || ''
      ).trim().toLowerCase();
      if (role === 'owner') return true;
      if (role === 'renter' || role === 'user') return false;

      // 3. Explicit owner_id vs current user
      if (actionData.owner_id && user?.id) {
        if (String(actionData.owner_id) === String(user.id)) return true;
      }
      if (actionData.renter_id && user?.id) {
        if (String(actionData.renter_id) === String(user.id)) return false;
      }

      // 4. Action type check
      const actionType = String(item.action_type || '').trim().toLowerCase();
      if (
        actionType === 'enter_rental_otp' ||
        actionType === 'enter_return_otp' ||
        actionType.startsWith('enter_') ||
        actionType.includes('verify')
      ) {
        return true;
      }
      if (
        actionType === 'rental_otp_generated' ||
        actionType === 'pickup_otp_generated' ||
        actionType === 'return_otp_generated'
      ) {
        return false;
      }

      // 5. Title & message keyword heuristics
      const title = String(item.title || '').toLowerCase();
      const msg = String(item.message || '').toLowerCase();
      if (
        title.includes('enter') ||
        title.includes('verify') ||
        msg.includes('enter the otp') ||
        msg.includes('verify the otp') ||
        msg.includes('enter otp')
      ) {
        return true;
      }

      // Default: if message mentions sharing code or has 6 digits, it is for renter
      if (msg.includes('your otp') || msg.includes('share') || /\b\d{6}\b/.test(msg)) {
        return false;
      }

      return false;
    },
    [isOtpNotification, getActionData, otpBookingMap, user?.id]
  );

  // Extract OTP code for the renter (never for the owner)
  const getRenterOtpCode = useCallback(
    (item: NotificationItem): string | null => {
      const actionData = getActionData(item);
      const bookingId = actionData?.booking_id || actionData?.bookingId;
      const isReturn = isReturnOtpAction(item);

      // 1. From action_data
      if (isReturn && actionData?.return_otp) return String(actionData.return_otp);
      if (actionData?.otp_code) return String(actionData.otp_code);
      if (actionData?.pickup_otp) return String(actionData.pickup_otp);
      if (actionData?.otp) return String(actionData.otp);

      // 2. From fetched booking_table
      if (bookingId && otpBookingMap[bookingId]) {
        const b = otpBookingMap[bookingId];
        if (isReturn && b.return_otp) return String(b.return_otp);
        if (b.pickup_otp) return String(b.pickup_otp);
        if (b.otp_code) return String(b.otp_code);
      }

      // 3. From message regex (6-digit pattern)
      const match = String(item.message || '').match(/\b\d{6}\b/);
      if (match) return match[0];

      return null;
    },
    [getActionData, isReturnOtpAction, otpBookingMap]
  );

  // Check if notification is a rental request (handles underscores and spaces)
  const isRentalRequestNotification = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawType = String(item.type || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();

    const normalizedAction = rawAction.replace(/_/g, ' ');
    const normalizedTitle = rawTitle.replace(/_/g, ' ');
    const normalizedType = rawType.replace(/_/g, ' ');

    return (
      rawAction === 'rental_request_received' ||
      rawAction === 'rental_request' ||
      rawTitle === 'rental_request_received' ||
      normalizedAction.includes('rental request') ||
      normalizedTitle.includes('rental request') ||
      normalizedType.includes('rental request') ||
      (rawMsg.includes('booking request') && !rawTitle.includes('payment'))
    );
  }, []);

  // Compute remaining seconds from expiry timestamp or created_at + 15m
  const getNotificationExpiry = useCallback(
    (item: NotificationItem): number | null => {
      const actionData = getActionData(item);
      const backendExpiry =
        actionData.expiry_time ||
        actionData.expiryTime ||
      actionData.otp_expires_at ||
      actionData.otp_expires_at_timestamp ||
      actionData.expires_at ||
      actionData.timestampz;

    if (backendExpiry) {
      const expiryTimestamp = new Date(backendExpiry).getTime();
      if (Number.isFinite(expiryTimestamp)) return expiryTimestamp;
    }

    const createdTimestamp = new Date(item.created_at).getTime();
    return Number.isFinite(createdTimestamp) ? createdTimestamp + 15 * 60 * 1000 : null;
  }, []);

  const getRemainingSeconds = useCallback(
    (item: NotificationItem): number | null => {
      const expiryTimestamp = getNotificationExpiry(item);
      if (!expiryTimestamp) return null;
      return Math.max(0, Math.ceil((expiryTimestamp - currentTime) / 1000));
    },
    [getNotificationExpiry, currentTime]
  );

  const formatRemainingTime = (seconds: number | null): string | null => {
    if (seconds === null) return null;
    const safeSeconds = Math.max(0, seconds);
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSecs = safeSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  // Collect active rental cycle IDs from notifications' payload to prevent double booking
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    const ids: string[] = [];
    notifications.forEach((item) => {
      const actionData = getActionData(item);
      const status = String(actionData?.status || actionData?.booking_status || '').toLowerCase();
      if (['slot_booked', 'payment_pending', 'active', 'return_pending'].includes(status)) {
        const cId = actionData?.cycle_id || actionData?.cycleId;
        if (cId) ids.push(String(cId));
      }
    });
    if (ids.length > 0) {
      setActiveRentalCycleIds(ids);
    }
  }, [notifications, getActionData]);

  // Fetch and hydrate renter profile & booking details from notification payload
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    const rentalRequests = notifications.filter(isRentalRequestNotification);
    if (rentalRequests.length === 0) return;

    const detailsMap: Record<string, RenterBookingDetails> = {};
    rentalRequests.forEach((item) => {
      const actionData = getActionData(item);
      const durationParts: string[] = [];
      const days = Number(actionData.no_of_days || actionData.days || 0);
      const hours = Number(actionData.no_of_hours || actionData.hours || 0);
      if (days > 0) durationParts.push(`${days} day${days === 1 ? '' : 's'}`);
      if (hours > 0) durationParts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
      const duration =
        durationParts.length > 0
          ? durationParts.join(' ')
          : actionData.rental_duration || actionData.duration || 'Standard Rental';

      detailsMap[item.id] = {
        notificationId: item.id,
        bookingId: actionData.booking_id || actionData.bookingId,
        cycleId: actionData.cycle_id || actionData.cycleId,
        cycleName: actionData.cycle_name || actionData.cycle_title || actionData.brand || 'Cycle',
        renterId: actionData.renter_id || actionData.renterId || actionData.user_id,
        renterName: actionData.renter_name || actionData.renterName || actionData.user_name || 'Renter',
        renterPhone: actionData.renter_phone || actionData.renterPhone || actionData.phone || 'Phone unavailable',
        renterEmail: actionData.renter_email || actionData.email,
        rentalDuration: duration,
        totalAmount: actionData.total_amount || actionData.fare || actionData.rental_price,
        status: actionData.booking_status || actionData.status,
      };
    });

    setRentalDetailsMap((prev) => ({ ...prev, ...detailsMap }));
  }, [notifications, isRentalRequestNotification, getActionData]);

  // Populate booking context for OTP notifications directly from collected payload
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    const mapUpdate: Record<string, any> = {};
    notifications.forEach((item) => {
      const actionData = getActionData(item);
      const bookingId = actionData?.booking_id || actionData?.bookingId;
      if (bookingId) {
        mapUpdate[bookingId] = {
          id: bookingId,
          renter_id: actionData?.renter_id || actionData?.renterId,
          owner_id: actionData?.owner_id || actionData?.ownerId,
          otp_code: actionData?.otp_code || actionData?.otp || actionData?.pickup_otp || actionData?.pickupOtp,
          pickup_otp: actionData?.pickup_otp || actionData?.pickupOtp || actionData?.otp_code || actionData?.otp,
          return_otp: actionData?.return_otp || actionData?.returnOtp,
          status: actionData?.status || actionData?.booking_status,
          cycles: {
            id: actionData?.cycle_id || actionData?.cycleId,
            brand: actionData?.brand || actionData?.cycle_brand || 'Cycle',
            model: actionData?.model || actionData?.cycle_model || '',
          },
          ...actionData,
        };
      }
    });

    if (Object.keys(mapUpdate).length > 0) {
      setOtpBookingMap((prev) => ({ ...prev, ...mapUpdate }));
    }
  }, [notifications, getActionData]);

  const handleRentalDecision = async (
    notification: NotificationItem,
    decision: 'accepted' | 'rejected'
  ) => {
    const actionData = getActionData(notification);
    const bookingId =
      actionData?.booking_id ||
      actionData?.bookingId ||
      rentalDetailsMap[notification.id]?.bookingId;

    if (!bookingId) {
      Alert.alert('Error', 'Missing booking identifier in notification.');
      return;
    }

    setProcessingId(notification.id);
    try {
      // 1. Call n8n booking-acceptance webhook
      const response = await fetch('https://ugonitk.app.n8n.cloud/webhook/booking-acceptance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          status: decision,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update rental status (HTTP ${response.status})`);
      }

      // 2. Mark notification as read & update local state
      await markAsRead(notification.id);
      setRentalDecisions((prev) => ({ ...prev, [notification.id]: decision }));
      refetch();

      if (selectedRenterModal?.notification.id === notification.id) {
        setSelectedRenterModal(null);
      }

      if (decision === 'accepted') {
        Alert.alert(
          'Ride Accepted! 🎉',
          'The ride is now in Ongoing Rentals. Coordinate with the renter and verify their pickup OTP when handing over the cycle.',
          [
            {
              text: 'Go to Ongoing Rentals',
              onPress: () => navigation.navigate('OngoingRentals'),
            },
            { text: 'Stay Here', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Request Declined', 'The booking request has been declined.');
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Unable to complete action.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRegenerateOtp = async (item: NotificationItem) => {
    const actionData = getActionData(item);
    const bookingId = actionData?.booking_id || actionData?.bookingId;
    if (!bookingId || processingId) return;

    const isReturn = isReturnOtpAction(item);
    const webhookUrl = isReturn
      ? 'https://ugonitk.app.n8n.cloud/webhook/regenerate-return-otp'
      : 'https://ugonitk.app.n8n.cloud/webhook/regenerate-otp';

    try {
      setProcessingId(item.id);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ booking_id: bookingId }),
      });

      if (!res.ok) {
        throw new Error(`Regeneration failed (HTTP ${res.status})`);
      }

      Alert.alert('OTP Regenerated', 'A new OTP has been sent to the renter.');
      await refetch();
    } catch (err: any) {
      Alert.alert('Regeneration Error', err.message || 'Unable to regenerate OTP.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderNotification = ({ item }: { item: NotificationItem }) => {
    const isRentalRequest = isRentalRequestNotification(item);
    const actionData = getActionData(item);
    const decision =
      rentalDecisions[item.id] ||
      actionData?.rental_decision ||
      null;
    const isProcessing = processingId === item.id;
    const isOtpAction = isOtpNotification(item);
    const isOwnerOtp = isOwnerOtpNotification(item);
    const isRenterOtp = isOtpAction && !isOwnerOtp;
    const isReturnOtp = isReturnOtpAction(item);
    const renterOtpCode = isRenterOtp ? getRenterOtpCode(item) : null;

    const details = rentalDetailsMap[item.id];
    const remainingSeconds = (isRentalRequest || isOtpAction) ? getRemainingSeconds(item) : null;
    const isExpired = remainingSeconds !== null && remainingSeconds <= 0;

    // Check if another rental for this cycle is active
    const cycleId = details?.cycleId || actionData?.cycle_id;
    const isCycleAlreadyOccupied =
      !decision &&
      !!cycleId &&
      activeRentalCycleIds.includes(String(cycleId));

    // Booking ID for action triggers
    const bookingId =
      actionData?.booking_id ||
      actionData?.bookingId ||
      details?.bookingId;

    return (
      <View style={[styles.card, !item.is_read && styles.unreadCard]}>
        {/* Header Row */}
        <TouchableOpacity
          style={styles.cardHeader}
          activeOpacity={0.8}
          onPress={() => {
            if (!item.is_read) markAsRead(item.id);
          }}
        >
          <View
            style={[
              styles.iconCircle,
              isRentalRequest && styles.rentalIconCircle,
              isRenterOtp && styles.renterIconCircle,
            ]}
          >
            <Ionicons
              name={
                isRentalRequest
                  ? 'bicycle'
                  : isOtpAction
                  ? 'key-outline'
                  : 'notifications-outline'
              }
              size={20}
              color={isRentalRequest || isRenterOtp ? colors.accent : colors.primary}
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.cardTitle}>
              {isRentalRequest
                ? 'Rental Request Received'
                : isRenterOtp
                ? isReturnOtp
                  ? 'Return OTP Code'
                  : 'Pickup OTP Code'
                : isOwnerOtp
                ? isReturnOtp
                  ? 'Verify Return OTP'
                  : 'Verify Pickup OTP'
                : item.title}
            </Text>
            <Text style={styles.timestamp}>
              {new Date(item.created_at).toLocaleDateString([], {
                hour: '2-digit',
                minute: '2-digit',
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
          {!item.is_read && <View style={styles.unreadDot} />}
        </TouchableOpacity>

        {/* Message body: For cycle owners, sanitize so NO OTP digits are exposed */}
        <Text style={styles.cardMessage}>
          {isOwnerOtp
            ? item.message
                .replace(/\b\d{6}\b/g, '••••••')
                .replace(/OTP:\s*\d+/gi, 'OTP: [provided by renter]')
            : item.message}
        </Text>

        {/* =========================================================
            RENTAL REQUEST: USER / RENTER DETAILS & ACTION BUTTONS
        ========================================================= */}
        {isRentalRequest && (
          <View style={styles.rentalRequestContainer}>
            {/* Renter Details Box in the Notification itself */}
            <View style={styles.renterDetailsBox}>
              <View style={styles.renterDetailsHeader}>
                <View style={styles.renterAvatarSmall}>
                  <Ionicons name="person" size={14} color={colors.accent} />
                </View>
                <Text style={styles.renterDetailsHeading}>Renter Details</Text>
                {details?.totalAmount ? (
                  <View style={styles.fareBadge}>
                    <Text style={styles.fareBadgeText}>₹{details.totalAmount}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.renterInfoGrid}>
                {/* Renter Name */}
                <View style={styles.renterInfoRow}>
                  <Ionicons name="person-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.renterLabel}>Name:</Text>
                  <Text style={styles.renterValue} numberOfLines={1}>
                    {details?.renterName || 'Loading...'}
                  </Text>
                </View>

                {/* Mobile / Contact protected */}
                <View style={styles.renterInfoRow}>
                  <Ionicons name="shield-checkmark-outline" size={15} color={colors.accent} />
                  <Text style={styles.renterLabel}>Mobile:</Text>
                  <Text style={[styles.renterValue, { color: colors.textSecondary }]}>
                    Protected for privacy
                  </Text>
                </View>

                {/* Rental Duration */}
                <View style={styles.renterInfoRow}>
                  <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.renterLabel}>Duration:</Text>
                  <Text style={styles.renterValue} numberOfLines={1}>
                    {details?.rentalDuration || 'Loading...'}
                  </Text>
                </View>

                {/* Cycle Name */}
                {details?.cycleName ? (
                  <View style={styles.renterInfoRow}>
                    <Ionicons name="bicycle-outline" size={15} color={colors.textSecondary} />
                    <Text style={styles.renterLabel}>Cycle:</Text>
                    <Text style={styles.renterValue} numberOfLines={1}>
                      {details.cycleName}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* View Full Profile link */}
              {details && (
                <TouchableOpacity
                  style={styles.viewFullDetailsBtn}
                  onPress={() => setSelectedRenterModal({ details, notification: item })}
                >
                  <Text style={styles.viewFullDetailsText}>View Renter Profile & Details</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.accent} />
                </TouchableOpacity>
              )}
            </View>

            {/* Countdown Timer Badge */}
            {remainingSeconds !== null && !decision && !isExpired && (
              <View
                style={[
                  styles.countdownBanner,
                  remainingSeconds <= 120 && styles.countdownBannerUrgent,
                ]}
              >
                <Ionicons
                  name={remainingSeconds <= 120 ? 'alert-circle' : 'timer-outline'}
                  size={15}
                  color={remainingSeconds <= 120 ? colors.danger : colors.accent}
                />
                <Text
                  style={[
                    styles.countdownText,
                    remainingSeconds <= 120 && styles.countdownTextUrgent,
                  ]}
                >
                  Expires in {formatRemainingTime(remainingSeconds)}
                </Text>
              </View>
            )}

            {/* Accept / Reject Decision Section */}
            <View style={styles.actionSection}>
              {decision === 'accepted' ? (
                <View style={styles.decisionResultContainer}>
                  <Badge variant="success" label="✓ Request Accepted" />
                  <TouchableOpacity
                    style={styles.ongoingShortcutBtn}
                    onPress={() => navigation.navigate('OngoingRentals')}
                  >
                    <Text style={styles.ongoingShortcutText}>Go to Ongoing Rentals</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              ) : decision === 'rejected' ? (
                <Badge variant="danger" label="✕ Request Declined" />
              ) : isExpired ? (
                <Badge variant="neutral" label="⌛ Request Expired" />
              ) : isCycleAlreadyOccupied ? (
                <View style={styles.occupiedNotice}>
                  <Ionicons name="information-circle" size={16} color={colors.warning} />
                  <Text style={styles.occupiedNoticeText}>
                    Another rental for this cycle is currently active.
                  </Text>
                </View>
              ) : isProcessing ? (
                <View style={styles.processingRow}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={styles.processingText}>Processing decision...</Text>
                </View>
              ) : (
                <View style={styles.decisionButtonsRow}>
                  {/* ACCEPT BUTTON */}
                  <TouchableOpacity
                    style={[styles.decisionBtn, styles.acceptBtn]}
                    onPress={() => handleRentalDecision(item, 'accepted')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                    <Text style={styles.acceptBtnText}>Accept</Text>
                  </TouchableOpacity>

                  {/* REJECT BUTTON */}
                  <TouchableOpacity
                    style={[styles.decisionBtn, styles.rejectBtn]}
                    onPress={() => handleRentalDecision(item, 'rejected')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close-circle" size={18} color={colors.danger} />
                    <Text style={styles.rejectBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}

        {/* USER / RENTER: ONLY SHOW OTP CODE (NO ENTER OTP BUTTON) */}
        {isRenterOtp && (
          <View style={styles.renterOtpBox}>
            <View style={styles.renterOtpHeader}>
              <Ionicons name="key" size={16} color={colors.accent} />
              <Text style={styles.renterOtpHeading}>
                {isReturnOtp ? 'Your Return OTP Code' : 'Your Pickup OTP Code'}
              </Text>
            </View>
            <Text style={styles.renterOtpInstruction}>
              {isReturnOtp
                ? 'Share this 6-digit code with the cycle owner to complete cycle return:'
                : 'Share this 6-digit code with the cycle owner when taking the cycle:'}
            </Text>
            <View style={styles.renterOtpCodeContainer}>
              <Text style={styles.renterOtpCodeText}>
                {renterOtpCode || '••••••'}
              </Text>
            </View>
          </View>
        )}

        {/* OWNER: ONLY SHOW ENTER OTP BUTTON (NO OTP SHOWN) */}
        {isOwnerOtp && bookingId && (
          <View style={styles.ownerOtpActions}>
            {isExpired ? (
              <View style={styles.otpExpiredContainer}>
                <View style={styles.otpExpiredStatus}>
                  <Ionicons name="hourglass-outline" size={16} color={colors.danger} />
                  <Text style={styles.otpExpiredStatusText}>OTP Expired</Text>
                </View>
                <TouchableOpacity
                  style={[styles.otpNavBtn, styles.regenerateOtpBtn]}
                  onPress={() => handleRegenerateOtp(item)}
                  disabled={isProcessing}
                >
                  <Ionicons name="refresh" size={16} color={colors.white} />
                  <Text style={styles.otpNavBtnText}>
                    {isProcessing ? 'Regenerating...' : 'Regenerate OTP'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                {remainingSeconds !== null && (
                  <View style={styles.otpCountdownBanner}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={remainingSeconds <= 120 ? colors.danger : colors.accent}
                    />
                    <Text
                      style={[
                        styles.otpCountdownText,
                        remainingSeconds <= 120 && styles.otpCountdownWarning,
                      ]}
                    >
                      Expires in {formatRemainingTime(remainingSeconds)}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.otpNavBtn}
                  onPress={() =>
                    navigation.navigate('OtpVerification', {
                      bookingId: bookingId,
                      actionType: isReturnOtp ? 'return_otp' : 'pickup_otp',
                    })
                  }
                  activeOpacity={0.8}
                >
                  <Ionicons name="key" size={16} color={colors.white} />
                  <Text style={styles.otpNavBtnText}>
                    {isReturnOtp ? 'Enter Return OTP' : 'Enter Pickup OTP'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Card Actions: Mark as Read & Delete */}
        <View style={styles.cardActionsBar}>
          {!item.is_read ? (
            <TouchableOpacity
              style={styles.markReadBtn}
              onPress={() => markAsRead(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark-outline" size={13} color={colors.primary} />
              <Text style={styles.markReadText}>Mark read</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.readIndicator}>
              <Ionicons name="checkmark-done" size={13} color={colors.textLight} />
              <Text style={styles.readIndicatorText}>Read</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.deleteNotifBtn}
            onPress={() => handleDeleteNotification(item.id)}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={13} color="#DC2626" />
            <Text style={styles.deleteNotifText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="Notifications" showBack />

      {/* Top Toolbar */}
      {notifications.length > 0 && (
        <View style={styles.topToolbar}>
          <Text style={styles.toolbarCount}>
            {unreadCount > 0 ? `${unreadCount} unread` : `${notifications.length} notifications`}
          </Text>
          <View style={styles.toolbarButtons}>
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.toolbarBtn}
                onPress={handleMarkAllRead}
              >
                <Ionicons name="checkmark-done" size={14} color={colors.primary} />
                <Text style={styles.toolbarBtnText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.toolbarClearBtn}
              onPress={handleClearAll}
            >
              <Ionicons name="trash-outline" size={13} color="#DC2626" />
              <Text style={styles.toolbarClearText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading && notifications.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Fetching notifications...</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              colors={[colors.accent]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="notifications-off-outline" size={60} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySubtitle}>You are all caught up!</Text>
            </View>
          }
        />
      )}

      {/* =========================================================
          FULL RENTER DETAILS MODAL
      ========================================================= */}
      <Modal
        visible={!!selectedRenterModal}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedRenterModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Ionicons name="person-circle" size={24} color={colors.accent} />
                <Text style={styles.modalTitle}>Renter Profile</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedRenterModal(null)}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {selectedRenterModal && (
              <ScrollView contentContainerStyle={styles.modalContent}>
                {/* Avatar Banner */}
                <View style={styles.modalAvatarContainer}>
                  <View style={styles.modalAvatarLarge}>
                    <Text style={styles.modalAvatarText}>
                      {(selectedRenterModal.details.renterName || 'R')[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.modalRenterName}>
                    {selectedRenterModal.details.renterName}
                  </Text>
                  {selectedRenterModal.details.renterEmail && (
                    <Text style={styles.modalRenterEmail}>
                      {selectedRenterModal.details.renterEmail}
                    </Text>
                  )}
                </View>

                {/* Mobile Privacy Protection Banner */}
                <View style={styles.renterPrivacyBanner}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
                  <Text style={styles.renterPrivacyBannerText}>
                    Mobile number is hidden to protect student privacy. Coordinate via in-app call or chat.
                  </Text>
                </View>

                {/* Key Details Table */}
                <View style={styles.modalDetailsTable}>
                  <View style={styles.modalTableRow}>
                    <Text style={styles.modalTableLabel}>Cycle Requested</Text>
                    <Text style={styles.modalTableValue}>
                      {selectedRenterModal.details.cycleName || 'Campus Cycle'}
                    </Text>
                  </View>

                  <View style={styles.modalTableRow}>
                    <Text style={styles.modalTableLabel}>Duration</Text>
                    <Text style={styles.modalTableValue}>
                      {selectedRenterModal.details.rentalDuration}
                    </Text>
                  </View>

                  {selectedRenterModal.details.totalAmount ? (
                    <View style={[styles.modalTableRow, { borderBottomWidth: 0 }]}>
                      <Text style={styles.modalTableLabel}>Total Fare</Text>
                      <Text style={[styles.modalTableValue, styles.modalTableFare]}>
                        ₹{selectedRenterModal.details.totalAmount}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Modal Accept/Reject Buttons if still pending */}
                {!rentalDecisions[selectedRenterModal.notification.id] &&
                  !selectedRenterModal.notification.action_data?.rental_decision && (
                    <View style={styles.modalActionsRow}>
                      <TouchableOpacity
                        style={[styles.decisionBtn, styles.acceptBtn]}
                        onPress={() =>
                          handleRentalDecision(selectedRenterModal.notification, 'accepted')
                        }
                      >
                        <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                        <Text style={styles.acceptBtnText}>Accept Request</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.decisionBtn, styles.rejectBtn]}
                        onPress={() =>
                          handleRentalDecision(selectedRenterModal.notification, 'rejected')
                        }
                      >
                        <Ionicons name="close-circle" size={18} color={colors.danger} />
                        <Text style={styles.rejectBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  unreadCard: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  rentalIconCircle: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  titleCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: typography.caption.fontSize,
    color: colors.textLight,
    marginTop: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  cardMessage: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    lineHeight: 20,
    marginTop: 4,
  },

  /* Rental Request Container */
  rentalRequestContainer: {
    marginTop: spacing.sm,
  },

  /* Renter Details Card */
  renterDetailsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.sm + 2,
    marginTop: spacing.sm,
  },
  renterDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  renterAvatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  renterDetailsHeading: {
    fontSize: typography.caption.fontSize + 1,
    fontWeight: '700',
    color: colors.primary,
    flex: 1,
  },
  fareBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  fareBadgeText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  renterInfoGrid: {
    gap: 4,
  },
  renterInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  renterLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.textSecondary,
    width: 65,
    marginLeft: 6,
  },
  renterValue: {
    fontSize: typography.caption.fontSize + 1,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  phoneLinkText: {
    color: colors.accent,
    textDecorationLine: 'underline',
  },
  viewFullDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  viewFullDetailsText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.accent,
    marginRight: 2,
  },

  /* Countdown Banner */
  countdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    gap: 6,
  },
  countdownBannerUrgent: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  countdownText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  countdownTextUrgent: {
    color: colors.danger,
  },
  countdownTextExpired: {
    color: colors.textLight,
  },

  /* Actions & Decision Buttons */
  actionSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  decisionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  decisionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  acceptBtn: {
    backgroundColor: colors.accent,
  },
  acceptBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body2.fontSize,
  },
  rejectBtn: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  rejectBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: typography.body2.fontSize,
  },
  decisionResultContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  ongoingShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  ongoingShortcutText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  occupiedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  occupiedNoticeText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.warning,
    flex: 1,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  processingText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
  },

  renterIconCircle: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },

  /* Renter OTP Box */
  renterOtpBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  renterOtpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  renterOtpHeading: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: '#166534',
  },
  renterOtpInstruction: {
    fontSize: typography.caption.fontSize,
    color: '#15803D',
    marginBottom: spacing.sm,
  },
  renterOtpCodeContainer: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  renterOtpCodeText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  /* Owner OTP Actions */
  ownerOtpActions: {
    marginTop: spacing.xs,
  },
  otpExpiredContainer: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  otpExpiredStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  otpExpiredStatusText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.danger,
  },
  regenerateOtpBtn: {
    backgroundColor: '#D97706',
  },
  otpCountdownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
    marginBottom: 2,
  },
  otpCountdownText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.accent,
  },
  otpCountdownWarning: {
    color: colors.danger,
  },

  /* OTP shortcut */
  otpNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
    gap: 6,
  },
  otpNavBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body2.fontSize,
  },

  /* Center / Empty states */
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
    fontSize: typography.h2.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  emptySubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 4,
  },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    overflow: 'hidden',
    ...shadows.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.primary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalContent: {
    padding: spacing.md,
  },
  modalAvatarContainer: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  modalAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accent,
  },
  modalRenterName: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalRenterEmail: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  renterPrivacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    gap: 8,
  },
  renterPrivacyBannerText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 12,
    flex: 1,
    textAlign: 'center',
  },
  modalDetailsTable: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  modalTableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTableLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalTableValue: {
    fontSize: typography.caption.fontSize + 1,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalTableFare: {
    color: colors.accent,
    fontSize: typography.body2.fontSize,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  topToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  toolbarCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  toolbarButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  toolbarBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  toolbarClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  toolbarClearText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cardActionsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
    marginTop: 8,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  markReadText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  readIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  readIndicatorText: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: '500',
  },
  deleteNotifBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#FEE2E2',
  },
  deleteNotifText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
});
