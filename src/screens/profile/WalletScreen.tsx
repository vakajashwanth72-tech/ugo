import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import {
  apiClient,
  WalletHistoryItem,
  extractWalletBalance,
  extractWalletHistory,
} from '../../lib/apiClient';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import RazorpayCheckoutModal from '../../components/RazorpayCheckoutModal';
import { RootStackParamList } from '../../navigation/navigationTypes';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const getWithdrawalStorageKey = (userId?: string) => `@ugo_withdrawals_${userId || 'guest'}`;

export default function WalletScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { user, profile } = useAuth();

  const [walletBalance, setWalletBalance] = useState<number>(Number(profile?.net_balance || 0));
  const [walletHistory, setWalletHistory] = useState<WalletHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Guards to ensure requests are made strictly once when triggered
  const isFetchingRef = React.useRef(false);
  const hasLoadedRef = React.useRef(false);
  const isWithdrawingRef = React.useRef(false);

  // Withdrawal modal state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [accountHolder, setAccountHolder] = useState(profile?.full_name || '');
  const [withdrawing, setWithdrawing] = useState(false);

  // Dues payment modal state
  const [showDuesModal, setShowDuesModal] = useState(false);

  // Sync walletBalance with profile?.net_balance if initially available
  useEffect(() => {
    if (profile?.net_balance !== undefined && profile?.net_balance !== null) {
      setWalletBalance((prev) => (prev === 0 ? Number(profile.net_balance) : prev));
    }
  }, [profile?.net_balance]);

  // Load wallet data (balance & history) from backend GET /api/profile/wallet
  // Ensures only 1 request is in flight at any time, preventing duplicate or unneeded calls
  const loadWalletData = useCallback(async (forceRefresh = false) => {
    // If not a forced refresh and already loaded once, do not make unnecessary calls
    if (!forceRefresh && hasLoadedRef.current) {
      return;
    }

    // Prevent concurrent duplicate requests
    if (isFetchingRef.current) {
      console.log('[WalletScreen] Wallet data request already in flight, skipping duplicate call.');
      return;
    }

    isFetchingRef.current = true;
    if (forceRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    // Read cached local items first if available for fast visual feedback
    if (user?.id) {
      try {
        const key = getWithdrawalStorageKey(user.id);
        const raw = await AsyncStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWalletHistory(parsed);
          }
        }
      } catch (err) {
        console.warn('[WalletScreen] Error reading cached withdrawals:', err);
      }
    }

    try {
      console.log('[WalletScreen] Fetching wallet data from GET /api/profile/wallet (single call)...');
      const res = await apiClient.getWalletData();
      console.log('[WalletScreen] Received wallet data response:', res);

      // Extract live wallet balance from backend response
      const liveBalance = extractWalletBalance(res, Number(profile?.net_balance || 0));
      setWalletBalance(liveBalance);

      // Extract live wallet history from backend response
      const liveHistory = extractWalletHistory(res);
      if (liveHistory.length > 0) {
        setWalletHistory(liveHistory);
        if (user?.id) {
          AsyncStorage.setItem(getWithdrawalStorageKey(user.id), JSON.stringify(liveHistory)).catch(() => {});
        }
      }
      hasLoadedRef.current = true;
    } catch (err: any) {
      console.warn('[WalletScreen] Error fetching wallet data from API:', err?.message || err);
      if (profile?.net_balance !== undefined && profile?.net_balance !== null) {
        setWalletBalance(Number(profile.net_balance));
      }
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, profile?.net_balance]);

  // When user navigates into WalletScreen, fetch once only
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) {
        loadWalletData(false);
      }
    }, [loadWalletData])
  );

  // Manual pull-to-refresh: exactly one call on explicit user pull
  const onRefresh = () => {
    loadWalletData(true);
  };

  const handleOpenWithdrawModal = () => {
    if (walletBalance <= 0) {
      Alert.alert(
        'Zero Available Balance',
        'You do not have any withdrawable balance in your UgO wallet at this time.'
      );
      return;
    }
    setWithdrawAmount('');
    setUpiId('');
    setAccountHolder(profile?.full_name || '');
    setShowWithdrawModal(true);
  };

  // Submits payout request strictly ONCE per press
  const handleWithdraw = async () => {
    // Prevent multiple rapid clicks or duplicate submissions
    if (isWithdrawingRef.current || withdrawing) {
      console.log('[WalletScreen] Withdrawal submission already in progress, ignoring duplicate press.');
      return;
    }

    const amountNum = parseFloat(withdrawAmount);
    const balanceNum = walletBalance;

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

    if (!accountHolder.trim()) {
      Alert.alert('Account Holder Required', 'Please enter the name on your bank account.');
      return;
    }

    isWithdrawingRef.current = true;
    setWithdrawing(true);

    try {
      console.log(`[WalletScreen] Dispatching single withdrawal request for ₹${amountNum}...`);
      const response = await apiClient.requestWithdrawal({
        withdraw_amount: amountNum,
        upi_id: upiId.trim(),
        account_holder_name: accountHolder.trim(),
      });
      console.log('[WalletScreen] Withdrawal response:', response);

      // Save to local withdrawal history for immediate UI update
      const newRecord: WalletHistoryItem = {
        id: `wd-${Date.now()}`,
        amount: amountNum,
        upi_id: upiId.trim(),
        account_holder_name: accountHolder.trim(),
        status: 'pending',
        type: 'withdrawal',
        created_at: new Date().toISOString(),
      };

      const updated = [newRecord, ...walletHistory];
      setWalletHistory(updated);
      if (user?.id) {
        await AsyncStorage.setItem(getWithdrawalStorageKey(user.id), JSON.stringify(updated));
      }

      // Decrement the local balance immediately for instant visual feedback
      setWalletBalance((prev) => Math.max(0, prev - amountNum));

      const successMsg =
        response?.message ||
        response?.data?.message ||
        'Your payout request has been submitted and is being processed to your UPI address.';

      Alert.alert('Withdrawal Submitted! 💸', successMsg);
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      setUpiId('');

      // Refresh live server state once
      loadWalletData(true);
    } catch (err: any) {
      console.error('[WalletScreen] Withdrawal error:', err);
      Alert.alert(
        'Withdrawal Error',
        err?.data?.message || err?.message || 'Unable to process withdrawal request. Please check your connection and try again.'
      );
    } finally {
      isWithdrawingRef.current = false;
      setWithdrawing(false);
    }
  };

  const handleDuesPaymentSuccess = async () => {
    Alert.alert('Dues Cleared! 🎉', 'Your outstanding balance has been cleared successfully.');
    setShowDuesModal(false);
    loadWalletData(true);
  };

  const renderWithdrawalItem = ({ item }: { item: WalletHistoryItem }) => {
    const formattedDate = new Date(item.created_at).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isCredit = item.type === 'credit' || item.type === 'deposit';
    const isPending = item.status === 'pending' || item.status === 'processing';
    const isRejected = item.status === 'rejected' || item.status === 'failed';
    const statusBg = isPending ? '#FEF3C7' : isRejected ? '#FEE2E2' : '#ECFDF5';
    const statusColor = isPending ? '#D97706' : isRejected ? '#DC2626' : '#059669';

    return (
      <View style={styles.historyCard}>
        <View style={styles.historyRowTop}>
          <View style={styles.historyAmountBox}>
            <Ionicons
              name={isCredit ? 'arrow-down-circle' : 'arrow-up-circle'}
              size={20}
              color={isCredit ? '#059669' : '#D97706'}
            />
            <Text style={styles.historyAmountText}>
              {isCredit ? `+₹${item.amount}` : `₹${item.amount}`}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Text style={[styles.statusBadgeText, { color: statusColor }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.historyDetails}>
          {item.description ? (
            <View style={styles.detailRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.detailText} numberOfLines={2}>
                {item.description}
              </Text>
            </View>
          ) : null}
          {item.upi_id ? (
            <View style={styles.detailRow}>
              <Ionicons name="card-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.detailText} numberOfLines={1}>
                UPI: <Text style={styles.detailHighlight}>{item.upi_id}</Text>
              </Text>
            </View>
          ) : null}
          {item.account_holder_name ? (
            <View style={styles.detailRow}>
              <Ionicons name="person-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.detailText} numberOfLines={1}>
                A/C Name: <Text style={styles.detailHighlight}>{item.account_holder_name}</Text>
              </Text>
            </View>
          ) : null}
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={14} color={colors.textLight} />
            <Text style={styles.dateText}>Requested: {formattedDate}</Text>
          </View>
          {item.responded_at ? (
            <View style={styles.detailRow}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.textLight} />
              <Text style={styles.dateText}>
                Responded:{' '}
                {new Date(item.responded_at).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="UgO Wallet" showBack />

      {/* Main Content */}
      <FlatList
        data={walletHistory}
        keyExtractor={(item) => item.id}
        renderItem={renderWithdrawalItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Net Balance & Action Card */}
            <View style={[styles.balanceCard, walletBalance < 0 && styles.balanceCardNegative]}>
              <View style={styles.balanceHeaderRow}>
                <View>
                  <Text style={styles.balanceLabel}>TOTAL AVAILABLE BALANCE</Text>
                  <Text style={[styles.balanceAmount, walletBalance < 0 && styles.negativeText]}>
                    {walletBalance < 0 ? `-₹${Math.abs(walletBalance)}` : `₹${walletBalance}`}
                  </Text>
                  <Text style={styles.balanceSubtext}>
                    {walletBalance < 0
                      ? 'Outstanding dues from overdue rides.'
                      : 'Available for instant withdrawal to your bank account.'}
                  </Text>
                </View>

                <View style={styles.walletIconCircle}>
                  <Ionicons
                    name={walletBalance < 0 ? 'alert-circle' : 'wallet'}
                    size={28}
                    color={walletBalance < 0 ? '#DC2626' : colors.primary}
                  />
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.cardActionsRow}>
                {walletBalance < 0 ? (
                  <TouchableOpacity
                    style={styles.clearDuesBtn}
                    onPress={() => setShowDuesModal(true)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="card-outline" size={18} color={colors.white} />
                    <Text style={styles.clearDuesBtnText}>Clear Outstanding Dues</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.withdrawBtn}
                    onPress={handleOpenWithdrawModal}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-up-circle-outline" size={20} color={colors.white} />
                    <Text style={styles.withdrawBtnText}>Withdraw Earnings</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Wallet History Section Title */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="receipt-outline" size={18} color={colors.textPrimary} />
                <Text style={styles.sectionTitle}>Wallet & Payout History</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{walletHistory.length}</Text>
              </View>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading wallet details...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="wallet-outline" size={44} color={colors.textLight} />
              </View>
              <Text style={styles.emptyTitle}>No Wallet History</Text>
              <Text style={styles.emptySubtitle}>
                Withdrawals and transaction history will appear here.
              </Text>
            </View>
          )
        }
      />

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
              <View>
                <Text style={styles.modalTag}>INSTANT PAYOUT</Text>
                <Text style={styles.modalTitle}>Withdraw Earnings</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setShowWithdrawModal(false)}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBalanceBox}>
              <Ionicons name="wallet-outline" size={16} color={colors.primary} />
              <Text style={styles.modalBalanceHint}>
                Withdrawable balance: <Text style={{ fontWeight: '700', color: colors.primary }}>₹{walletBalance}</Text>
              </Text>
            </View>

            <Input
              label="Amount to Withdraw (₹) *"
              placeholder={`Max ₹${walletBalance}`}
              keyboardType="numeric"
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
            />

            <Input
              label="UPI ID *"
              placeholder="e.g. username@okhdfcbank"
              autoCapitalize="none"
              value={upiId}
              onChangeText={setUpiId}
            />

            <Input
              label="Account Holder Name *"
              placeholder="Full name as per bank account"
              value={accountHolder}
              onChangeText={setAccountHolder}
            />

            <Button
              title="Request Payout"
              onPress={handleWithdraw}
              loading={withdrawing}
              disabled={withdrawing}
              size="lg"
              variant="primary"
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
          amount={Math.abs(walletBalance)}
          userEmail={user?.email}
          userName={profile?.full_name || 'UgO Rider'}
          userContact={profile?.phone || ''}
          onSuccess={handleDuesPaymentSuccess}
          onClose={() => setShowDuesModal(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContainer: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  balanceCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  balanceCardNegative: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  negativeText: {
    color: '#DC2626',
  },
  balanceSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    maxWidth: 240,
  },
  walletIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardActionsRow: {
    marginTop: spacing.xs,
  },
  withdrawBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 8,
    ...shadows.sm,
  },
  withdrawBtnText: {
    color: colors.white,
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
  },
  clearDuesBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    gap: 8,
    ...shadows.sm,
  },
  clearDuesBtnText: {
    color: colors.white,
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  historyCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  historyRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  historyAmountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyAmountText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historyDetails: {
    gap: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  detailHighlight: {
    fontWeight: '600',
    color: colors.textPrimary,
  },
  dateText: {
    fontSize: 11,
    color: colors.textLight,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  modalTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  modalBalanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    gap: 6,
    marginBottom: spacing.md,
  },
  modalBalanceHint: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
