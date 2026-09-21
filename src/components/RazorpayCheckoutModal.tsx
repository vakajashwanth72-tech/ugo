import { SafeAreaView } from 'react-native-safe-area-context';
import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../lib/theme';
import { supabase } from '../lib/supabase';

export interface RazorpayCheckoutModalProps {
  visible: boolean;
  bookingId: string;
  amount: number;
  userEmail?: string;
  onSuccess: (paymentId: string) => void;
  onClose: () => void;
}

const RAZORPAY_KEY =
  process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TSslW485AyMVnu';

export default function RazorpayCheckoutModal({
  visible,
  bookingId,
  amount,
  userEmail = 'student@nitk.edu.in',
  onSuccess,
  onClose}: RazorpayCheckoutModalProps) {
  if (!visible) return null;

  const amountInPaise = Math.round(amount * 100);

  const htmlContent = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        .box { padding: 20px; }
        .spinner {
          width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.2);
          border-top-color: #10B981; border-radius: 50%;
          animation: spin 1s linear infinite; margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="spinner"></div>
        <h3>Opening Razorpay Secure Checkout...</h3>
        <p style="color: #94A3B8; font-size: 14px;">Amount: ₹${amount}</p>
      </div>
      <script>
        var options = {
          key: '${RAZORPAY_KEY}',
          amount: ${amountInPaise},
          currency: 'INR',
          name: 'UgO NITK',
          description: 'Cycle Rental Payment',
          prefill: {
            email: '${userEmail}',
            contact: '9876543210'
          },
          theme: {
            color: '#0A192F'
          },
          handler: function (response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              event: 'PAYMENT_SUCCESS',
              paymentId: response.razorpay_payment_id
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
        var rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            event: 'PAYMENT_FAILED',
            error: response.error
          }));
        });
        rzp.open();
      </script>
    </body>
  </html>`;

  const handleMessage = async (event: any) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload.event === 'PAYMENT_SUCCESS') {
        const paymentId = payload.paymentId || `pay_${Date.now()}`;

        // If this was an actual booking payment (not dues), update booking in Supabase
        if (bookingId && bookingId !== 'dues-clearance') {
          await supabase
            .from('booking_table')
            .update({
              status: 'active',
              start_time: new Date().toISOString(),
              payment_id: paymentId})
            .eq('id', bookingId);
        }

        onSuccess(paymentId);
      } else {
        onClose();
      }
    } catch (err) {
      console.error('Payment bridge parse error:', err);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>UgO Secure Checkout</Text>
            <Text style={styles.headerSub}>Amount: ₹{amount}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.white} />
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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)'},
  headerTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.white},
  headerSub: {
    fontSize: typography.caption.fontSize,
    color: colors.accent,
    marginTop: 2},
  closeBtn: {
    padding: 6},
  webview: {
    flex: 1,
    backgroundColor: colors.primary},
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'}});
