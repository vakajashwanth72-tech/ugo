import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../lib/theme';
import { apiClient } from '../lib/apiClient';
import { PaymentCoordinator } from '../lib/PaymentCoordinator';

export interface RazorpayCheckoutModalProps {
  visible: boolean;
  bookingId?: string;
  orderId?: string;
  paymentId?: string;
  amount: number;
  razorpayKey?: string;
  currency?: string;
  userEmail?: string;
  userName?: string;
  userContact?: string;
  onSuccess: (paymentId: string, orderId?: string, signature?: string) => void;
  onClose: () => void;
  onDismiss?: () => void;
  onFailure?: (error: any) => void;
}

const DEFAULT_RAZORPAY_KEY =
  process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TSslW485AyMVnu';

export default function RazorpayCheckoutModal({
  visible,
  bookingId,
  orderId,
  paymentId,
  amount,
  razorpayKey,
  currency = 'INR',
  userEmail = 'student@nitk.edu.in',
  userName = 'NITK Student',
  userContact = '9876543210',
  onSuccess,
  onClose,
  onDismiss,
  onFailure,
}: RazorpayCheckoutModalProps) {
  const [cancelling, setCancelling] = useState(false);

  if (!visible) return null;

  const activeKey = razorpayKey || DEFAULT_RAZORPAY_KEY;

  // Handle amount: Razorpay expects integer amount in paise (1 INR = 100 paise)
  const rawNum = Number(amount) || 0;
  const isLikelyPaise = rawNum >= 1000 && Number.isInteger(rawNum);
  const amountInPaise = isLikelyPaise ? rawNum : Math.round(rawNum * 100);
  const displayRupees = (amountInPaise / 100).toFixed(2).replace(/\.00$/, '');

  console.log(
    `[RazorpayCheckoutModal] Opening Checkout: PaymentID=${paymentId || 'none'}, OrderID=${orderId || 'none'}, Amount=₹${displayRupees} (${amountInPaise} paise), Key=${activeKey}`
  );

  const executeCancelPayment = async () => {
    const targetPaymentId = paymentId || orderId || '';
    console.log(`[RazorpayCheckoutModal] User confirmed payment cancellation for payment_id: ${targetPaymentId}`);
    setCancelling(true);

    try {
      // Mark as cancelled locally to immediately stop any re-triggering
      PaymentCoordinator.markPaymentCancelled(targetPaymentId);
      if (paymentId) PaymentCoordinator.markPaymentCancelled(paymentId);
      if (orderId) PaymentCoordinator.markPaymentCancelled(orderId);

      if (targetPaymentId) {
        console.log(`[RazorpayCheckoutModal] Calling apiClient.cancelPayment with payment_id: ${targetPaymentId}...`);
        await apiClient.cancelPayment(targetPaymentId);
        console.log('[RazorpayCheckoutModal] Payment successfully marked cancelled on backend.');
      }

      if (onDismiss) onDismiss();
      else onClose();
    } catch (err: any) {
      console.warn('[RazorpayCheckoutModal] Backend cancel-payment note:', err?.message || err);
      // Close modal and release lock even if backend was unreachable
      if (onDismiss) onDismiss();
      else onClose();
    } finally {
      setCancelling(false);
    }
  };

  const confirmAndCancelPayment = () => {
    if (cancelling) return;

    Alert.alert(
      'Cancel Payment?',
      'Are you sure you want to cancel the payment? If you cancel, the pending ride payment will be cancelled and will not reopen.',
      [
        {
          text: 'No, Keep Paying',
          style: 'cancel',
          onPress: () => {
            console.log('[RazorpayCheckoutModal] User chose to continue with payment.');
          },
        },
        {
          text: 'Yes, Cancel Payment',
          style: 'destructive',
          onPress: executeCancelPayment,
        },
      ]
    );
  };

  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <style>
        body {
          background: #0A192F;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #fff;
          text-align: center;
        }
        .box { padding: 24px; }
        .spinner {
          width: 44px; height: 44px; border: 4px solid rgba(255,255,255,0.2);
          border-top-color: #10B981; border-radius: 50%;
          animation: spin 1s linear infinite; margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h3 { font-size: 18px; margin: 0 0 8px; font-weight: 600; color: #FFFFFF; }
        p { color: #94A3B8; font-size: 14px; margin: 0; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="spinner"></div>
        <h3>UgO Secure Checkout</h3>
        <p>Connecting to Razorpay payment gateway...</p>
        <p style="color: #10B981; font-weight: 600; margin-top: 8px; font-size: 16px;">₹${displayRupees}</p>
      </div>
      <script>
        var options = {
          key: '${activeKey}',
          ${amountInPaise > 0 ? `amount: ${amountInPaise},` : orderId ? '' : 'amount: 100,'}
          currency: '${currency}',
          name: 'UgO NITK',
          description: 'Cycle Rental Payment',
          ${orderId ? `order_id: '${orderId}',` : ''}
          payment_capture: 1,
          prefill: {
            name: '${userName}',
            email: '${userEmail}',
            contact: '${userContact}'
          },
          theme: {
            color: '#0A192F'
          },
          handler: function (response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              event: 'PAYMENT_SUCCESS',
              paymentId: response.razorpay_payment_id,
              orderId: response.razorpay_order_id,
              signature: response.razorpay_signature
            }));
          },
          modal: {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                event: 'DISMISSED'
              }));
            }
          }
        };

        try {
          var rzp = new Razorpay(options);
          rzp.on('payment.failed', function (response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              event: 'PAYMENT_FAILED',
              error: response.error
            }));
          });
          rzp.open();
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            event: 'PAYMENT_FAILED',
            error: { description: e.message || 'Failed to initialize Razorpay' }
          }));
        }
      </script>
    </body>
  </html>`;

  const handleMessage = async (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      console.log('[RazorpayCheckoutModal] 📡 Event from WebView bridge:', payload.event);

      if (payload.event === 'PAYMENT_SUCCESS') {
        const resPaymentId = payload.paymentId || `pay_${Date.now()}`;
        const razorpayOrderId = payload.orderId || orderId;
        const signature = payload.signature;

        console.log(
          `[RazorpayCheckoutModal] ✅ PAYMENT_SUCCESS received directly from Razorpay: PaymentID=${resPaymentId}, OrderID=${razorpayOrderId}`
        );

        // Mark completed in coordinator so future notification polls immediately suppress this payment.
        // Strictly DO NOT call backend for verification: backend verifies independently via Razorpay webhooks
        // and automatically stops sending payment_pending notifications.
        PaymentCoordinator.markPaymentCompleted(resPaymentId);
        if (razorpayOrderId) PaymentCoordinator.markPaymentCompleted(razorpayOrderId);
        if (paymentId) PaymentCoordinator.markPaymentCompleted(paymentId);
        if (orderId) PaymentCoordinator.markPaymentCompleted(orderId);

        onSuccess(resPaymentId, razorpayOrderId, signature);
      } else if (payload.event === 'DISMISSED') {
        console.log('[RazorpayCheckoutModal] ⚠️ User dismissed/cancelled Razorpay modal.');
        confirmAndCancelPayment();
      } else if (payload.event === 'PAYMENT_FAILED') {
        console.error('[RazorpayCheckoutModal] ❌ PAYMENT_FAILED reported by Razorpay:', payload.error);
        if (onFailure) {
          onFailure(payload.error);
        } else {
          confirmAndCancelPayment();
        }
      } else {
        confirmAndCancelPayment();
      }
    } catch (err) {
      console.error('[RazorpayCheckoutModal] Bridge message parse error:', err);
      confirmAndCancelPayment();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={confirmAndCancelPayment}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>UgO Secure Checkout</Text>
            <Text style={styles.headerSub}>Amount: ₹{displayRupees}</Text>
          </View>
          <TouchableOpacity
            onPress={confirmAndCancelPayment}
            style={styles.cancelBtn}
            disabled={cancelling}
          >
            <Ionicons name="close-circle-outline" size={20} color="#EF4444" style={{ marginRight: 4 }} />
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <WebView
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={handleMessage}
          style={styles.webview}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={colors.accent} size="large" />
            </View>
          )}
        />

        {cancelling && (
          <View style={styles.cancellingOverlay}>
            <ActivityIndicator size="large" color="#EF4444" />
            <Text style={styles.cancellingText}>Cancelling payment on server...</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.white,
  },
  headerSub: {
    fontSize: typography.caption.fontSize,
    color: colors.accent,
    marginTop: 2,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  cancelBtnText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  webview: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancellingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(10, 25, 47, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  cancellingText: {
    marginTop: 12,
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
