import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/navigationTypes';
import { supabase } from './src/lib/supabase';
import { PaymentCoordinator, PaymentCoordinatorState } from './src/lib/PaymentCoordinator';
import { AcceptedOtpCoordinator, AcceptedOtpState } from './src/lib/AcceptedOtpCoordinator';
import RazorpayCheckoutModal from './src/components/RazorpayCheckoutModal';
import BookingAcceptedModal from './src/components/BookingAcceptedModal';
import { useNotifications } from './src/hooks/useNotifications';
import {
  initPushNotificationChannels,
  setupPushTokenRefreshListener,
  setupNotificationResponseListener,
  registerDeviceTokenWithBackend,
} from './src/lib/pushNotifications';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function NotificationGlobalPoller() {
  useNotifications();
  return null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; name?: string }>({});
  const [paymentState, setPaymentState] = useState<PaymentCoordinatorState>(PaymentCoordinator.getState());
  const [acceptedOtpState, setAcceptedOtpState] = useState<AcceptedOtpState>(AcceptedOtpCoordinator.getState());

  // 1. Subscribe to PaymentCoordinator Single-Instance UI Lock state
  useEffect(() => {
    const unsubscribe = PaymentCoordinator.subscribe((state) => {
      setPaymentState(state);
    });
    return () => unsubscribe();
  }, []);

  // 2. Subscribe to AcceptedOtpCoordinator for Booking Accepted Celebration Modal
  useEffect(() => {
    const unsubscribe = AcceptedOtpCoordinator.subscribe((state) => {
      setAcceptedOtpState(state);
    });
    return () => unsubscribe();
  }, []);

  // 3. Current user session setup (no Supabase realtime listeners)
  useEffect(() => {
    const setupSession = async () => {
      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user;
      if (!sessionUser) return;

      setCurrentUser({
        id: sessionUser.id,
        email: sessionUser.email,
        name: sessionUser.user_metadata?.full_name || sessionUser.email?.split('@')[0] || 'NITK Student',
      });

      // Register device FCM token in background if user session is active
      registerDeviceTokenWithBackend().catch(() => {});
    };

    setupSession();
  }, []);

  // 4. Push notification channels, token rotation listener, and tap-to-open handler
  useEffect(() => {
    initPushNotificationChannels();

    const unsubscribeRefresh = setupPushTokenRefreshListener();
    const unsubscribeResponse = setupNotificationResponseListener((data) => {
      if (navigationRef.isReady()) {
        try {
          (navigationRef as any).navigate('Notifications');
        } catch (e) {
          console.warn('[App] Navigation error on notification tap:', e);
        }
      }
    });

    return () => {
      unsubscribeRefresh();
      unsubscribeResponse();
    };
  }, []);

  const handlePaymentSuccess = (paymentId: string, orderId?: string, signature?: string) => {
    console.log(
      `[App] 🚴 Payment completed directly from Razorpay! PaymentID: ${paymentId}, OrderID: ${orderId || 'none'}, Sig: ${signature ? 'OK' : 'N/A'}`
    );

    // Release UI lock and mark completed locally: no backend verification is called
    PaymentCoordinator.releaseLock('PAYMENT_SUCCESS');
    if (paymentId) PaymentCoordinator.markPaymentCompleted(paymentId);
    if (orderId) PaymentCoordinator.markPaymentCompleted(orderId);

    Alert.alert(
      'Payment Successful! 🚴',
      'Your payment has been completed. Your ride is now active! Enjoy your ride.',
      [
        {
          text: 'View Ongoing Rentals',
          onPress: () => {
            if (navigationRef.isReady()) {
              navigationRef.navigate('OngoingRentals');
            }
          },
        },
      ]
    );
  };

  const handlePaymentDismiss = () => {
    console.log('[App] 🛑 User dismissed Razorpay checkout.');
    PaymentCoordinator.releaseLock('USER_DISMISSED');
  };

  const handlePaymentFailure = (error: any) => {
    console.error('[App] ❌ Payment failed on Razorpay:', error);
    PaymentCoordinator.releaseLock('PAYMENT_FAILED');
    Alert.alert(
      'Payment Incomplete',
      error?.description || 'Your payment was not completed. You can try paying again from Ongoing Rentals.'
    );
  };

  return (
    <SafeAreaProvider>
      <NotificationGlobalPoller />
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>

      {/* Global Single-Instance Razorpay Checkout Modal */}
      {paymentState.isPaymentCheckoutActive && paymentState.activePayload && (
        <RazorpayCheckoutModal
          visible={paymentState.isPaymentCheckoutActive}
          bookingId={paymentState.activePayload.booking_id}
          orderId={paymentState.activePayload.order_id}
          paymentId={paymentState.activePayload.payment_id}
          amount={paymentState.activePayload.amount || 0}
          razorpayKey={paymentState.activePayload.razorpay_key}
          currency={paymentState.activePayload.currency || 'INR'}
          userEmail={paymentState.activePayload.userEmail || currentUser.email || 'student@nitk.edu.in'}
          userName={paymentState.activePayload.userName || currentUser.name || 'NITK Student'}
          userContact={paymentState.activePayload.userContact || '9876543210'}
          onSuccess={handlePaymentSuccess}
          onClose={handlePaymentDismiss}
          onDismiss={handlePaymentDismiss}
          onFailure={handlePaymentFailure}
        />
      )}

      {/* Global Booking Accepted Pickup OTP Celebration Modal with Ribbons */}
      {acceptedOtpState.isVisible && acceptedOtpState.payload && (
        <BookingAcceptedModal
          visible={acceptedOtpState.isVisible}
          payload={acceptedOtpState.payload}
          onDismiss={() => AcceptedOtpCoordinator.dismiss()}
          onNavigateToOngoing={() => {
            AcceptedOtpCoordinator.dismiss();
            if (navigationRef.isReady()) {
              navigationRef.navigate('OngoingRentals');
            }
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
