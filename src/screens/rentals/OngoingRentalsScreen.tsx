import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  ONGOING_STATUSES,
  canChatOrCall,
  isTimerRunning,
  getStatusMeta,
  calculateRemainingTime,
  calculateExtraCharges} from '../../lib/bookingStatus';
import { Booking } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import RentalBottomNav from '../../components/RentalBottomNav';
import { getCycleImageUrl } from '../../lib/cycleUtils';
import RazorpayCheckoutModal from '../../components/RazorpayCheckoutModal';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

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
  const { user } = useAuth();

  const [rentals, setRentals] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Razorpay payment modal state
  const [checkoutBooking, setCheckoutBooking] = useState<Booking | null>(null);

  // Report modal state
  const [reportingBooking, setReportingBooking] = useState<Booking | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

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

    const isRenter = reportingBooking.renter_id === user.id;
    const targetUserId = isRenter ? reportingBooking.owner_id : reportingBooking.renter_id;
    const normalizedRole = isRenter ? 'user' : 'owner';

    if (!targetUserId) {
      Alert.alert('Error', 'Unable to identify the user you are reporting.');
      return;
    }

    setSubmittingReport(true);
    try {
      const reportData = {
        reported_by: user.id,
        reported_user_id: targetUserId,
        cycle_id: reportingBooking.cycle_id || null,
        booking_id: reportingBooking.id || null,
        reporter_role: normalizedRole,
        reason: reportReason.trim(),
        description: reportDescription.trim(),
        status: 'pending',
        admin_note: null,
        resolved_by: null,
      };

      const { error } = await supabase.from('reports').insert(reportData);
      if (error) throw error;

      Alert.alert(
        'Report Submitted',
        'Report submitted successfully. The campus administration will review it promptly.'
      );
      setReportingBooking(null);
    } catch (err: any) {
      Alert.alert('Submission Error', err.message || 'Unable to submit the report.');
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
      // Fetch bookings where user is renter or owner, and status is one of ONGOING_STATUSES
      const { data: bookingsData, error: bookingErr } = await supabase
        .from('booking_table')
        .select(`
          *,
          cycles (
            id,
            brand,
            model,
            location,
            price_per_hour,
            price_per_day
          )
        `)
        .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`)
        .in('status', ONGOING_STATUSES)
        .order('created_at', { ascending: false });

      if (bookingErr) throw bookingErr;

      const bookings = bookingsData || [];
      if (!bookings.length) {
        setRentals([]);
        return;
      }

      // Fetch other participant profiles and cycle images
      const participantIds = Array.from(
        new Set(bookings.flatMap((b) => [b.renter_id, b.owner_id]).filter(Boolean))
      );
      const cycleIds = Array.from(new Set(bookings.map((b) => b.cycle_id).filter(Boolean)));

      const [profilesRes, imagesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email').in('id', participantIds),
        supabase
          .from('cycle_images')
          .select('cycle_id, image_url, storage_path, display_order')
          .in('cycle_id', cycleIds),
      ]);

      const profileMap = new Map<string, any>();
      (profilesRes.data || []).forEach((p: any) => profileMap.set(p.id, p));

      const imageMap = new Map<string, string>();
      (imagesRes.data || []).forEach((img: any) => {
        if (!imageMap.has(img.cycle_id)) {
          const resolved = getCycleImageUrl(img);
          if (resolved) {
            imageMap.set(img.cycle_id, resolved);
          }
        }
      });

      const enriched: Booking[] = bookings.map((b: any) => {
        const isRenter = b.renter_id === user.id;
        const otherId = isRenter ? b.owner_id : b.renter_id;
        const otherProfile = profileMap.get(otherId);

        return {
          ...b,
          cycle_title: b.cycles ? `${b.cycles.brand} ${b.cycles.model}` : 'Cycle',
          cycle_image: imageMap.get(b.cycle_id) || null,
          cycle_location: b.cycles?.location || 'Campus',
          other_user_name: otherProfile?.full_name || otherProfile?.email?.split('@')[0] || (isRenter ? 'Cycle Owner' : 'Renter'),
          other_user_id: otherId,
        };
      });

      setRentals(enriched);
    } catch (err) {
      console.error('Error fetching ongoing rentals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOngoingRentals();

    if (!user) return;

    // Realtime listener on booking_table for instant UI sync
    const channelId = `user-ongoing-rentals-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_table' },
        () => {
          fetchOngoingRentals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOngoingRentals, user]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOngoingRentals();
  };

  const handlePaymentSuccess = async (paymentId: string) => {
    Alert.alert('Payment Successful! 🚴', 'Your rental is now active. Have a safe ride!');
    setCheckoutBooking(null);
    fetchOngoingRentals();
  };

  const renderRentalCard = ({ item }: { item: Booking }) => {
    const isRenter = item.renter_id === user?.id;
    const statusMeta = getStatusMeta(item.status);
    const allowChatCall = canChatOrCall(item.status);
    const timerRunning = isTimerRunning(item.status);

    // Duration & countdown calculation
    const durationHours = Number(item.total_duration_hours || item.duration_hours || 1);
    const remainingTime = timerRunning ? calculateRemainingTime(item.start_time, durationHours) : null;
    const extraCharges = timerRunning ? calculateExtraCharges(item.start_time, durationHours) : { minutesOverdue: 0, extraCharges: 0, isGracePeriod: false };

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
          <Text style={styles.roleTag}>{isRenter ? 'You are Renting' : 'Your Cycle'}</Text>
        </View>

        {/* Content Body */}
        <View style={styles.cardBody}>
          <View style={styles.cycleInfoRow}>
            {item.cycle_image ? (
              <Image source={{ uri: item.cycle_image }} style={styles.cycleThumb} />
            ) : (
              <View style={styles.noThumb}>
                <Ionicons name="bicycle-outline" size={28} color={colors.textLight} />
              </View>
            )}

            <View style={styles.cycleInfoText}>
              <Text style={styles.cycleTitle} numberOfLines={1}>
                {item.cycle_title}
              </Text>
              <Text style={styles.participantName}>
                {isRenter ? 'Owner' : 'Renter'}: <Text style={{ fontWeight: '700' }}>{item.other_user_name}</Text>
              </Text>
              <Text style={styles.fareText}>Total: ₹{item.total_price || 0}</Text>
            </View>
          </View>

          {/* TIMER SECTION (Only active if payment is complete!) */}
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
                  ? 'Ride accepted! Coordinate pickup below. Timer starts only after payment.'
                  : item.status === 'payment_pending'
                  ? 'Pickup verified! Complete payment to activate timer and unlock ride.'
                  : 'Return initiated! Verify Return OTP to complete this rental.'}
              </Text>
            </View>
          )}

          {/* OTP BANNER: Renter ONLY sees OTP code, Owner ONLY sees Enter OTP button */}
          {(item.status === 'slot_booked' || item.status === 'return_pending') && (
            <View style={styles.otpCard}>
              <Text style={styles.otpLabel}>
                {isRenter
                  ? item.status === 'return_pending'
                    ? 'Share this Return OTP with Owner:'
                    : 'Share this Pickup OTP with Owner:'
                  : item.status === 'return_pending'
                  ? 'Renter will provide Return OTP'
                  : 'Renter will provide Pickup OTP'}
              </Text>
              {isRenter ? (
                <Text style={styles.otpCode}>
                  {(item.status === 'return_pending' ? item.return_otp : item.otp_code) || '••••••'}
                </Text>
              ) : (
                <TouchableOpacity
                  style={styles.verifyOtpBtn}
                  onPress={() =>
                    navigation.navigate('OtpVerification', {
                      bookingId: item.id,
                      actionType: item.status === 'return_pending' ? 'return_otp' : 'pickup_otp',
                    })
                  }
                >
                  <Ionicons
                    name={item.status === 'return_pending' ? 'checkmark-done-circle-outline' : 'key-outline'}
                    size={16}
                    color={colors.white}
                  />
                  <Text style={styles.verifyOtpBtnText}>
                    {item.status === 'return_pending' ? 'Enter Return OTP' : 'Enter Pickup OTP'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* PAY NOW BUTTON FOR RENTER IF PAYMENT PENDING */}
          {isRenter && item.status === 'payment_pending' && (
            <TouchableOpacity
              style={styles.payNowBtn}
              onPress={() => setCheckoutBooking(item)}
            >
              <Ionicons name="card-outline" size={18} color={colors.primary} />
              <Text style={styles.payNowBtnText}>Pay Now ₹{item.total_price || 0}</Text>
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
                onPress={() =>
                  navigation.navigate('Chat', {
                    bookingId: item.id,
                    otherUserId: item.other_user_id || '',
                    otherUserName: item.other_user_name || 'User'})
                }
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
                <Text style={styles.chatBtnText}>Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.callBtn}
                onPress={() =>
                  navigation.navigate('CallModal', {
                    targetUserId: item.other_user_id || '',
                    targetUserName: item.other_user_name || 'User',
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

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading active rides...</Text>
        </View>
      ) : (
        <FlatList
          data={rentals}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderRentalCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="bicycle-outline" size={70} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Ongoing Rentals</Text>
              <Text style={styles.emptySubtitle}>
                When an owner accepts your booking request, it will appear here immediately with chat and call unlocked!
              </Text>
              <TouchableOpacity
                style={styles.browseBtn}
                onPress={() => navigation.navigate('Home')}
              >
                <Text style={styles.browseBtnText}>Browse Available Cycles</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Razorpay Checkout Modal */}
      {checkoutBooking && (
        <RazorpayCheckoutModal
          visible={Boolean(checkoutBooking)}
          bookingId={checkoutBooking.id}
          amount={checkoutBooking.total_price || 0}
          userEmail={user?.email}
          onSuccess={handlePaymentSuccess}
          onClose={() => setCheckoutBooking(null)}
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
                  🚲 {reportingBooking?.cycles?.brand} {reportingBooking?.cycles?.model}
                </Text>
                <Text style={styles.reportCycleLoc}>
                  📍 {reportingBooking?.cycles?.location || 'Campus'}
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
  participantName: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2},
  fareText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 2},
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
