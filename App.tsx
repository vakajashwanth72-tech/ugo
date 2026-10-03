import { registerGlobals } from '@livekit/react-native';
registerGlobals();

import React, { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/navigationTypes';
import { getUserData, getAccessToken } from './src/lib/secureStorage';
import {
  connectSocket,
  onIncomingCallReceived,
  dispatchCallAccepted,
  dispatchCallRejected,
  dispatchCallCancelled,
  dispatchCallEnded,
} from './src/lib/socket';
import { PaymentCoordinator, PaymentCoordinatorState } from './src/lib/PaymentCoordinator';
import { AcceptedOtpCoordinator, AcceptedOtpState } from './src/lib/AcceptedOtpCoordinator';
import RazorpayCheckoutModal from './src/components/RazorpayCheckoutModal';
import BookingAcceptedModal from './src/components/BookingAcceptedModal';
import { useNotifications, notificationStore } from './src/hooks/useNotifications';
import {
  initPushNotificationChannels,
  setupPushTokenRefreshListener,
  setupNotificationResponseListener,
  setupNotificationReceivedListener,
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

  // 3. Current user session setup from secureStorage (no Supabase)
  useEffect(() => {
    const setupSession = async () => {
      const token = await getAccessToken();
      const storedUser = await getUserData();
      if (!token && !storedUser) return;

      const userEmail = storedUser?.email || '';
      setCurrentUser({
        id: storedUser?.id || storedUser?.user_id || 'student',
        email: userEmail,
        name: storedUser?.full_name || storedUser?.name || userEmail.split('@')[0] || 'NITK Student',
      });

      // Register device FCM token and connect real-time socket
      registerDeviceTokenWithBackend().catch(() => {});
      if (token) {
        connectSocket(token);
      }
    };

    setupSession();
  }, []);

  // 4. Push notification channels, token rotation listener, incoming call listener, and tap-to-open handler
  useEffect(() => {
    initPushNotificationChannels();

    const unsubscribeRefresh = setupPushTokenRefreshListener();
    const unsubscribeResponse = setupNotificationResponseListener((data) => {
      if (navigationRef.isReady()) {
        try {
          const actionType = String(data?.actionType || data?.action_type || '').toUpperCase();
          const actionData = data?.actionData || data?.action_data || {};
          const title = String(data?.title || '').toLowerCase();

          if (actionType === 'INCOMING_CALL' || actionData?.call_id || data?.call_id) {
            console.log('[App] 📞 Incoming call push notification tapped:', data);
            const callId = actionData?.call_id || actionData?.id || data?.call_id || data?.id;
            navigationRef.navigate('CallModal', {
              id: callId,
              call_id: callId,
              conversationId: String(actionData?.conversation_id || data?.conversation_id || ''),
              targetUserName: data?.title || 'Incoming Caller',
              isIncoming: true,
              callData: {
                ...actionData,
                call_id: callId,
                id: callId,
              },
            });
            return;
          }

          if (actionType === 'CALL_ACCEPTED' || title.includes('call accepted')) {
            console.log('[App] 🟢 Call accepted push notification tapped by User A:', data);
            const callId = actionData?.call_id || actionData?.id || data?.notificationId || data?.id;
            dispatchCallAccepted({
              id: callId,
              conversation_id: String(actionData?.conversation_id || data?.conversation_id || ''),
              call_type: actionData?.call_type || 'audio',
              status: actionData?.status || 'accepted',
              room_name: actionData?.room_name,
              started_at: actionData?.started_at || new Date().toISOString(),
            });
            return;
          }

          if (actionType === 'CALL_REJECTED' || title.includes('call rejected')) {
            console.log('[App] 🛑 Call rejected push notification tapped by User A:', data);
            const callId = actionData?.call_id || actionData?.id || data?.notificationId || data?.id;
            dispatchCallRejected({
              id: callId,
              status: actionData?.status || 'rejected',
            });
            return;
          }

          if (
            actionType === 'CALL_CANCELLED' ||
            actionType === 'CALL_CANCELED' ||
            title.includes('call cancelled') ||
            title.includes('call canceled')
          ) {
            console.log('[App] 🛑 Call cancelled push notification tapped by User B:', data);
            const callId = actionData?.call_id || actionData?.id || data?.notificationId || data?.id;
            dispatchCallCancelled({
              id: callId,
              status: actionData?.status || 'cancelled',
            });
            return;
          }

          if (actionType === 'CALL_ENDED' || title.includes('call ended')) {
            console.log('[App] 📴 Call ended push notification tapped:', data);
            const callId = actionData?.call_id || actionData?.id || data?.notificationId || data?.id;
            dispatchCallEnded({
              id: callId,
              status: actionData?.status || 'ended',
            });
            return;
          }

          (navigationRef as any).navigate('Notifications');
        } catch (e) {
          console.warn('[App] Navigation error on notification tap:', e);
        }
      }
    });

    // 5. Global listener for foreground push notifications
    const unsubscribeReceived = setupNotificationReceivedListener((notifData) => {
      const actionType = String(notifData?.actionType || notifData?.action_type || '').toUpperCase();
      const actionData = notifData?.actionData || notifData?.action_data || {};
      const title = String(notifData?.title || '').toLowerCase();

      if (actionType === 'CALL_ACCEPTED' || title.includes('call accepted')) {
        console.log('[App] 🟢 Foreground push notification received for CALL_ACCEPTED:', notifData);
        const callId = actionData?.call_id || actionData?.id || notifData?.notificationId || notifData?.id;
        dispatchCallAccepted({
          id: callId,
          conversation_id: String(actionData?.conversation_id || notifData?.conversation_id || ''),
          call_type: actionData?.call_type || 'audio',
          status: actionData?.status || 'accepted',
          room_name: actionData?.room_name,
          started_at: actionData?.started_at || new Date().toISOString(),
        });
      }

      if (actionType === 'CALL_REJECTED' || title.includes('call rejected')) {
        console.log('[App] 🛑 Foreground push notification received for CALL_REJECTED:', notifData);
        const callId = actionData?.call_id || actionData?.id || notifData?.notificationId || notifData?.id;
        dispatchCallRejected({
          id: callId,
          status: actionData?.status || 'rejected',
        });
      }

      if (
        actionType === 'CALL_CANCELLED' ||
        actionType === 'CALL_CANCELED' ||
        title.includes('call cancelled') ||
        title.includes('call canceled')
      ) {
        console.log('[App] 🛑 Foreground push notification received for CALL_CANCELLED:', notifData);
        const callId = actionData?.call_id || actionData?.id || notifData?.notificationId || notifData?.id;
        dispatchCallCancelled({
          id: callId,
          status: actionData?.status || 'cancelled',
        });
      }

      if (actionType === 'CALL_ENDED' || title.includes('call ended')) {
        console.log('[App] 📴 Foreground push notification received for CALL_ENDED:', notifData);
        const callId = actionData?.call_id || actionData?.id || notifData?.notificationId || notifData?.id;
        dispatchCallEnded({
          id: callId,
          status: actionData?.status || 'ended',
        });
      }
    });

    // 6. Global real-time listener for incoming calls over WebSocket
    const unsubscribeIncomingCall = onIncomingCallReceived((call) => {
      console.log('[App] 📞 Incoming call received via WebSocket:', call);
      if (navigationRef.isReady()) {
        try {
          const callId = call?.id || (call as any)?.call_id;
          navigationRef.navigate('CallModal', {
            id: callId,
            call_id: callId,
            conversationId: String(call.conversation_id),
            targetUserName: call.caller_name || 'Incoming Caller',
            targetUserId: call.caller_id,
            isIncoming: true,
            callData: {
              ...call,
              id: callId,
              call_id: callId,
            },
          });
        } catch (err) {
          console.warn('[App] Navigation error on incoming call event:', err);
        }
      }
    });

    return () => {
      unsubscribeRefresh();
      unsubscribeResponse();
      unsubscribeReceived();
      unsubscribeIncomingCall();
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
          onDismiss={async () => {
            const notifId = acceptedOtpState.payload?.notificationId;
            const bookingId = acceptedOtpState.payload?.bookingId;
            await AcceptedOtpCoordinator.dismiss(notifId, bookingId);
            if (notifId) {
              await notificationStore.markAsRead(String(notifId));
            }
          }}
          onNavigateToOngoing={async () => {
            const notifId = acceptedOtpState.payload?.notificationId;
            const bookingId = acceptedOtpState.payload?.bookingId;
            await AcceptedOtpCoordinator.dismiss(notifId, bookingId);
            if (notifId) {
              await notificationStore.markAsRead(String(notifId));
            }
            if (navigationRef.isReady()) {
              navigationRef.navigate('OngoingRentals');
            }
          }}
        />
      )}
    </SafeAreaProvider>
  );
}
