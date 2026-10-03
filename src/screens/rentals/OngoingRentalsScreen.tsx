import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  canChatOrCall,
  isTimerRunning,
  getStatusMeta,
  calculateRemainingTime,
  calculateExtraCharges} from '../../lib/bookingStatus';
import { Booking, NotificationItem } from '../../types';
import { useNotifications } from '../../hooks/useNotifications';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import RentalBottomNav from '../../components/RentalBottomNav';
import { getCycleImageUrl } from '../../lib/cycleUtils';
import { deleteBookingChat } from '../../lib/chatStorage';
import RazorpayCheckoutModal from '../../components/RazorpayCheckoutModal';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { apiClient, isReturnBookingAccepted, markReturnBookingAccepted } from '../../lib/apiClient';
import SwipeableScreenWrapper from '../../components/SwipeableScreenWrapper';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const formatRentalTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return (
      d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ', ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return String(dateStr);
  }
};

const extractValidOtp = (val: any): string | null => {
  if (!val) return null;
  const s = String(val).trim();
  if (s.includes('$')) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4 && digits.length <= 6) return digits;
  return null;
};

/**
 * Extracts the Pickup or Return OTP for a rental from the user's received notifications.
 */
const getRenterOtpFromNotifications = (
  booking: Booking,
  notifications: NotificationItem[],
  isReturnOtpState: boolean
): string | null => {
  // 1. If booking already has a valid extracted OTP, return it
  if (isReturnOtpState && booking.return_otp) {
    const v = extractValidOtp(booking.return_otp);
    if (v) return v;
  }
  if (!isReturnOtpState) {
    if (booking.otp_code) {
      const v = extractValidOtp(booking.otp_code);
      if (v) return v;
    }
    if (booking.pickup_otp) {
      const v = extractValidOtp(booking.pickup_otp);
      if (v) return v;
    }
  }

  if (!notifications || notifications.length === 0) return null;

  const cleanBookingId = String(booking.id || '').replace(/^Bearer\s+/i, '').trim();
  const cleanCycleId = String(booking.cycle_id || '').trim().toLowerCase();
  const cleanCycleTitle = String(booking.cycle_title || '').trim().toLowerCase();

  const parseActionData = (notif: NotificationItem): any => {
    const cand =
      notif.action_data ||
      (notif as any).payload ||
      (notif as any).payload_response ||
      (notif as any).data ||
      {};
    if (typeof cand === 'string') {
      try {
        return JSON.parse(cand);
      } catch {
        return {};
      }
    }
    return typeof cand === 'object' && cand !== null ? cand : {};
  };

  const extractOtpCandidate = (notif: NotificationItem, forReturn: boolean): string | null => {
    const actionData = parseActionData(notif);
    const msg = String(notif.message || '');
    const title = String(notif.title || '').toLowerCase();

    // Never pick OTP from notifications instructing the owner to verify/enter OTP
    if (title.includes('enter') && (title.includes('otp') || title.includes('verify'))) {
      return null;
    }

    if (forReturn) {
      const cand = actionData.return_otp || actionData.returnOtp || actionData.otp_code || actionData.otp;
      if (cand && !String(cand).includes('$')) {
        const v = extractValidOtp(cand);
        if (v) return v;
      }
      const returnMatch = msg.match(/(?:return\s+otp(?:\s+code)?\s+is\s+|otp\s+is\s+|return\s+otp:\s*)(\d{4,6})/i);
      if (returnMatch && returnMatch[1]) return returnMatch[1];
    } else {
      const cand =
        actionData.pickup_otp ||
        actionData.pickupOtp ||
        actionData.otp_code ||
        actionData.otp ||
        (notif as any).pickup_otp ||
        (notif as any).otp_code;
      if (cand && !String(cand).includes('$')) {
        const v = extractValidOtp(cand);
        if (v) return v;
      }
      const pickupMatch = msg.match(/(?:pickup\s+otp(?:\s+code)?\s+is\s+|your\s+(?:pickup\s+)?otp\s+is\s+|otp\s+is\s+|otp:\s*|code:\s*)(\d{4,6})/i);
      if (pickupMatch && pickupMatch[1]) return pickupMatch[1];
    }

    // Generic 6-digit or 4-digit match in notification message
    const msgLower = msg.toLowerCase();
    const isOtpContext =
      msgLower.includes('otp') ||
      msgLower.includes('pickup') ||
      msgLower.includes('share') ||
      msgLower.includes('accepted') ||
      msgLower.includes('coordinate') ||
      title.includes('accepted') ||
      title.includes('confirmed') ||
      title.includes('otp');

    if (isOtpContext) {
      const sixDigit = msg.match(/\b\d{6}\b/);
      if (sixDigit) return sixDigit[0];
      const fourToSix = msg.match(/\b\d{4,6}\b/);
      if (fourToSix) return fourToSix[0];
    }

    return null;
  };

  // Priority 1: Match by exact booking_id
  for (const notif of notifications) {
    const actionData = parseActionData(notif);
    const notifBookingId = String(notif.booking_id || actionData.booking_id || actionData.bookingId || '').trim();
    if (notifBookingId && cleanBookingId && notifBookingId === cleanBookingId) {
      const otp = extractOtpCandidate(notif, isReturnOtpState);
      if (otp) return otp;
    }
  }

  // Priority 2: Match by cycle_id
  for (const notif of notifications) {
    const actionData = parseActionData(notif);
    const notifCycleId = String(actionData.cycle_id || actionData.cycleId || '').trim().toLowerCase();
    if (notifCycleId && cleanCycleId && notifCycleId === cleanCycleId) {
      const otp = extractOtpCandidate(notif, isReturnOtpState);
      if (otp) return otp;
    }
  }

  // Priority 3: Match by cycle_title or message content
  for (const notif of notifications) {
    const actionData = parseActionData(notif);
    const notifCycleTitle = String(
      actionData.cycle_title || actionData.cycle_name || actionData.brand || actionData.cycleBrand || ''
    ).trim().toLowerCase();
    const msgLower = String(notif.message || '').toLowerCase();

    const matchesTitle =
      cleanCycleTitle &&
      ((notifCycleTitle && (cleanCycleTitle.includes(notifCycleTitle) || notifCycleTitle.includes(cleanCycleTitle))) ||
       msgLower.includes(cleanCycleTitle));

    if (matchesTitle) {
      const otp = extractOtpCandidate(notif, isReturnOtpState);
      if (otp) return otp;
    }
  }

  // Priority 4: Most recent matching OTP notification
  for (const notif of notifications) {
    const otp = extractOtpCandidate(notif, isReturnOtpState);
    if (otp) return otp;
  }

  return null;
};

