import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Booking } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import RazorpayCheckoutModal from '../../components/RazorpayCheckoutModal';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function BookingHistoryScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, profile, refreshProfile } = useAuth();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'rented' | 'owned'>('all');

  // Withdrawal modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [accountHolder, setAccountHolder] = useState(profile?.full_name || '');
  const [withdrawing, setWithdrawing] = useState(false);

  // Dues payment state
  const [showDuesModal, setShowDuesModal] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('booking_table')
        .select(`
          *,
          cycles (
            id,
            brand,
            model,
            location
          )
        `)
        .or(`renter_id.eq.${user.id},owner_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      console.error('Error fetching booking history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const onRefresh = () => {
    setRefreshing(true);
    refreshProfile();
    fetchBookings();
  };

  const handleWithdraw = async () => {
    const amountNum = parseFloat(withdrawAmount);
    const balanceNum = Number(profile?.net_balance || 0);

    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid withdrawal amount.');
      return;
    }

    if (amountNum > balanceNum) {
      Alert.alert('Insufficient Balance', `You can withdraw up to ₹${balanceNum}.`);
      return;
    }

    if (!upiId.trim() || !upiId.includes('@')) {
      Alert.alert('Invalid UPI ID', 'Please enter a valid UPI address (e.g. name@okhdfcbank).');
      return;
    }

    setWithdrawing(true);
    try {
      const response = await fetch('https://ugonitk.app.n8n.cloud/webhook/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          amount: amountNum,
          upi_id: upiId.trim(),
          account_holder_name: accountHolder.trim()})});

      if (!response.ok) {
        throw new Error(`Withdrawal request failed with status ${response.status}`);
      }

      Alert.alert('Withdrawal Submitted! 💸', 'Your payout request is being processed to your UPI ID.');
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setUpiId('');
      refreshProfile();
    } catch (err: any) {
      Alert.alert('Withdrawal Error', err.message || 'Unable to process withdrawal request.');
    } finally {
      setWithdrawing(false);
    }
  };

  const handleCancelBooking = (bookingId: string) => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch('https://ugonitk.app.n8n.cloud/webhook/cancel-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ booking_id: bookingId, cancelled_by: user?.id })});

              if (!res.ok) throw new Error('Cancellation request failed');

              Alert.alert('Booking Cancelled', 'The booking has been successfully cancelled.');
              fetchBookings();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel booking.');
            }
          }},
      ]
    );
  };

  const filteredBookings = bookings.filter((b) => {
    if (activeFilter === 'rented') return b.renter_id === user?.id;
    if (activeFilter === 'owned') return b.owner_id === user?.id;
    return true;
  });

  const netBalance = Number(profile?.net_balance || 0);

  const renderBookingCard = ({ item }: { item: Booking }) => {
    const isRenter = item.renter_id === user?.id;
    const isCompleted = item.status === 'completed';
    const isCancelled = item.status === 'cancelled';
    const canCancel = item.status === 'slot_booked' || item.status === 'pending';

    return (
      <View style={styles.bookingCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.cycleInfo}>
            <Text style={styles.cycleTitle}>
              {item.cycles ? `${item.cycles.brand} ${item.cycles.model}` : 'Cycle'}
            </Text>
            <Text style={styles.dateText}>
              {new Date(item.created_at).toLocaleDateString([], {
                year: 'numeric',
                month: 'short',
                day: 'numeric'})}
            </Text>
          </View>

          <Badge
            variant={
              isCompleted
                ? 'success'
                : isCancelled
                ? 'danger'
                : item.status === 'active'
                ? 'primary'
                : 'neutral'
            }
            label={item.status.replace('_', ' ').toUpperCase()}
            size="sm"
          />
        </View>

        <View style={styles.cardDetailRow}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Role</Text>
            <Text style={styles.detailVal}>{isRenter ? 'Rented by You' : 'Your Cycle'}</Text>
          </View>

          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Duration</Text>
            <Text style={styles.detailVal}>{item.total_duration_hours || item.duration_hours || 1} hrs</Text>
          </View>

          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>Amount</Text>
            <Text style={[styles.detailVal, { color: isRenter ? colors.textPrimary : colors.accent }]}>
              {isRenter ? `₹${item.total_price || 0}` : `+₹${item.total_price || 0}`}
            </Text>
          </View>
        </View>

        {canCancel && isRenter && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => handleCancelBooking(item.id)}
          >
            <Text style={styles.cancelBtnText}>Cancel Booking Request</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="Wallet & Ride History" showBack />

      {/* Net Balance & Actions Card */}
      <View style={styles.balanceHeaderCard}>
        <View>
          <Text style={styles.headerBalanceLabel}>Net Balance</Text>
          <Text style={[styles.headerBalanceAmount, netBalance < 0 && styles.negativeText]}>
            {netBalance < 0 ? `-₹${Math.abs(netBalance)}` : `₹${netBalance}`}
          </Text>
        </View>

        {netBalance < 0 ? (
          <TouchableOpacity
            style={styles.payDuesBtn}
            onPress={() => setShowDuesModal(true)}
          >
            <Ionicons name="card-outline" size={16} color={colors.white} />
            <Text style={styles.payDuesBtnText}>Clear Dues</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.withdrawBtn}
            onPress={() => setShowWithdrawModal(true)}
          >
            <Ionicons name="arrow-up-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.withdrawBtnText}>Withdraw</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabsRow}>
        {(['all', 'rented', 'owned'] as const).map((filter) => (
          <TouchableOpacity
            key={filter}
            style={[styles.filterTab, activeFilter === filter && styles.filterTabActive]}
            onPress={() => setActiveFilter(filter)}
          >
            <Text
              style={[
                styles.filterTabText,
                activeFilter === filter && styles.filterTabTextActive,
              ]}
            >
              {filter === 'all' ? 'All Rides' : filter === 'rented' ? 'Rented by Me' : 'My Cycles'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading rental history...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredBookings}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderBookingCard}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={56} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No rides recorded</Text>
              <Text style={styles.emptySubtitle}>Completed and past rides will appear here.</Text>
            </View>
          }
        />
      )}

      {/* Withdrawal Modal */}
      <Modal
        visible={showWithdrawModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWithdrawModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Withdraw Earnings</Text>
              <TouchableOpacity onPress={() => setShowWithdrawModal(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalBalanceHint}>
              Available balance: <Text style={{ fontWeight: '700' }}>₹{netBalance}</Text>
            </Text>

            <Input
              label="Amount to Withdraw (₹)"
              placeholder={`Max ${netBalance}`}
              keyboardType="numeric"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />

            <Input
              label="UPI ID"
              placeholder="e.g. rollnumber@oksbi"
              value={upiId}
              onChangeText={setUpiId}
            />

            <Input
              label="Account Holder Name"
              placeholder="Name on bank account"
              value={accountHolder}
              onChangeText={setAccountHolder}
            />

            <Button
              title="Request Payout"
              onPress={handleWithdraw}
              loading={withdrawing}
              size="lg"
              variant="accent"
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>

      {/* Razorpay Dues Checkout Modal */}
      {showDuesModal && (
        <RazorpayCheckoutModal
          visible={showDuesModal}
          bookingId="dues-clearance"
          amount={Math.abs(netBalance)}
          userEmail={user?.email}
          onSuccess={() => {
            Alert.alert('Dues Cleared! ✅', 'Thank you. Your account is now in good standing.');
            setShowDuesModal(false);
            refreshProfile();
          }}
          onClose={() => setShowDuesModal(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  balanceHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    ...shadows.sm},
  headerBalanceLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'},
  headerBalanceAmount: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.accent,
    marginTop: 2},
  negativeText: {
    color: colors.danger},
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6},
  withdrawBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.body2.fontSize},
  payDuesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: borderRadius.md,
    gap: 6},
  payDuesBtnText: {
    color: colors.white,
    fontWeight: '800',
    fontSize: typography.body2.fontSize},
  filterTabsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm},
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight},
  filterTabActive: {
    backgroundColor: colors.primary},
  filterTabText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'},
  filterTabTextActive: {
    color: colors.white},
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl},
  bookingCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm},
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm},
  cycleInfo: {
    flex: 1},
  cycleTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary},
  dateText: {
    fontSize: typography.caption.fontSize,
    color: colors.textLight,
    marginTop: 2},
  cardDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.xs},
  detailCol: {
    alignItems: 'center'},
  detailLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2},
  detailVal: {
    fontSize: typography.caption.fontSize,
    fontWeight: '700',
    color: colors.textPrimary},
  cancelBtn: {
    marginTop: spacing.sm,
    alignItems: 'center',
    paddingVertical: 6},
  cancelBtnText: {
    fontSize: typography.caption.fontSize,
    color: colors.danger,
    fontWeight: '700'},
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
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md},
  emptySubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginTop: 4},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end'},
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl},
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm},
  modalTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary},
  modalBalanceHint: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md}});
