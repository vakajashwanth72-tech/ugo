import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { apiClient } from '../../lib/apiClient';
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

interface NotificationSection {
  title: string;
  data: NotificationItem[];
}

const extractValidOtp = (val: any): string | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s.includes('$')) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4 && digits.length <= 6) return digits;
  return null;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    markMultipleAsRead,
    deleteNotification,
    clearAllNotifications,
    clearMultipleNotifications,
    refetch,
  } = useNotifications();

  const [showMenuModal, setShowMenuModal] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rentalDecisions, setRentalDecisions] = useState<Record<string, 'accepted' | 'rejected'>>({});
  const [returnDecisions, setReturnDecisions] = useState<Record<string, 'accepted'>>({});
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

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const handleManualRefresh = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await refetch();
    } catch (err: any) {
      console.warn('[NotificationsScreen] Manual refresh error:', err);
    } finally {
      setIsManualRefreshing(false);
    }
  };

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

  const enterSelectionMode = useCallback((initialId?: string) => {
    setIsSelectionMode(true);
    if (initialId) {
      setSelectedIds(new Set([initialId]));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === notifications.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notifications.map((n) => n.id)));
    }
  }, [selectedIds.size, notifications]);

  const handleDeleteNotification = (id: string) => {
    Alert.alert(
      'Delete Notification',
      'Choose an option:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Select Multiple',
          onPress: () => enterSelectionMode(id),
        },
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

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      'Delete Notifications',
      `Are you sure you want to delete ${count} selected notification${count === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const idsArray = Array.from(selectedIds);
              await clearMultipleNotifications(idsArray);
              exitSelectionMode();
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to delete selected notifications');
            }
          },
        },
      ]
    );
  };

  const handleMarkSelectedAsRead = async () => {
    if (selectedIds.size === 0) return;
    try {
      const idsArray = Array.from(selectedIds);
      await markMultipleAsRead(idsArray);
      exitSelectionMode();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to mark notifications as read');
    }
  };

  // Helper to safely extract parsed action_data or payload response
  const getActionData = useCallback((item: NotificationItem): any => {
    const candidates = [
      item?.action_data,
      (item as any)?.payload_response,
      (item as any)?.payload,
      (item as any)?.data,
      (item as any)?.metadata,
    ];

    for (const cand of candidates) {
      if (!cand) continue;
      let parsed = cand;
      if (typeof cand === 'string') {
        try {
          parsed = JSON.parse(cand);
        } catch {
          continue;
        }
      }
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
        return parsed;
      }
    }

    return (
      item?.action_data ||
      (item as any)?.payload_response ||
      (item as any)?.payload ||
      {}
    );
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
      rawAction.includes('regenerate') ||
      rawTitle.includes('regenerate') ||
      rawMsg.includes('regenerate') ||
      rawAction === 'pickup_otp_generated' ||
      rawAction === 'rental_otp_generated' ||
      rawAction === 'enter_rental_otp' ||
      rawAction === 'enter_return_otp' ||
      rawAction === 'return_otp_generated' ||
      rawAction === 'regenerate_otp' ||
      rawAction === 'regenerate_rental_otp' ||
      rawAction === 'regenerate_return_otp' ||
      rawAction === 'regenerate-otp'
    );
  }, []);

  // Check if notification is specifically an OTP regeneration action / expired OTP notification
  const isRegenerateOtpAction = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();
    return (
      rawAction.includes('regenerate') ||
      rawAction.includes('resend') ||
      rawTitle.includes('regenerate') ||
      rawTitle.includes('expired') ||
      rawMsg.includes('regenerate') ||
      rawMsg.includes('otp has expired') ||
      rawMsg.includes('otp expired')
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

  // Determine if OTP notification is intended for the cycle OWNER (to enter or regenerate OTP) vs RENTER (to view OTP)
  const isOwnerOtpNotification = useCallback(
    (item: NotificationItem): boolean => {
      if (!isOtpNotification(item)) return false;
      const actionData = getActionData(item);
      const actionType = String(item.action_type || '').trim().toLowerCase();
      const title = String(item.title || '').toLowerCase();
      const msg = String(item.message || '').toLowerCase();

      // 1. Explicit role in actionData
      const role = String(
        actionData.role || actionData.recipient_role || actionData.user_role || ''
      ).trim().toLowerCase();
      if (role === 'owner') return true;
      if (role === 'renter' || role === 'user') return false;

      // 2. Action type check
      if (
        actionType === 'enter_rental_otp' ||
        actionType === 'enter_pickup_otp' ||
        actionType === 'enter_return_otp' ||
        actionType === 'pickup_otp' ||
        actionType === 'rental_otp' ||
        actionType === 'regenerate_otp' ||
        actionType === 'regenerate_rental_otp' ||
        actionType === 'regenerate_return_otp' ||
        actionType === 'regenerate-otp' ||
        actionType.startsWith('enter_') ||
        actionType.includes('verify') ||
        actionType.includes('regenerate') ||
        actionType.includes('resend') ||
        actionType.includes('expired')
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

      // 3. Title & message keyword heuristics
      if (
        title.includes('enter') ||
        title.includes('verify') ||
        title.includes('regenerate') ||
        title.includes('expired') ||
        title.includes('arrived') ||
        msg.includes('enter the otp') ||
        msg.includes('verify the otp') ||
        msg.includes('enter otp') ||
        msg.includes('enter pickup otp') ||
        msg.includes('enter return otp') ||
        msg.includes('renter has arrived') ||
        msg.includes('renter arrived') ||
        msg.includes('arrived') ||
        msg.includes('regenerate') ||
        msg.includes('otp expired') ||
        msg.includes('otp has expired')
      ) {
        return true;
      }

      // Default: if message mentions sharing code or has 6 digits, it is for renter
      if (
        (msg.includes('your otp') || msg.includes('share') || /\b\d{6}\b/.test(msg)) &&
        !actionType.includes('regenerate') &&
        !title.includes('regenerate')
      ) {
        return false;
      }

      return false;
    },
    [isOtpNotification, getActionData]
  );

  // Extract OTP code for the renter (never for the owner)
  const getRenterOtpCode = useCallback(
    (item: NotificationItem): string | null => {
      const actionData = getActionData(item);
      const bookingId = actionData?.booking_id || actionData?.bookingId;
      const isReturn = isReturnOtpAction(item);

      // Check message for explicitly mentioned OTP
      const msg = String(item.message || '');
      const returnMatch = msg.match(/(?:return\s+otp(?:\s+code)?\s+is\s+|otp\s+is\s+|return\s+otp:\s*)(\d{4,6})/i);
      const generalOtpMatch = msg.match(/(?:pickup\s+otp(?:\s+code)?\s+is\s+|your\s+otp\s+is\s+|otp\s+is\s+|otp:\s*)(\d{4,6})/i);
      const sixDigitMatch = msg.match(/\b\d{6}\b/);

      // 1. From action_data
      if (isReturn && actionData?.return_otp) {
        const valid = extractValidOtp(actionData.return_otp);
        if (valid) return valid;
      }
      if (actionData?.otp_code) {
        const valid = extractValidOtp(actionData.otp_code);
        if (valid) return valid;
      }
      if (actionData?.pickup_otp) {
        const valid = extractValidOtp(actionData.pickup_otp);
        if (valid) return valid;
      }
      if (actionData?.otp) {
        const valid = extractValidOtp(actionData.otp);
        if (valid) return valid;
      }

      // 2. From message regex
      if (isReturn && returnMatch && returnMatch[1]) return returnMatch[1];
      if (generalOtpMatch && generalOtpMatch[1]) return generalOtpMatch[1];
      if (sixDigitMatch) return sixDigitMatch[0];

      // 3. From fetched booking_table
      if (bookingId && otpBookingMap[bookingId]) {
        const b = otpBookingMap[bookingId];
        if (isReturn && b.return_otp) {
          const valid = extractValidOtp(b.return_otp);
          if (valid) return valid;
        }
        if (b.pickup_otp) {
          const valid = extractValidOtp(b.pickup_otp);
          if (valid) return valid;
        }
        if (b.otp_code) {
          const valid = extractValidOtp(b.otp_code);
          if (valid) return valid;
        }
      }

      return null;
    },
    [getActionData, isReturnOtpAction, otpBookingMap]
  );

  // Check if notification is a renter-side submission confirmation
  const isRenterReturnNotification = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();
    const rawType = String(item.type || '').toLowerCase().trim();
    const actionData = getActionData(item);
    const role = String(
      actionData?.role || actionData?.user_role || actionData?.recipient_role || ''
    ).toLowerCase();

    if (role === 'renter' || role === 'user') return true;

    if (
      rawTitle.includes('submitted') ||
      rawAction.includes('submitted') ||
      rawType.includes('submitted') ||
      rawMsg.includes('submitted') ||
      rawMsg.includes('your return request') ||
      rawMsg.includes('please wait for the owner') ||
      (rawAction === 'none' && (rawTitle.includes('return') || rawMsg.includes('return')))
    ) {
      return true;
    }

    return false;
  }, [getActionData]);

  // Check if notification is specifically an owner return request decision
  const isReturnRequestDecisionNotification = useCallback(
    (item: NotificationItem): boolean => {
      if (isRenterReturnNotification(item)) {
        return false;
      }

      const rawAction = String(item.action_type || '').toLowerCase().trim();
      const rawTitle = String(item.title || '').toLowerCase().trim();
      const rawMsg = String(item.message || '').toLowerCase().trim();
      const rawType = String(item.type || '').toLowerCase().trim();
      const actionData = getActionData(item);
      const availableActions =
        actionData?.available_actions ||
        (item as any)?.available_actions ||
        (item as any)?.action_data?.available_actions ||
        [];

      if (rawAction === 'none' || rawAction === 'null') {
        return false;
      }

      const hasAccept =
        (Array.isArray(availableActions) && availableActions.includes('accept')) ||
        availableActions === 'accept';

      const isOwnerAction =
        rawAction === 'return_request_decision' ||
        rawAction === 'return_decision' ||
        rawType === 'return_request_decision' ||
        rawType === 'return_decision';

      const isReceivedTitle =
        rawTitle === 'return_request_received' ||
        rawTitle === 'return request received' ||
        (rawTitle.includes('return') && rawTitle.includes('received'));

      const isOwnerMsg =
        rawMsg.includes('return request has been received') ||
        rawMsg.includes('accept or reject the request');

      return hasAccept || isOwnerAction || isReceivedTitle || isOwnerMsg;
    },
    [getActionData, isRenterReturnNotification]
  );

  // Check if notification is a rental request
  const isRentalRequestNotification = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawType = String(item.type || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();

    if (
      rawAction.includes('return') ||
      rawTitle.includes('return') ||
      rawAction === 'return_request_decision' ||
      rawMsg.includes('return request')
    ) {
      return false;
    }

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

  // Check if notification is a view cycle / cycle verification action
  const isViewCycleNotification = useCallback((item: NotificationItem): boolean => {
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const rawTitle = String(item.title || '').toLowerCase().trim();
    const rawMsg = String(item.message || '').toLowerCase().trim();
    const actionData = getActionData(item);
    const hasCycleId = !!(
      actionData?.cycle_id ||
      actionData?.cycleId ||
      actionData?.id ||
      item.action_data?.cycle_id
    );

    if (
      rawAction === 'view_cycle' ||
      rawAction === 'view-cycle' ||
      rawAction === 'verify_cycle' ||
      rawAction === 'cycle_verification'
    ) {
      return true;
    }

    if (
      (rawTitle.includes('cycle_verification') ||
        rawTitle.includes('cycle verification') ||
        rawTitle.includes('verification_assigned') ||
        rawTitle.includes('cycle_assigned') ||
        rawMsg.includes('submitted for verification')) &&
      hasCycleId
    ) {
      return true;
    }

    return false;
  }, [getActionData]);

  // Navigate to cycle details / verification
  const handleViewCycle = useCallback(
    (item: NotificationItem) => {
      const actionData = getActionData(item);
      const cycleId =
        actionData?.cycle_id ||
        actionData?.cycleId ||
        actionData?.id ||
        item.action_data?.cycle_id;

      if (!cycleId) {
        Alert.alert('Notice', 'No cycle identifier was found in this notification.');
        return;
      }

      if (!item.is_read) {
        markAsRead(item.id);
      }

      const rawAction = String(item.action_type || '').toLowerCase().trim();
      const rawTitle = String(item.title || '').toLowerCase().trim();
      const rawMsg = String(item.message || '').toLowerCase().trim();

      const isVerification =
        rawAction === 'view_cycle' ||
        rawAction === 'view-cycle' ||
        rawAction === 'verify_cycle' ||
        rawAction === 'cycle_verification' ||
        rawTitle.includes('cycle_verification') ||
        rawTitle.includes('verification') ||
        rawMsg.includes('verification');

      if (isVerification) {
        navigation.navigate('CycleVerification', {
          cycleId: String(cycleId),
        });
        return;
      }

      navigation.navigate('BookingDetail', {
        cycle: { id: String(cycleId), cycle_id: String(cycleId) } as any,
        cycleId: String(cycleId),
      });
    },
    [getActionData, markAsRead, navigation]
  );

  // Compute remaining seconds from expiry timestamp or created_at + 15m
  const getNotificationExpiry = useCallback(
    (item: NotificationItem): number | null => {
      const actionData = getActionData(item);
      const rawExpiry =
        item.expiry_time ||
        (item as any)?.expiryTime ||
        (item as any)?.expires_at ||
        actionData?.expiry_time ||
        actionData?.expiryTime ||
        actionData?.return_otp_expires_at ||
        actionData?.returnOtpExpiresAt ||
        actionData?.return_accept_deadline ||
        actionData?.returnAcceptDeadline ||
        actionData?.return_request_deadline ||
        actionData?.returnRequestDeadline ||
        actionData?.otp_expires_at ||
        actionData?.otp_expires_at_timestamp ||
        actionData?.expires_at ||
        actionData?.timestampz;

      if (rawExpiry !== undefined && rawExpiry !== null && rawExpiry !== '') {
        // If numeric epoch in seconds (e.g. 10 digits < 1e11) or ms (>= 1e11)
        if (typeof rawExpiry === 'number') {
          if (rawExpiry > 0 && rawExpiry < 1e11) {
            return rawExpiry * 1000;
          }
          if (rawExpiry >= 1e11) {
            return rawExpiry;
          }
        }
        // If string representation
        if (typeof rawExpiry === 'string') {
          const trimmed = rawExpiry.trim();
          if (/^\d{10}$/.test(trimmed)) {
            return Number(trimmed) * 1000;
          }
          if (/^\d{13}$/.test(trimmed)) {
            return Number(trimmed);
          }
          let parsed = new Date(trimmed).getTime();
          if (Number.isFinite(parsed) && !isNaN(parsed)) {
            return parsed;
          }
          if (trimmed.includes(' ')) {
            parsed = new Date(trimmed.replace(' ', 'T')).getTime();
            if (Number.isFinite(parsed) && !isNaN(parsed)) {
              return parsed;
            }
          }
        }
      }

      const createdTimestamp = new Date(item.created_at).getTime();
      return Number.isFinite(createdTimestamp) ? createdTimestamp + 15 * 60 * 1000 : null;
    },
    [getActionData]
  );

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

  // Relative timestamp formatter matching the mockup
  const formatNotificationTime = (dateStr: string): string => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      if (diffDays === 1 || (diffHours < 48 && d.getDate() === now.getDate() - 1)) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      }
      if (diffDays < 7) {
        return `${d.toLocaleDateString([], { weekday: 'short' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
      }
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
    } catch {
      return '';
    }
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
      notification.booking_id ||
      (notification as any)?.bookingId ||
      rentalDetailsMap[notification.id]?.bookingId;

    if (!bookingId) {
      Alert.alert('Error', 'Missing booking identifier in notification.');
      return;
    }

    setProcessingId(notification.id);
    try {
      const status: 'accepted' | 'rejected' =
        decision === 'accepted' || (decision as string) === 'accept' ? 'accepted' : 'rejected';

      await apiClient.respondBookingAcceptance(String(bookingId), status);
      await markAsRead(notification.id);
      setRentalDecisions((prev) => ({ ...prev, [notification.id]: decision }));
      refetch();

      if (selectedRenterModal?.notification.id === notification.id) {
        setSelectedRenterModal(null);
      }

      if (decision === 'accepted') {
        Alert.alert(
          'Ride Accepted! 🎉',
          'The booking has been accepted! You can enter and verify the renter\'s pickup OTP now or in Ongoing Rentals.',
          [
            {
              text: 'Enter Pickup OTP',
              onPress: () =>
                navigation.navigate('OtpVerification', {
                  bookingId: String(bookingId),
                  actionType: 'pickup_otp',
                }),
            },
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

  const handleAcceptReturn = async (notification: NotificationItem) => {
    if (isRenterReturnNotification(notification)) {
      Alert.alert('Notice', 'Only the cycle owner can accept a return request.');
      return;
    }

    const actionData = getActionData(notification);
    const rawBookingId =
      actionData?.booking_id ||
      actionData?.bookingId ||
      notification.booking_id ||
      (notification as any)?.bookingId;

    let bookingId = rawBookingId
      ? String(rawBookingId).replace(/^Bearer\s+/i, '').trim()
      : null;

    if (!bookingId) {
      const combined = `${notification.title || ''} ${notification.message || ''}`;
      const uuidMatch = combined.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
      if (uuidMatch) {
        bookingId = uuidMatch[1];
      }
    }

    if (!bookingId) {
      Alert.alert('Error', 'Missing booking identifier in notification.');
      return;
    }

    setProcessingId(notification.id);
    try {
      await apiClient.acceptReturn(bookingId);
      await markAsRead(notification.id);
      setReturnDecisions((prev) => ({ ...prev, [notification.id]: 'accepted' }));
      refetch();

      Alert.alert(
        'Return Accepted! 🎉',
        'You have successfully accepted the cycle return request.',
        [
          {
            text: 'Go to Ongoing Rentals',
            onPress: () => navigation.navigate('OngoingRentals'),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch (err: any) {
      Alert.alert(
        'Action Failed',
        err?.data?.message || err?.message || 'Unable to accept return request. Please try again.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const handleRegenerateOtp = async (item: NotificationItem) => {
    const actionData = getActionData(item);
    const rawBookingId =
      actionData?.booking_id ||
      actionData?.bookingId ||
      actionData?.booking?.id ||
      item.booking_id ||
      (item as any)?.bookingId;

    let bookingId = rawBookingId
      ? String(rawBookingId).replace(/^Bearer\s+/i, '').trim()
      : null;

    if (!bookingId) {
      const combined = `${item.title || ''} ${item.message || ''}`;
      const uuidMatch = combined.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
      if (uuidMatch) {
        bookingId = uuidMatch[1];
      }
    }

    if (!bookingId) {
      Alert.alert('Notice', 'Missing booking identifier for OTP regeneration.');
      return;
    }
    if (processingId) return;

    const isReturn = isReturnOtpAction(item);

    try {
      setProcessingId(item.id);
      let result: any;
      if (isReturn) {
        result = await apiClient.regenerateReturnOtp(String(bookingId));
      } else {
        result = await apiClient.regenerateOtp(String(bookingId), false);
      }

      Alert.alert(
        'OTP Regenerated! 🎉',
        isReturn
          ? 'A fresh Return OTP has been generated and sent to the renter. You can enter the new Return OTP as soon as the renter provides it.'
          : 'A fresh OTP has been generated and sent to the renter. You can enter the new OTP as soon as the renter provides it.',
        [{ text: 'OK' }]
      );
      await refetch();
    } catch (err: any) {
      Alert.alert(
        'Regeneration Error',
        err?.data?.message || err?.message || 'Unable to regenerate OTP at this time. Please try again.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const resolveRenterDetails = useCallback(
    (item: NotificationItem): RenterBookingDetails => {
      const existing = rentalDetailsMap[item.id];
      if (existing && existing.renterName && existing.renterName !== 'Loading...') {
        return existing;
      }
      const actionData = getActionData(item);
      const durationParts: string[] = [];
      const days = Number(actionData?.no_of_days || actionData?.days || 0);
      const hours = Number(actionData?.no_of_hours || actionData?.hours || 0);
      if (days > 0) durationParts.push(`${days} day${days === 1 ? '' : 's'}`);
      if (hours > 0) durationParts.push(`${hours} hr${hours === 1 ? '' : 's'}`);
      const duration =
        durationParts.length > 0
          ? durationParts.join(' ')
          : actionData?.rental_duration || actionData?.duration || 'Standard Rental';

      return {
        notificationId: item.id,
        bookingId: actionData?.booking_id || actionData?.bookingId,
        cycleId: actionData?.cycle_id || actionData?.cycleId,
        cycleName: actionData?.cycle_name || actionData?.cycle_title || actionData?.brand || 'Campus Cycle',
        renterId: actionData?.renter_id || actionData?.renterId || actionData?.user_id,
        renterName: actionData?.renter_name || actionData?.renterName || actionData?.user_name || 'Renter',
        renterPhone: actionData?.renter_phone || actionData?.renterPhone || actionData?.phone || 'Protected for privacy',
        renterEmail: actionData?.renter_email || actionData?.email,
        rentalDuration: duration,
        totalAmount: actionData?.total_amount || actionData?.fare || actionData?.rental_price,
        status: actionData?.booking_status || actionData?.status || 'pending',
      };
    },
    [rentalDetailsMap, getActionData]
  );

  const handlePersonLogoPress = useCallback(
    (item: NotificationItem) => {
      const details = resolveRenterDetails(item);
      setSelectedRenterModal({ details, notification: item });
    },
    [resolveRenterDetails]
  );

  // Group notifications into sections ("Today", "Yesterday", "This Weekend", "Earlier")
  const sections = useMemo((): NotificationSection[] => {
    if (!notifications || notifications.length === 0) return [];

    const today: NotificationItem[] = [];
    const yesterday: NotificationItem[] = [];
    const thisWeekend: NotificationItem[] = [];
    const earlier: NotificationItem[] = [];

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;

    notifications.forEach((item) => {
      const itemDate = new Date(item.created_at).getTime();
      if (isNaN(itemDate)) {
        earlier.push(item);
      } else if (itemDate >= startOfToday) {
        today.push(item);
      } else if (itemDate >= startOfYesterday) {
        yesterday.push(item);
      } else if (itemDate >= startOfWeek) {
        thisWeekend.push(item);
      } else {
        earlier.push(item);
      }
    });

    const result: NotificationSection[] = [];
    if (today.length > 0) result.push({ title: 'Today', data: today });
    if (yesterday.length > 0) result.push({ title: 'Yesterday', data: yesterday });
    if (thisWeekend.length > 0) result.push({ title: 'This Weekend', data: thisWeekend });
    if (earlier.length > 0) result.push({ title: 'Earlier', data: earlier });

    return result;
  }, [notifications]);

  // Determine avatar icon and color palette matching the modern mockup
  const getAvatarConfig = useCallback(
    (item: NotificationItem) => {
      const rawAction = String(item.action_type || '').toLowerCase().trim();
      const rawTitle = String(item.title || '').toLowerCase().trim();
      const isRental = isRentalRequestNotification(item);
      const isReturnDecision = isReturnRequestDecisionNotification(item);
      const isOtp = isOtpNotification(item);
      const isOwner = isOwnerOtpNotification(item);
      const isRegen = isRegenerateOtpAction(item);
      const isViewCycle = isViewCycleNotification(item);

      if (isRental || isReturnDecision) {
        return {
          icon: isReturnDecision ? ('return-down-back' as const) : ('bicycle' as const),
          color: '#059669',
          bgColor: '#ECFDF5',
        };
      }

      if (isOtp) {
        if (isRegen || (isOwner && rawAction.includes('regenerate'))) {
          return {
            icon: 'refresh' as const,
            color: '#D97706',
            bgColor: '#FEF3C7',
          };
        }
        if (isOwner) {
          return {
            icon: 'key' as const,
            color: '#4F46E5',
            bgColor: '#EEF2FF',
          };
        }
        return {
          icon: 'key' as const,
          color: '#059669',
          bgColor: '#ECFDF5',
        };
      }

      if (isViewCycle) {
        return {
          icon: 'shield-checkmark' as const,
          color: '#7C3AED',
          bgColor: '#F5F3FF',
        };
      }

      if (rawAction === 'ongoing_rentals' || rawAction === 'view_booking') {
        return {
          icon: 'navigate' as const,
          color: '#2563EB',
          bgColor: '#EFF6FF',
        };
      }

      if (rawAction === 'return_cycle') {
        return {
          icon: 'return-up-back' as const,
          color: '#D97706',
          bgColor: '#FEF3C7',
        };
      }

      if (rawTitle.includes('payment') || rawTitle.includes('wallet')) {
        return {
          icon: 'wallet' as const,
          color: '#2563EB',
          bgColor: '#EFF6FF',
        };
      }

      return {
        icon: 'notifications' as const,
        color: '#4F46E5',
        bgColor: '#EEF2FF',
      };
    },
    [
      isRentalRequestNotification,
      isReturnRequestDecisionNotification,
      isOtpNotification,
      isOwnerOtpNotification,
      isRegenerateOtpAction,
      isViewCycleNotification,
    ]
  );

  // Highlighting amounts (₹500, $50.00) in bold blue matching the mockup
  const renderFormattedMessage = (msg: string) => {
    if (!msg) return null;
    const regex = /((?:₹|\$)\s*[\d,]+(?:\.\d+)?)/g;
    const parts = msg.split(regex);
    return parts.map((part, index) => {
      if (regex.test(part)) {
        return (
          <Text key={index} style={styles.highlightedAmount}>
            {part}
          </Text>
        );
      }
      return <Text key={index}>{part}</Text>;
    });
  };

  const renderNotification = ({ item }: { item: NotificationItem }) => {
    const actionData = getActionData(item);
    const rawAction = String(item.action_type || '').toLowerCase().trim();
    const isRentalRequest = isRentalRequestNotification(item);
    const isReturnDecision = isReturnRequestDecisionNotification(item);
    const decision =
      rentalDecisions[item.id] ||
      actionData?.rental_decision ||
      null;
    const returnDecision =
      returnDecisions[item.id] ||
      actionData?.return_decision ||
      (actionData?.status === 'return_accepted' ? 'accepted' : null);
    const isProcessing = processingId === item.id;
    const isOtpAction = isOtpNotification(item);
    const isRegenerateAction = isRegenerateOtpAction(item);
    const isOwnerOtp = isOwnerOtpNotification(item);
    const isRenterOtp = isOtpAction && !isOwnerOtp;
    const isReturnOtp = isReturnOtpAction(item);
    const renterOtpCode = isRenterOtp ? getRenterOtpCode(item) : null;
    const isViewCycle = isViewCycleNotification(item);

    const details = rentalDetailsMap[item.id];
    const remainingSeconds = (isRentalRequest || isOtpAction || isReturnDecision) ? getRemainingSeconds(item) : null;
    const isExpired = remainingSeconds !== null && remainingSeconds <= 0;

    const cycleId = details?.cycleId || actionData?.cycle_id || actionData?.cycleId;
    const isCycleAlreadyOccupied =
      !decision &&
      !!cycleId &&
      activeRentalCycleIds.includes(String(cycleId));

    const bookingId =
      actionData?.booking_id ||
      actionData?.bookingId ||
      details?.bookingId ||
      item.booking_id ||
      (item as any)?.bookingId;

    const avatar = getAvatarConfig(item);

    const rawMsg = String(item.message || '');
    const displayMessage = isOwnerOtp
      ? rawMsg.replace(/\b\d{6}\b/g, '••••••').replace(/OTP:\s*\d+/gi, 'OTP: [provided by renter]')
      : rawMsg;

    const isSelected = selectedIds.has(item.id);

    return (
      <View style={[styles.card, !item.is_read && styles.unreadCard, isSelected && styles.selectedCard]}>
        <View style={styles.cardMainRow}>
          {/* Multi-select checkbox when in selection mode */}
          {isSelectionMode ? (
            <TouchableOpacity
              style={styles.checkboxWrapper}
              onPress={() => toggleSelect(item.id)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={23}
                color={isSelected ? '#4F46E5' : '#D1D5DB'}
              />
            </TouchableOpacity>
          ) : null}

          {/* Circular pastel avatar icon */}
          <View style={[styles.avatarCircle, { backgroundColor: avatar.bgColor }]}>
            <Ionicons name={avatar.icon as any} size={22} color={avatar.color} />
          </View>

          {/* Message and metadata body */}
          <TouchableOpacity
            style={styles.messageCol}
            activeOpacity={0.7}
            onPress={() => {
              if (isSelectionMode) {
                toggleSelect(item.id);
              } else {
                if (!item.is_read) markAsRead(item.id);
              }
            }}
            onLongPress={() => {
              if (!isSelectionMode) {
                enterSelectionMode(item.id);
              }
            }}
          >
            <Text style={styles.messageText}>
              {renderFormattedMessage(displayMessage)}
            </Text>

            <View style={styles.metaRow}>
              <Text style={styles.timestampText}>
                {formatNotificationTime(item.created_at)}
              </Text>

              {/* Real-time countdown timer */}
              {remainingSeconds !== null && !decision && !isExpired && (
                <View
                  style={[
                    styles.timerChip,
                    remainingSeconds <= 120 && styles.timerChipUrgent,
                  ]}
                >
                  <Ionicons
                    name={remainingSeconds <= 120 ? 'alert-circle' : 'timer-outline'}
                    size={11}
                    color={remainingSeconds <= 120 ? '#EF4444' : '#059669'}
                  />
                  <Text
                    style={[
                      styles.timerChipText,
                      remainingSeconds <= 120 && styles.timerChipTextUrgent,
                    ]}
                  >
                    {formatRemainingTime(remainingSeconds)}
                  </Text>
                </View>
              )}

              {/* Expired OTP badge */}
              {isOtpAction && isExpired && (
                <View style={styles.expiredBadge}>
                  <Ionicons name="hourglass-outline" size={11} color="#DC2626" />
                  <Text style={styles.expiredBadgeText}>OTP Expired</Text>
                </View>
              )}

              {/* Renter OTP code chip */}
              {isRenterOtp && renterOtpCode && (
                <View style={styles.otpCodeChip}>
                  <Ionicons name="key" size={11} color="#059669" />
                  <Text style={styles.otpCodeChipText}>OTP: {renterOtpCode}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Right Action Column */}
          <View style={styles.actionCol}>
            {!isSelectionMode && (
              <>
                {/* Owner OTP: Verify Button or Regenerate OTP */}
                {isOwnerOtp && (bookingId || isExpired || isRegenerateAction) && (
                  isExpired || isRegenerateAction ? (
                    <TouchableOpacity
                      style={styles.amberPill}
                      onPress={() => handleRegenerateOtp(item)}
                      disabled={isProcessing}
                      activeOpacity={0.8}
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={styles.pillContentRow}>
                          <Ionicons name="refresh" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text style={styles.pillTextWhite}>Regenerate OTP</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.primaryPill}
                      onPress={() =>
                        navigation.navigate('OtpVerification', {
                          bookingId: String(bookingId || ''),
                          actionType: isReturnOtp ? 'return_otp' : 'pickup_otp',
                        })
                      }
                      activeOpacity={0.8}
                    >
                      <Text style={styles.pillTextWhite}>Verify</Text>
                    </TouchableOpacity>
                  )
                )}

                {/* Cycle Verification Button */}
                {isViewCycle && (cycleId || actionData?.cycle_id) && (
                  <TouchableOpacity
                    style={styles.purplePill}
                    onPress={() => handleViewCycle(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pillTextWhite}>View</Text>
                  </TouchableOpacity>
                )}

                {/* Ongoing Rentals Shortcut Button */}
                {(rawAction === 'ongoing_rentals' || rawAction === 'view_booking') && (
                  <TouchableOpacity
                    style={styles.primaryPill}
                    onPress={() => {
                      if (!item.is_read) markAsRead(item.id);
                      navigation.navigate('OngoingRentals');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pillTextWhite}>Ride</Text>
                  </TouchableOpacity>
                )}

                {/* Return Cycle Action */}
                {rawAction === 'return_cycle' && bookingId && (
                  <TouchableOpacity
                    style={styles.amberPill}
                    onPress={() => {
                      if (!item.is_read) markAsRead(item.id);
                      navigation.navigate('Return', { bookingId: String(bookingId) });
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pillTextWhite}>Return</Text>
                  </TouchableOpacity>
                )}

                {/* Processing Spinner */}
                {isProcessing && <ActivityIndicator size="small" color="#4F46E5" />}

                {/* Return Request Decision for Owner */}
                {isReturnDecision && !returnDecision && !isProcessing && (
                  <TouchableOpacity
                    style={styles.emeraldPill}
                    onPress={() => handleAcceptReturn(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pillTextWhite}>Accept</Text>
                  </TouchableOpacity>
                )}

                {/* Status indicators */}
                {decision === 'accepted' && (
                  <View style={styles.statusPillSuccess}>
                    <Ionicons name="checkmark-circle" size={11} color="#059669" />
                    <Text style={styles.statusPillSuccessText}>Accepted</Text>
                  </View>
                )}

                {decision === 'rejected' && (
                  <View style={styles.statusPillDanger}>
                    <Text style={styles.statusPillDangerText}>Rejected</Text>
                  </View>
                )}

                {returnDecision === 'accepted' && (
                  <View style={styles.statusPillSuccess}>
                    <Ionicons name="checkmark-circle" size={11} color="#059669" />
                    <Text style={styles.statusPillSuccessText}>Accepted</Text>
                  </View>
                )}

                {/* Unread indicator dot & quick delete trash button */}
                <View style={styles.utilityActions}>
                  {!item.is_read && <View style={styles.unreadDot} />}
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleDeleteNotification(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Delete notification"
                  >
                    <Ionicons name="trash-outline" size={15} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Multi-action sub-row for pending Rental Request */}
        {isRentalRequest && !isSelectionMode && (
          <View style={styles.requestSubRow}>
            {decision === 'accepted' ? (
              <TouchableOpacity
                style={styles.ongoingRideShortcut}
                onPress={() => navigation.navigate('OngoingRentals')}
              >
                <Text style={styles.ongoingRideShortcutText}>Go to Ongoing Rentals</Text>
                <Ionicons name="arrow-forward" size={13} color="#059669" />
              </TouchableOpacity>
            ) : decision === 'rejected' ? null : isExpired ? (
              <Text style={styles.expiredNoticeText}>Request Expired</Text>
            ) : isCycleAlreadyOccupied ? (
              <View style={styles.occupiedNotice}>
                <Ionicons name="information-circle" size={14} color="#D97706" />
                <Text style={styles.occupiedNoticeText}>Cycle is currently in an active rental</Text>
              </View>
            ) : !isProcessing ? (
              <View style={styles.decisionActionsGroup}>
                <TouchableOpacity
                  style={styles.acceptPillBtn}
                  onPress={() => handleRentalDecision(item, 'accepted')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  <Text style={styles.acceptPillBtnText}>Accept</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectPillBtn}
                  onPress={() => handleRentalDecision(item, 'rejected')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={14} color="#EF4444" />
                  <Text style={styles.rejectPillBtnText}>Reject</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.renterDetailsPillBtn}
                  onPress={() => handlePersonLogoPress(item)}
                  activeOpacity={0.7}
                  accessibilityLabel="View Renter Details"
                >
                  <Ionicons name="person-circle-outline" size={18} color="#4F46E5" />
                  <Text style={styles.renterDetailsPillText}>Renter Info</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Conditional Header: Regular vs Selection Mode */}
      {isSelectionMode ? (
        <View style={[styles.selectionHeader, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity
            onPress={exitSelectionMode}
            style={styles.selectionCloseBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.selectionTitle}>
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select notifications'}
          </Text>
          <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn} activeOpacity={0.7}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === notifications.length && notifications.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Header
          title="Notifications"
          showBack
          rightComponent={
            <View style={styles.headerActionsRow}>
              <TouchableOpacity
                onPress={handleManualRefresh}
                style={styles.headerActionBtn}
                activeOpacity={0.7}
                disabled={isManualRefreshing || loading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Refresh notifications"
              >
                {isManualRefreshing || loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="refresh" size={22} color={colors.textPrimary} />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowMenuModal(true)}
                style={styles.headerActionBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="More options"
              >
                <Ionicons name="ellipsis-vertical" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {loading && notifications.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={styles.loadingText}>Fetching notifications...</Text>
        </View>
      ) : notifications.length === 0 ? (
        /* Empty State matching Mockup Screen 1 */
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIllustrationWrapper}>
            <View style={styles.emptyBlob}>
              <Ionicons
                name="notifications-outline"
                size={56}
                color="#818CF8"
                style={{ transform: [{ rotate: '-12deg' }] }}
              />
              <View style={styles.emptyBadge}>
                <Text style={styles.emptyBadgeText}>0</Text>
              </View>
            </View>
          </View>

          <Text style={styles.emptyHeading}>No Notification to show</Text>
          <Text style={styles.emptySubheading}>
            You currently have no notifications. We will notify you when something new happens!
          </Text>

          <View style={styles.emptyActionsRow}>
            <TouchableOpacity
              style={styles.exploreBtn}
              onPress={() => navigation.navigate('Home')}
              activeOpacity={0.85}
            >
              <Text style={styles.exploreBtnText}>Explore</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emptyRefreshBtn}
              onPress={handleManualRefresh}
              activeOpacity={0.85}
              disabled={isManualRefreshing || loading}
            >
              {isManualRefreshing || loading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.emptyRefreshBtnText}>Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Grouped Sections List matching Mockup Screen 2 */
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => (item.id ? `${item.id}-${index}` : `notif-${index}`)}
          renderItem={renderNotification}
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeaderContainer}>
              <Text style={styles.sectionHeaderText}>{title}</Text>
            </View>
          )}
          contentContainerStyle={[
            styles.listContentContainer,
            isSelectionMode && { paddingBottom: 100 },
          ]}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              colors={['#4F46E5']}
              tintColor="#4F46E5"
            />
          }
        />
      )}

      {/* =========================================================
          BOTTOM ACTION BAR (In Multi-Select Mode)
      ========================================================= */}
      {isSelectionMode && (
        <View style={[styles.bottomActionBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <TouchableOpacity
            style={[
              styles.bottomActionBtn,
              styles.bottomActionBtnRead,
              selectedIds.size === 0 && styles.bottomActionBtnDisabled,
            ]}
            onPress={handleMarkSelectedAsRead}
            disabled={selectedIds.size === 0}
            activeOpacity={0.8}
          >
            <Ionicons
              name="checkmark-done"
              size={17}
              color={selectedIds.size === 0 ? '#9CA3AF' : '#4F46E5'}
            />
            <Text
              style={[
                styles.bottomActionBtnReadText,
                selectedIds.size === 0 && styles.bottomActionBtnTextDisabled,
              ]}
            >
              Mark Read {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.bottomActionBtn,
              styles.bottomActionBtnDelete,
              selectedIds.size === 0 && styles.bottomActionBtnDisabled,
            ]}
            onPress={handleDeleteSelected}
            disabled={selectedIds.size === 0}
            activeOpacity={0.8}
          >
            <Ionicons
              name="trash-outline"
              size={17}
              color={selectedIds.size === 0 ? '#9CA3AF' : '#FFFFFF'}
            />
            <Text
              style={[
                styles.bottomActionBtnDeleteText,
                selectedIds.size === 0 && styles.bottomActionBtnTextDisabled,
              ]}
            >
              Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* =========================================================
          THREE-DOTS MENU BOTTOM SHEET (Mockup Screen 3)
      ========================================================= */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.menuHandle} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenuModal(false);
                handleManualRefresh();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="refresh" size={18} color={colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.menuItemText, { color: colors.primary, fontWeight: '700' }]}>
                  Refresh Notifications
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenuModal(false);
                enterSelectionMode();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="checkbox-outline" size={18} color="#4F46E5" style={{ marginRight: 8 }} />
                <Text style={styles.menuItemSelectText}>Select Notifications</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenuModal(false);
                handleClearAll();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="trash-outline" size={18} color="#EF4444" style={{ marginRight: 8 }} />
                <Text style={styles.menuItemClearText}>Clear All</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenuModal(false);
                handleMarkAllRead();
              }}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemRow}>
                <Ionicons name="checkmark-done" size={18} color="#1F2937" style={{ marginRight: 8 }} />
                <Text style={styles.menuItemText}>Mark all as read</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowMenuModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.menuItemCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
                <Ionicons name="person-circle" size={24} color="#4F46E5" />
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
                  <Ionicons name="shield-checkmark" size={16} color="#059669" />
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
                        style={styles.modalAcceptBtn}
                        onPress={() =>
                          handleRentalDecision(selectedRenterModal.notification, 'accepted')
                        }
                      >
                        <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
                        <Text style={styles.modalAcceptBtnText}>Accept Request</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.modalRejectBtn}
                        onPress={() =>
                          handleRentalDecision(selectedRenterModal.notification, 'rejected')
                        }
                      >
                        <Ionicons name="close-circle" size={18} color="#EF4444" />
                        <Text style={styles.modalRejectBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContentContainer: {
    paddingBottom: 40,
  },

  /* Selection Mode Header */
  selectionHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectionCloseBtn: {
    padding: 6,
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  selectAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  selectAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },

  /* Section Header */
  sectionHeaderContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'capitalize',
  },

  /* Notification Row / Card */
  card: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  unreadCard: {
    backgroundColor: '#FAFAFF',
  },
  selectedCard: {
    backgroundColor: '#F5F3FF',
    borderBottomColor: '#E0E7FF',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkboxWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 10,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  messageCol: {
    flex: 1,
    paddingRight: 8,
  },
  messageText: {
    fontSize: 13.5,
    color: '#1F2937',
    lineHeight: 19,
    fontWeight: '400',
  },
  highlightedAmount: {
    fontWeight: '700',
    color: '#2563EB',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  timestampText: {
    fontSize: 11.5,
    color: '#9CA3AF',
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  timerChipUrgent: {
    backgroundColor: '#FEF2F2',
  },
  timerChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  timerChipTextUrgent: {
    color: '#EF4444',
  },
  expiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  expiredBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  pillContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpCodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  otpCodeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  /* Action Column & Pill Buttons */
  actionCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  primaryPill: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emeraldPill: {
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amberPill: {
    backgroundColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purplePill: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTextWhite: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
  statusPillSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillSuccessText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },
  statusPillDanger: {
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillDangerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  utilityActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4F46E5',
  },
  trashBtn: {
    padding: 2,
  },

  /* Multi-action sub row for Rental Request */
  requestSubRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  decisionActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  acceptPillBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  rejectPillBtnText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  renterDetailsPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  renterDetailsPillText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
  },
  ongoingRideShortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ongoingRideShortcutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  expiredNoticeText: {
    fontSize: 11.5,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  occupiedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  occupiedNoticeText: {
    fontSize: 11.5,
    color: '#D97706',
    fontWeight: '500',
  },

  /* Empty State matching Mockup Screen 1 */
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  emptyIllustrationWrapper: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlob: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  emptyBadge: {
    position: 'absolute',
    top: 24,
    right: 28,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  emptyBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4F46E5',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubheading: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 270,
    marginBottom: 28,
  },
  exploreBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 24,
    ...shadows.sm,
  },
  exploreBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Loading Container */
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13.5,
    color: '#6B7280',
  },

  /* Bottom Action Bar for Multi-select */
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    ...shadows.md,
  },
  bottomActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 24,
    gap: 6,
  },
  bottomActionBtnRead: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  bottomActionBtnReadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
  },
  bottomActionBtnDelete: {
    backgroundColor: '#EF4444',
  },
  bottomActionBtnDeleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bottomActionBtnDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    opacity: 0.6,
  },
  bottomActionBtnTextDisabled: {
    color: '#9CA3AF',
  },

  /* Three-Dots Menu Bottom Sheet (Mockup Screen 3) */
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    ...shadows.lg,
  },
  menuHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 12,
  },
  menuItem: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemSelectText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#4F46E5',
  },
  menuItemClearText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#EF4444',
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 4,
  },
  menuItemCancelText: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#111827',
  },

  /* Renter Details Modal */
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
    backgroundColor: 'rgba(79, 70, 229, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  modalAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#4F46E5',
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
    color: '#059669',
    fontSize: typography.body2.fontSize,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalAcceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  modalAcceptBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalRejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 6,
  },
  modalRejectBtnText: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 14,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionBtn: {
    padding: 6,
    borderRadius: 8,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: spacing.md,
  },
  emptyRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: borderRadius.md,
  },
  emptyRefreshBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