export const getConversationIdFromNotifications = (
  booking: Booking,
  notifications?: NotificationItem[]
): string | null => {
  if (!booking) return null;

  const cleanBookingId = String(booking.id || '').replace(/^Bearer\s+/i, '').trim();

  if (notifications && notifications.length > 0) {
    // 1. Look for rental_otp_generated notification matching this booking
    for (const notif of notifications) {
      const title = String(notif.title || '').toLowerCase().trim();
      const actionType = String(notif.action_type || (notif as any).actionType || '').toLowerCase().trim();
      const actionData = typeof notif.action_data === 'string'
        ? (() => { try { return JSON.parse(notif.action_data); } catch { return {}; } })()
        : (notif.action_data || (notif as any).payload || (notif as any).data || {});

      const notifBookingId = String(
        notif.booking_id ||
        actionData?.booking_id ||
        actionData?.bookingId ||
        ''
      ).trim();

      const isRentalOtpGen =
        title === 'rental_otp_generated' ||
        title.includes('rental_otp_generated') ||
        actionType === 'rental_otp_generated' ||
        actionType.includes('rental_otp_generated');

      const matchesBooking = !cleanBookingId || notifBookingId === cleanBookingId || (notif.message && notif.message.includes(cleanBookingId));

      if (isRentalOtpGen || matchesBooking) {
        const convId =
          notif.conversation_id ||
          actionData?.conversation_id ||
          actionData?.conversationId ||
          (notif as any)?.payload?.conversation_id ||
          (notif as any)?.data?.conversation_id;

        if (convId) {
          console.log(`[OngoingRentalsScreen] 🎯 Found conversation_id: "${convId}" in notification "${notif.title}" for booking ${cleanBookingId}`);
          return String(convId).trim();
        }
      }
    }

    // 2. Check any notification that has conversation_id for this booking
    for (const notif of notifications) {
      const actionData = typeof notif.action_data === 'string'
        ? (() => { try { return JSON.parse(notif.action_data); } catch { return {}; } })()
        : (notif.action_data || (notif as any).payload || (notif as any).data || {});

      const notifBookingId = String(
        notif.booking_id ||
        actionData?.booking_id ||
        actionData?.bookingId ||
        ''
      ).trim();

      if (cleanBookingId && notifBookingId === cleanBookingId) {
        const convId =
          notif.conversation_id ||
          actionData?.conversation_id ||
          actionData?.conversationId;
        if (convId) {
          return String(convId).trim();
        }
      }
    }
  }

  return (booking as any)?.conversation_id || (booking as any)?.conversationId || null;
};

const extractImagesFromAgg = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          return item.image_url || item.url || item.storage_path || '';
        }
        return '';
      })
      .filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return extractImagesFromAgg(parsed);
      }
    } catch {}
    if (raw.startsWith('http') || raw.startsWith('data:')) {
      return [raw];
    }
  }
  return [];
};

const REPORT_REASONS = [
  'Damage to Cycle',
  'Misconduct',
  'Fraudulent Activity',
  'Failure to Return Cycle',
  'Abusive Behaviour',
  'False Information',
  'Payment Issue',
  'Other',
];

export default function OngoingRentalsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, profile } = useAuth();
  const { notifications, refreshNotifications } = useNotifications();

  const [rentals, setRentals] = useState<Booking[]>([]);
  const [selectedTab, setSelectedTab] = useState<'all' | 'renter' | 'owner'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Filter rentals based on active tab
  const filteredRentals = useMemo(() => {
    return rentals.filter((item) => {
      if (selectedTab === 'renter') return !item.is_owner;
      if (selectedTab === 'owner') return Boolean(item.is_owner);
      return true;
    });
  }, [rentals, selectedTab]);

  const renterCount = useMemo(() => rentals.filter((r) => !r.is_owner).length, [rentals]);
  const ownerCount = useMemo(() => rentals.filter((r) => Boolean(r.is_owner)).length, [rentals]);

  // Razorpay payment modal state
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);

  // Report modal state
  const [reportingBooking, setReportingBooking] = useState<Booking | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  // Accept return state
  const [processingAcceptId, setProcessingAcceptId] = useState<string | null>(null);
  const [acceptedReturnIds, setAcceptedReturnIds] = useState<Set<string>>(new Set());

  const handleAcceptReturnFromRental = async (booking: Booking) => {
    const cleanBookingId = String(booking.id).replace(/^Bearer\s+/i, '').trim();
    if (!cleanBookingId) {
      Alert.alert('Error', 'Missing booking identifier.');
      return;
    }

    try {
      setProcessingAcceptId(booking.id);
      console.log(`[OngoingRentalsScreen] Owner accepting return for booking ${cleanBookingId}...`);
      await apiClient.acceptReturn(cleanBookingId);

      markReturnBookingAccepted(cleanBookingId);
      setAcceptedReturnIds((prev) => new Set(prev).add(booking.id).add(cleanBookingId));

      Alert.alert(
        'Return Accepted! 🎉',
        'You have accepted the return request. The renter will provide their 6-digit Return OTP to complete the return.',
        [
          {
            text: 'Enter Return OTP',
            onPress: () =>
              navigation.navigate('OtpVerification', {
                bookingId: cleanBookingId,
                actionType: 'return_otp',
              }),
          },
          { text: 'OK', style: 'cancel' },
        ]
      );

      fetchOngoingRentals();
    } catch (err: any) {
      console.error('[OngoingRentalsScreen] Error accepting return request:', err);
      Alert.alert(
        'Action Failed',
        err?.data?.message || err?.message || 'Unable to accept return request. Please try again.'
      );
    } finally {
      setProcessingAcceptId(null);
    }
  };

  const handleOpenReport = (booking: Booking) => {
    setReportingBooking(booking);
    setReportReason('');
    setReportDescription('');
  };

  const handleSubmitReport = async () => {
    if (!reportingBooking || !user) return;
    if (!reportReason) {
      Alert.alert('Selection Required', 'Please select a reason for the report.');
      return;
    }
    if (!reportDescription.trim()) {
      Alert.alert('Description Required', 'Please describe the issue.');
      return;
    }

    const cleanBookingId = String(reportingBooking.id || '').replace(/^Bearer\s+/i, '').trim();
    if (!cleanBookingId) {
      Alert.alert('Error', 'Missing booking identifier.');
      return;
    }

    setSubmittingReport(true);
    try {
      console.log(`[OngoingRentalsScreen] Submitting rental report for booking ${cleanBookingId}...`);
      const response = await apiClient.submitRentalReport({
        booking_id: cleanBookingId,
        reason: reportReason.trim(),
        description: reportDescription.trim(),
      });

      const successMsg =
        response?.message ||
        response?.data?.message ||
        'Report submitted successfully. The campus administration will review it promptly.';

      Alert.alert('Report Submitted 🎉', successMsg);
      setReportingBooking(null);
      setReportReason('');
      setReportDescription('');
    } catch (err: any) {
      console.error('[OngoingRentalsScreen] Error submitting report via API:', err);
      Alert.alert(
        'Submission Error',
        err?.data?.message || err?.message || 'Unable to submit the report. Please try again.'
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  // Timer ticker every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchOngoingRentals = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      console.log('[OngoingRentalsScreen] Fetching ongoing rentals via apiClient.getOngoingRentals()...');
      let rawRows: any[] = [];
      let apiSuccess = false;

      try {
        const res = await apiClient.getOngoingRentals();
        console.log('[OngoingRentalsScreen] getOngoingRentals response:', res);

        if (Array.isArray(res)) {
          rawRows = res;
          apiSuccess = true;
        } else if (res && Array.isArray(res.data)) {
          rawRows = res.data;
          apiSuccess = true;
        } else if (res && res.data && Array.isArray(res.data.rows)) {
          rawRows = res.data.rows;
          apiSuccess = true;
        } else if (res && Array.isArray(res.rows)) {
          rawRows = res.rows;
          apiSuccess = true;
        } else if (res && res.success && Array.isArray(res.data)) {
          rawRows = res.data;
          apiSuccess = true;
        }
      } catch (apiErr: any) {
        console.warn('[OngoingRentalsScreen] apiClient.getOngoingRentals network note / offline:', apiErr?.message || apiErr);
      }

      if (apiSuccess && rawRows.length > 0) {
        console.log(`[OngoingRentalsScreen] Processing ${rawRows.length} ongoing rentals from backend query`);
        const mappedList: Booking[] = rawRows.map((row: any, idx: number) => {
          const rawImages = extractImagesFromAgg(row.json_agg || row.images || row.image_url);
          const cycleImage = rawImages.length > 0 ? getCycleImageUrl(rawImages[0]) : null;

          const brand = (row.brand || '').trim();
          const model = (row.model || '').trim();
          const cycleTitle = brand || model ? `${brand} ${model}`.trim() : 'Campus Cycle';

          const rentalPrice = Number(row.rental_price || 0);
          const renterCharge = row.renter_charge != null ? Number(row.renter_charge) : null;
          const totalPrice = renterCharge != null && renterCharge > 0 ? renterCharge : rentalPrice;

          // Duration calculation from start_time and end_time
          let durationHours = Number(row.duration_hours || row.total_duration_hours || 0);
          if (!durationHours && row.start_time && row.end_time) {
            const startMs = new Date(row.start_time).getTime();
            const endMs = new Date(row.end_time).getTime();
            if (endMs > startMs) {
              const diffHours = (endMs - startMs) / (1000 * 60 * 60);
              durationHours = Math.round(diffHours * 10) / 10;
            }
          }
          if (!durationHours) durationHours = 1;

          // Status handling: b.status IN ('slot_booked','payment_pending','payment_failed','active','return_pending','return_accepted')
          let bookingStatus = String(row.status || row.b_status || row.booking_status || 'active').toLowerCase().trim();
          if (
            bookingStatus !== 'active' &&
            bookingStatus !== 'return_requested' &&
            bookingStatus !== 'return_pending' &&
            bookingStatus !== 'return_accepted' &&
            bookingStatus !== 'slot_booked' &&
            bookingStatus !== 'payment_pending' &&
            bookingStatus !== 'payment_failed'
          ) {
            bookingStatus = 'active';
          }

          // Participant & Role identification:
          // Backend determines role from query:
          // CASE WHEN b.owner_id = $1 THEN jsonb_build_object('owner_name', owner.full_name) 
          //      ELSE jsonb_build_object('renter_name', renter.full_name)
          // END AS user_details
          let userDetails = row.user_details;
          if (typeof userDetails === 'string') {
            try {
              userDetails = JSON.parse(userDetails);
            } catch {}
          }

          // If 'owner_name' is present in userDetails, backend confirmed b.owner_id = $1 (CURRENT USER IS OWNER)
          // If 'renter_name' is present in userDetails, b.owner_id != $1 (CURRENT USER IS RENTER)
          const isOwner = Boolean(
            (userDetails && ('owner_name' in userDetails || userDetails.owner_name !== undefined)) ||
            row.is_owner === true ||
            (row.owner_id && user.id && row.owner_id === user.id)
          );
          const isRenter = !isOwner;

          const ownerFullName = (userDetails?.owner_name || row.owner_name || row.full_name || '').trim();
          const renterFullName = (userDetails?.renter_name || row.renter_name || '').trim();

          const otherUserName = isOwner
            ? (renterFullName || 'Renter')
            : (ownerFullName || 'Cycle Owner');

          const bookingId = String(row.booking_id || row.b_id || row.id || `booking-${idx}`);
          const cycleId = String(row.cycle_id || row.c_id || row.id || `cycle-${idx}`);

          const rawReturnOtp =
            row.return_otp ||
            row.returnOtp ||
            row.return_code ||
            (row.action_data && row.action_data.return_otp);
          const rawPickupOtp =
            row.pickup_otp ||
            row.otp_code ||
            row.otp ||
            row.pickupOtp ||
            (row.action_data && row.action_data.pickup_otp);

          const returnOtp =
            extractValidOtp(rawReturnOtp) ||
            getRenterOtpFromNotifications(
              { id: bookingId, cycle_id: cycleId, cycle_title: cycleTitle, is_owner: isOwner } as any,
              notifications,
              true
            );
          const pickupOtp =
            extractValidOtp(rawPickupOtp) ||
            getRenterOtpFromNotifications(
              { id: bookingId, cycle_id: cycleId, cycle_title: cycleTitle, is_owner: isOwner } as any,
              notifications,
              false
            );

          return {
            id: bookingId,
            cycle_id: cycleId,
            owner_id: row.owner_id || (isOwner ? user.id : ''),
            renter_id: row.renter_id || (isRenter ? user.id : ''),
            status: bookingStatus as any,
            rental_price: rentalPrice,
            renter_charge: renterCharge,
            total_price: totalPrice,
            start_time: row.start_time || null,
            end_time: row.end_time || null,
            created_at: row.created_at || row.start_time || new Date().toISOString(),
            cycle_title: cycleTitle,
            cycle_image: cycleImage,
            cycle_location: row.location || 'Campus',
            cycle_type: row.cycle_type || undefined,
            condition: row.condition || undefined,
            rating: row.rating ? Number(row.rating) : undefined,
            description: row.description || undefined,
            brand: brand || undefined,
            model: model || undefined,
            images: rawImages,
            owner_name: ownerFullName || undefined,
            is_owner: isOwner,
            other_user_name: otherUserName,
            other_user_id: isRenter ? (row.owner_id || '') : (row.renter_id || ''),
            duration_hours: durationHours,
            total_duration_hours: durationHours,
            otp_code: pickupOtp,
            pickup_otp: pickupOtp,
            return_otp: returnOtp,
            cycles: {
              id: cycleId,
              brand: brand || 'Cycle',
              model: model || '',
              location: row.location || 'Campus',
              condition: row.condition,
              cycle_type: row.cycle_type,
              rating: row.rating ? Number(row.rating) : 0,
              description: row.description,
              price_per_hour: rentalPrice,
              price_per_day: rentalPrice * 8,
              is_verified: true,
              owner_id: row.owner_id || (isOwner ? user.id : ''),
              status: 'active',
            },
          };
        });

        setRentals(mappedList);
        return;
      } else {
        console.log('[OngoingRentalsScreen] Backend returned 0 ongoing rentals.');
        setRentals([]);
        return;
      }
    } catch (err: any) {
      console.error('[OngoingRentalsScreen] Error fetching ongoing rentals:', err?.message || err);
      setRentals([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, profile]);

  useEffect(() => {
    fetchOngoingRentals();
  }, [fetchOngoingRentals]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOngoingRentals();
    refreshNotifications?.().catch(() => {});
  };

  const handlePaymentSuccess = async (paymentId: string) => {
    Alert.alert('Payment Successful! 🚴', 'Your rental is now active. Have a safe ride!');
    setCheckoutBooking(null);
    fetchOngoingRentals();
  };

  const renderRentalCard = ({ item }: { item: Booking }) => {
    const isOwner = Boolean(item.is_owner);
    const isRenter = !isOwner;
    const statusMeta = getStatusMeta(item.status);
    const allowChatCall = canChatOrCall(item.status);
    const timerRunning = isTimerRunning(item.status);

    // Duration & countdown calculation
    const durationHours = Number(item.total_duration_hours || item.duration_hours || 1);
    const remainingTime = timerRunning ? calculateRemainingTime(item.start_time, durationHours) : null;
    const extraCharges = timerRunning ? calculateExtraCharges(item.start_time, durationHours) : { minutesOverdue: 0, extraCharges: 0, isGracePeriod: false };

    const cycleImage = item.cycle_image || (item.images && item.images.length > 0 ? getCycleImageUrl(item.images[0]) : null);
    const hasMultiplePhotos = Boolean(item.images && item.images.length > 1);

    const isReturnOtpState =
      item.status === 'return_pending' ||
      item.status === 'return_requested' ||
      (item.status as any) === 'return_accepted' ||
      acceptedReturnIds.has(item.id) ||
      isReturnBookingAccepted(item.id) ||
      Boolean(item.return_otp);

    const isAccepted =
      (item.status as any) === 'return_accepted' ||
      acceptedReturnIds.has(item.id) ||
      isReturnBookingAccepted(item.id);

    // Dynamically look up pickup/return OTP from notifications for renter if not present in item
    const displayReturnOtp =
      item.return_otp ||
      getRenterOtpFromNotifications(item, notifications, true);

    const displayPickupOtp =
      item.otp_code ||
      item.pickup_otp ||
      getRenterOtpFromNotifications(item, notifications, false);

    const displayOtp = isReturnOtpState ? displayReturnOtp : displayPickupOtp;

    return (
      <View style={styles.card}>
        {/* Status Header */}
        <View style={[styles.cardHeader, { backgroundColor: statusMeta.bgColor }]}>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusDot, { backgroundColor: statusMeta.color }]} />
            <Text style={[styles.statusTitle, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
          </View>
          <View style={[styles.roleBadge, isOwner ? styles.ownerBadge : styles.renterBadge]}>
            <Ionicons
              name={isOwner ? 'key' : 'bicycle'}
              size={12}
              color={isOwner ? '#7C3AED' : colors.primary}
            />
            <Text style={[styles.roleBadgeText, { color: isOwner ? '#7C3AED' : colors.primary }]}>
              {isOwner ? 'OWNER • YOUR CYCLE' : 'RENTER • YOUR RIDE'}
            </Text>
          </View>
        </View>

        {/* Content Body */}
        <View style={styles.cardBody}>
          {/* Main Cycle Info Row */}
          <View style={styles.cycleInfoRow}>
            <View style={styles.thumbWrapper}>
              {cycleImage ? (
                <Image source={{ uri: cycleImage }} style={styles.cycleThumb} />
              ) : (
                <View style={styles.noThumb}>
                  <Ionicons name="bicycle-outline" size={28} color={colors.textLight} />
                </View>
              )}
              {hasMultiplePhotos && (
                <View style={styles.photoBadge}>
                  <Ionicons name="images-outline" size={10} color={colors.white} />
                  <Text style={styles.photoBadgeText}>{item.images?.length}</Text>
                </View>
              )}
            </View>

            <View style={styles.cycleInfoText}>
              <Text style={styles.cycleTitle} numberOfLines={1}>
                {item.cycle_title || 'Campus Cycle'}
              </Text>

              {/* Owner / Participant name */}
              <View style={styles.participantRow}>
                <Ionicons
                  name={isRenter ? 'person-circle-outline' : 'bicycle-outline'}
                  size={14}
                  color={colors.textSecondary}
                />
                <Text style={styles.participantName}>
                  {isRenter ? 'Owner: ' : 'Renter: '}
                  <Text style={styles.participantHighlight}>
                    {item.other_user_name || item.owner_name || (isRenter ? 'Cycle Owner' : 'Renter')}
                  </Text>
                </Text>
              </View>

              {/* Pricing Breakdown */}
              <View style={styles.priceRow}>
                <Text style={styles.fareText}>
                  Rent: ₹{item.rental_price != null ? item.rental_price : (item.total_price || 0)}
                </Text>
                {item.renter_charge != null && item.renter_charge > 0 && (
                  <Text style={styles.chargeSubtext}>
                    • Charge: ₹{item.renter_charge}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Cycle Specs Chips Row (from c.cycle_type, c.condition, c.location, c.rating) */}
          {(item.cycle_type || item.condition || item.cycle_location || (item.rating != null && item.rating > 0)) && (
            <View style={styles.specsRow}>
              {Boolean(item.cycle_type) && (
                <View style={styles.specChip}>
                  <Ionicons name="flash-outline" size={12} color={colors.primary} />
                  <Text style={styles.specChipText}>{item.cycle_type}</Text>
                </View>
              )}
              {Boolean(item.condition) && (
                <View style={styles.specChip}>
                  <Ionicons name="shield-checkmark-outline" size={12} color="#059669" />
                  <Text style={styles.specChipText}>{item.condition}</Text>
                </View>
              )}
              {Boolean(item.cycle_location) && (
                <View style={styles.specChip}>
                  <Ionicons name="location-outline" size={12} color="#D97706" />
                  <Text style={styles.specChipText} numberOfLines={1}>{item.cycle_location}</Text>
                </View>
              )}
              {item.rating != null && item.rating > 0 ? (
                <View style={styles.specChip}>
                  <Ionicons name="star" size={12} color="#EAB308" />
                  <Text style={styles.specChipText}>{Number(item.rating).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          )}

          {/* Description snippet if available from c.description */}
          {Boolean(item.description) && (
            <View style={styles.descriptionBox}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textLight} style={{ marginTop: 1 }} />
              <Text style={styles.descriptionText} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
          )}

          {/* Rental Time schedule: start_time and end_time */}
          {(item.start_time || item.end_time) && (
            <View style={styles.timelineBox}>
              <View style={styles.timelineCol}>
                <Text style={styles.timelineLabel}>START TIME</Text>
                <Text style={styles.timelineValue}>{formatRentalTime(item.start_time)}</Text>
              </View>
              <View style={styles.timelineDivider} />
              <View style={[styles.timelineCol, { alignItems: 'flex-end' }]}>
                <Text style={styles.timelineLabel}>SCHEDULED END</Text>
                <Text style={styles.timelineValue}>{formatRentalTime(item.end_time)}</Text>
              </View>
            </View>
          )}

          {/* TIMER SECTION (Active ride or return requested) */}
          {timerRunning ? (
            <View style={styles.timerBox}>
              <View style={styles.timerHeader}>
                <Ionicons name="time-outline" size={18} color={colors.accent} />
                <Text style={styles.timerHeaderLabel}>Rental Timer (Active)</Text>
              </View>

              {remainingTime?.isExpired ? (
                <View style={styles.expiredNotice}>
                  <Text style={styles.expiredText}>Rental Duration Elapsed</Text>
                  {extraCharges.isGracePeriod ? (
                    <Text style={styles.graceText}>Within 10 min grace period</Text>
                  ) : (
                    <Text style={styles.overdueText}>
                      Overdue by {extraCharges.minutesOverdue}m • Extra charges: ₹{extraCharges.extraCharges}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.countdownRow}>
                  <View style={styles.timeDigitBox}>
                    <Text style={styles.timeDigit}>
                      {String(remainingTime?.hours || 0).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timeUnit}>HRS</Text>
                  </View>
                  <Text style={styles.timeColon}>:</Text>
                  <View style={styles.timeDigitBox}>
                    <Text style={styles.timeDigit}>
                      {String(remainingTime?.minutes || 0).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timeUnit}>MIN</Text>
                  </View>
                  <Text style={styles.timeColon}>:</Text>
                  <View style={styles.timeDigitBox}>
                    <Text style={styles.timeDigit}>
                      {String(remainingTime?.seconds || 0).padStart(2, '0')}
                    </Text>
                    <Text style={styles.timeUnit}>SEC</Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* PRE-PAYMENT OR RETURN NOTICE */
            <View style={styles.infoNoticeBox}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.infoNoticeText}>
                {item.status === 'slot_booked'
                  ? (isOwner
                      ? 'Renter booked a slot! Meet renter and enter their Pickup OTP to proceed.'
                      : 'Ride accepted! Coordinate pickup below. Timer starts only after payment.')
                  : item.status === 'payment_pending'
                  ? (isOwner
                      ? `Pickup verified! Waiting for renter to pay ₹${item.total_price || item.rental_price || 0}.`
                      : 'Pickup verified! Complete payment to activate timer and unlock ride.')
                  : item.status === 'payment_failed'
                  ? (isOwner
                      ? 'Renter payment failed. Waiting for renter to retry payment.'
                      : 'Payment failed. Please retry payment to unlock ride.')
                  : (isOwner
                      ? 'Return initiated! Enter the Return OTP from renter to finish the booking.'
                      : 'Return initiated! Share Return OTP with owner to complete this rental.')}
              </Text>
            </View>
          )}

          {/* OWNER ACTIVE RIDE NOTICE */}
          {isOwner && item.status === 'active' && (
            <View style={styles.ownerActiveNotice}>
              <Ionicons name="bicycle-outline" size={16} color="#059669" />
              <Text style={styles.ownerActiveNoticeText}>
                Cycle is currently in ride with renter. You will be prompted to verify Return OTP once returned.
              </Text>
            </View>
          )}

          {/* RETURN REQUESTED SECTION */}
          {(item.status === 'return_requested' || item.status === 'return_pending' || (item.status as any) === 'return_accepted') && (
            <View style={styles.returnRequestedCard}>
              <View style={styles.returnRequestedHeader}>
                <Ionicons name="checkmark-done-circle-outline" size={20} color="#7C3AED" />
                <Text style={styles.returnRequestedTitle}>Return In Progress</Text>
              </View>
              <Text style={styles.returnRequestedDesc}>
                {isRenter
                  ? displayReturnOtp
                    ? `Your return OTP is ${displayReturnOtp}. Please share it with the cycle owner to complete return.`
                    : 'You have requested cycle return. Please meet the owner and provide the return OTP.'
                  : isAccepted
                  ? 'Return request accepted! Verify the cycle condition and enter Return OTP from renter to finish the booking.'
                  : 'Renter has submitted a return request. Please accept the return request to proceed with Return OTP verification.'}
              </Text>
              {!isRenter && (
                <View style={styles.returnOwnerActionsRow}>
                  {!isAccepted ? (
                    <TouchableOpacity
                      style={[styles.acceptReturnBtn, { flex: 1 }]}
                      onPress={() => handleAcceptReturnFromRental(item)}
                      disabled={processingAcceptId === item.id}
                      activeOpacity={0.8}
                    >
                      {processingAcceptId === item.id ? (
                        <ActivityIndicator size="small" color={colors.white} style={{ marginRight: 6 }} />
                      ) : (
                        <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                      )}
                      <Text style={styles.acceptReturnBtnText}>
                        {processingAcceptId === item.id ? 'Accepting...' : 'Accept Return'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <View style={styles.acceptedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.acceptedBadgeText}>Return Accepted</Text>
                      </View>

                      <TouchableOpacity
                        style={[styles.verifyReturnBtn, { flex: 1, marginTop: 0 }]}
                        onPress={() =>
                          navigation.navigate('OtpVerification', {
                            bookingId: item.id,
                            actionType: 'return_otp',
                          })
                        }
                        activeOpacity={0.8}
                      >
                        <Ionicons name="key" size={16} color={colors.white} />
                        <Text style={styles.verifyReturnBtnText}>Enter Return OTP</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          )}

          {/* OTP BANNER: Renter sees Pickup/Return OTP; Owner ONLY sees Pickup OTP (Return OTP is in returnRequestedCard) */}
          {(isRenter ? (item.status === 'slot_booked' || isReturnOtpState) : item.status === 'slot_booked') && (
            <View style={styles.otpCard}>
              <Text style={styles.otpLabel}>
                {isRenter
                  ? isReturnOtpState
                    ? 'Your return OTP is:'
                    : 'Share this Pickup OTP with Owner:'
                  : 'Renter will provide Pickup OTP'}
              </Text>
              {isRenter ? (
                <Text style={styles.otpCode} selectable>
                  {displayOtp || '••••••'}
                </Text>
              ) : (
                <TouchableOpacity
                  style={styles.verifyOtpBtn}
                  onPress={() =>
                    navigation.navigate('OtpVerification', {
                      bookingId: item.id,
                      actionType: 'pickup_otp',
                    })
                  }
                >
                  <Ionicons
                    name="key-outline"
                    size={16}
                    color={colors.white}
                  />
                  <Text style={styles.verifyOtpBtnText}>Enter Pickup OTP</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* PAY NOW BUTTON FOR RENTER IF PAYMENT PENDING OR FAILED */}
          {isRenter && (item.status === 'payment_pending' || item.status === 'payment_failed') && (
            <TouchableOpacity
              style={styles.payNowBtn}
              onPress={() => setCheckoutBooking(item)}
            >
              <Ionicons name="card-outline" size={18} color={colors.primary} />
              <Text style={styles.payNowBtnText}>Pay Now ₹{item.total_price || item.rental_price || 0}</Text>
            </TouchableOpacity>
          )}

          {/* RETURN BUTTON FOR RENTER IF ACTIVE */}
          {isRenter && item.status === 'active' && (
            <TouchableOpacity
              style={styles.returnBtn}
              onPress={() => navigation.navigate('Return', { bookingId: item.id })}
            >
              <Ionicons name="arrow-undo-outline" size={18} color={colors.white} />
              <Text style={styles.returnBtnText}>Return Cycle</Text>
            </TouchableOpacity>
          )}

          {/* CHAT AND CALL BUTTONS (Unlocked immediately once owner accepts!) */}
          {allowChatCall && (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.chatBtn}
                onPress={() => {
                  const convId = getConversationIdFromNotifications(item, notifications);
                  console.log(
                    `[OngoingRentalsScreen] 💬 Chat pressed for booking ${item.id}. Passing id (conversation_id): "${convId}" to Chat.`
                  );

                  navigation.navigate('Chat', {
                    id: convId || undefined,
                    conversationId: convId || undefined,
                    bookingId: item.id,
                    otherUserId: item.other_user_id || '',
                    otherUserName: item.other_user_name || item.owner_name || 'User',
                    isOwner: item.is_owner,
                    myRole: item.is_owner ? 'owner' : 'renter',
                    cycleName: `${item.brand || item.cycles?.brand || 'Cycle'} ${item.model || item.cycles?.model || ''}`.trim(),
                    cycleImage: (item as any).image || (item.images && item.images[0]) || '',
                    location: (item as any).location || item.cycles?.location || 'NITK Campus',
                    rentalStatus: item.status,
                    startTime: item.start_time || undefined,
                    endTime: item.end_time || undefined,
                    totalAmount: item.total_price || item.rental_price || 0,
                  });
                }}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                <Text style={styles.chatBtnText}>Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.callBtn}
                onPress={() =>
                  navigation.navigate('CallModal', {
                    targetUserId: item.other_user_id || '',
                    targetUserName: item.other_user_name || item.owner_name || 'User',
                    bookingId: item.id})
                }
              >
                <Ionicons name="call-outline" size={18} color={colors.accent} />
                <Text style={styles.callBtnText}>Call</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Report Button */}
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => handleOpenReport(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="warning-outline" size={15} color="#DC2626" />
            <Text style={styles.reportBtnText}>Report Issue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title="Ongoing Rentals"
        rightAction={{
          icon: 'refresh-outline',
          onPress: fetchOngoingRentals}}
      />

      <SwipeableScreenWrapper currentTab="rentals" disableSwipe={Boolean(reportingBooking || checkoutBooking)}>
        {/* Role Filter Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, selectedTab === 'all' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabButtonText, selectedTab === 'all' && styles.tabButtonTextActive]}>
              All ({rentals.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, selectedTab === 'renter' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('renter')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="bicycle-outline"
              size={14}
              color={selectedTab === 'renter' ? colors.white : colors.textSecondary}
            />
            <Text style={[styles.tabButtonText, selectedTab === 'renter' && styles.tabButtonTextActive]}>
              Renting ({renterCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, selectedTab === 'owner' && styles.tabButtonActive]}
            onPress={() => setSelectedTab('owner')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="key-outline"
              size={14}
              color={selectedTab === 'owner' ? colors.white : colors.textSecondary}
            />
            <Text style={[styles.tabButtonText, selectedTab === 'owner' && styles.tabButtonTextActive]}>
              My Cycles ({ownerCount})
            </Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Loading active rides...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRentals}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderRentalCard}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={selectedTab === 'owner' ? 'key-outline' : 'bicycle-outline'}
                  size={70}
                  color={colors.textLight}
                />
                <Text style={styles.emptyTitle}>
                  {selectedTab === 'owner'
                    ? 'No Active Cycle Rentals'
                    : selectedTab === 'renter'
                    ? 'No Active Rides'
                    : 'No Ongoing Rentals'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {selectedTab === 'owner'
                    ? 'When students book your cycles, active rentals and OTP verification requests will appear here.'
                    : selectedTab === 'renter'
                    ? 'When an owner accepts your booking request, your active ride will appear here!'
                    : 'Your active rides and rented cycles will appear here with live status and actions.'}
                </Text>
                {selectedTab !== 'owner' && (
                  <TouchableOpacity
                    style={styles.browseBtn}
                    onPress={() => navigation.navigate('Home')}
                  >
                    <Text style={styles.browseBtnText}>Browse Available Cycles</Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </SwipeableScreenWrapper>

      {/* Razorpay Checkout Modal */}
      {checkoutBooking && (
        <RazorpayCheckoutModal
          visible={Boolean(checkoutBooking)}
          bookingId={checkoutBooking.id}
          orderId={(checkoutBooking as any).order_id || (checkoutBooking as any).provider_order_id}
          paymentId={(checkoutBooking as any).payment_id || checkoutBooking.id}
          amount={checkoutBooking.total_price || 0}
          userEmail={user?.email}
          onSuccess={handlePaymentSuccess}
          onClose={() => setCheckoutBooking(null)}
          onDismiss={() => setCheckoutBooking(null)}
        />
      )}

      {/* Report Modal */}
      <Modal
        visible={Boolean(reportingBooking)}
        transparent
        animationType="slide"
        onRequestClose={() => setReportingBooking(null)}
      >
        <View style={styles.reportModalOverlay}>
          <View style={styles.reportModalCard}>
            <View style={styles.reportModalHeader}>
              <View>
                <Text style={styles.reportModalTag}>ADMIN SUPPORT</Text>
                <Text style={styles.reportModalTitle}>
                  Report {reportingBooking?.renter_id === user?.id ? 'Owner' : 'Renter'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setReportingBooking(null)}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.reportDesc}>
                Please provide details of the issue. Your report will be reviewed by the administration.
              </Text>

              {/* Cycle info */}
              <View style={styles.reportCycleInfo}>
                <Text style={styles.reportCycleName}>
                  🚲 {reportingBooking?.cycle_title || `${reportingBooking?.cycles?.brand || ''} ${reportingBooking?.cycles?.model || ''}`.trim() || 'Campus Cycle'}
                </Text>
                <Text style={styles.reportCycleLoc}>
                  📍 {reportingBooking?.cycle_location || reportingBooking?.cycles?.location || 'Campus'}
                </Text>
              </View>

              {/* Reason selection */}
              <Text style={styles.reportSectionTitle}>Reason for report *</Text>
              <View style={styles.reasonsGrid}>
                {REPORT_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[
                      styles.reasonChip,
                      reportReason === r && styles.reasonChipActive,
                    ]}
                    onPress={() => setReportReason(r)}
                  >
                    <Text
                      style={[
                        styles.reasonChipText,
                        reportReason === r && styles.reasonChipTextActive,
                      ]}
                    >
                      {r}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description textarea */}
              <Text style={styles.reportSectionTitle}>Describe the issue *</Text>
              <TextInput
                style={styles.reportTextInput}
                placeholder="Describe the issue in detail (up to 1000 characters)..."
                placeholderTextColor={colors.textLight}
                value={reportDescription}
                onChangeText={setReportDescription}
                multiline
                numberOfLines={4}
                maxLength={1000}
                textAlignVertical="top"
              />
              <Text style={styles.charCountText}>
                {reportDescription.length} / 1000 characters
              </Text>

              <TouchableOpacity
                style={[
                  styles.submitReportBtn,
                  (!reportReason || !reportDescription.trim()) && styles.btnDisabled,
                ]}
                onPress={handleSubmitReport}
                disabled={submittingReport || !reportReason || !reportDescription.trim()}
              >
                {submittingReport ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="send" size={16} color={colors.white} />
                    <Text style={styles.submitReportBtnText}>Submit Report</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RentalBottomNav activeTab="rentals" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.white,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: 90},
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md},
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm},
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6},
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4},
  statusTitle: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700'},
  roleTag: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '500'},
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  ownerBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.08)',
    borderColor: 'rgba(124, 58, 237, 0.25)',
  },
  renterBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
    borderColor: 'rgba(15, 23, 42, 0.15)',
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  ownerActiveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  ownerActiveNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    lineHeight: 16,
  },
  cardBody: {
    padding: spacing.md},
  cycleInfoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md},
  cycleThumb: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight},
  thumbWrapper: {
    position: 'relative',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  photoBadgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '700',
  },
  noThumb: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center'},
  cycleInfoText: {
    flex: 1},
  cycleTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary},
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  participantName: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary},
  participantHighlight: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  chargeSubtext: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  specsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.sm,
  },
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  specChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  descriptionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(10, 25, 47, 0.03)',
    borderRadius: borderRadius.sm,
    padding: spacing.xs + 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  descriptionText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 16,
    flex: 1,
  },
  timelineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  timelineCol: {
    flex: 1,
  },
  timelineDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  timelineLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textLight,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timelineValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  returnRequestedCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    marginBottom: spacing.md,
  },
  returnRequestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  returnRequestedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  returnRequestedDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  returnOwnerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  acceptReturnBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    gap: 6,
  },
  acceptReturnBtnText: {
    color: colors.white,
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
  },
  acceptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  acceptedBadgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  verifyReturnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    marginTop: 10,
    gap: 6,
  },
  verifyReturnBtnText: {
    color: colors.white,
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
  },
  fareText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.accent},
  timerBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
    marginBottom: spacing.md,
    alignItems: 'center'},
  timerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs},
  timerHeaderLabel: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.accent,
    textTransform: 'uppercase'},
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4},
  timeDigitBox: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    minWidth: 46,
    borderWidth: 1,
    borderColor: colors.borderLight},
  timeDigit: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary},
  timeUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textLight},
  timeColon: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textSecondary},
  expiredNotice: {
    alignItems: 'center',
    marginTop: 4},
  expiredText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.danger},
  graceText: {
    fontSize: typography.caption.fontSize,
    color: colors.warning,
    marginTop: 2},
  overdueText: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.danger,
    marginTop: 2},
  infoNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(10, 25, 47, 0.05)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md},
  infoNoticeText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18},
  otpCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight},
  otpLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: 6},
  otpCode: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 6,
    color: colors.primary},
  verifyOtpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6},
  verifyOtpBtnText: {
    color: colors.white,
    fontSize: typography.body2.fontSize,
    fontWeight: '700'},
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    gap: 6},
  payNowBtnText: {
    fontSize: typography.body1.fontSize,
    fontWeight: '800',
    color: colors.primary},
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    gap: 6},
  returnBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.white},
  returnVerifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
    gap: 6},
  returnVerifyBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.white},
  actionButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm},
  chatBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6},
  chatBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.primary},
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    gap: 6},
  callBtnText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.accent},
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
  browseBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: borderRadius.md},
  browseBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: typography.body2.fontSize,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 6,
    backgroundColor: '#FEF2F2',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  reportBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  reportModalCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  reportModalTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.6,
  },
  reportModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportDesc: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  reportCycleInfo: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reportCycleName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reportCycleLoc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  reportSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.xs,
  },
  reasonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  reasonChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonChipActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  reasonChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  reasonChipTextActive: {
    color: '#DC2626',
    fontWeight: '700',
  },
  reportTextInput: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    minHeight: 80,
  },
  charCountText: {
    fontSize: 11,
    color: colors.textLight,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: spacing.md,
  },
  submitReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    borderRadius: borderRadius.md,
    paddingVertical: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  submitReportBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
