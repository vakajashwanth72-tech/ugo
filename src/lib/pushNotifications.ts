import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo as checkExpoGo } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';
import { getAccessToken, getUserData } from './secureStorage';

const LAST_FCM_TOKEN_KEY = '@ugo_last_registered_fcm_token';
const LAST_USER_ID_KEY = '@ugo_last_registered_user_id';

let isChannelInitialized = false;

/**
 * Checks whether the app is currently running inside the Expo Go sandbox.
 * Expo removed remote push notifications (FCM) from Expo Go starting in SDK 53.
 * Push notifications work in development builds (expo run:android) and production APKs.
 */
export const isRunningInExpoGo = (): boolean => {
  try {
    if (typeof checkExpoGo === 'function' && checkExpoGo()) {
      return true;
    }
  } catch {}
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    (Constants as any).appOwnership === 'expo'
  );
};

/**
 * Configure the global notification presentation behavior
 * Shows banner, sound, and badge even when app is in foreground.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Creates the required Android Notification Channel (Android 8.0+).
 */
export async function initPushNotificationChannels(): Promise<void> {
  if (isChannelInitialized) return;
  if (isRunningInExpoGo()) {
    console.log('[pushNotifications] Skipping notification channel setup in Expo Go (native notification channels are linked in development/production builds).');
    return;
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'UgO Notifications',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4F46E5',
        enableVibrate: true,
        showBadge: true,
      });
      isChannelInitialized = true;
      console.log('[pushNotifications] Android notification channel "default" registered.');
    }
  } catch (err: any) {
    console.warn('[pushNotifications] Error creating notification channel:', err?.message || err);
  }
}

/**
 * Requests notification permissions from the user and retrieves the native FCM device token.
 * Returns null if not on a physical device, permission denied, or error occurs.
 */
export async function getDeviceFcmToken(): Promise<string | null> {
  try {
    // 0. Check if running in Expo Go (Expo Go removed remote push notifications in SDK 53+)
    if (isRunningInExpoGo()) {
      console.log(
        '[pushNotifications] Remote push notifications (FCM) are not supported inside Expo Go (Expo SDK 53+). ' +
        'They work in development builds (npx expo run:android) and standalone APKs.'
      );
      return null;
    }

    // 1. Physical device check
    if (!Device.isDevice) {
      console.log('[pushNotifications] Physical device required for native FCM push notifications.');
      return null;
    }

    // 2. Ensure Android channel is created
    await initPushNotificationChannels();

    // 3. Check existing permission status
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // 4. If not granted, prompt the user for permission (like general ride/delivery apps)
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[pushNotifications] Notification permission was not granted by user.');
      return null;
    }

    // 5. Fetch native FCM push token using Google Services
    try {
      const tokenResult = await Notifications.getDevicePushTokenAsync();
      if (tokenResult?.data) {
        console.log('[pushNotifications] Successfully retrieved native FCM device token.');
        return String(tokenResult.data);
      }
    } catch (tokenErr) {
      console.warn('[pushNotifications] getDevicePushTokenAsync note:', tokenErr);
    }

    // Fallback attempt with getExpoPushTokenAsync if native fetch encounters environment limits
    try {
      const expoToken = await Notifications.getExpoPushTokenAsync();
      if (expoToken?.data) {
        return String(expoToken.data);
      }
    } catch {
      // Ignore fallback error
    }

    return null;
  } catch (err) {
    console.warn('[pushNotifications] Error getting device FCM token:', err);
    return null;
  }
}

let registeredUserId: string | null = null;
let isRegistering = false;

/**
 * Resets the session registration flag (e.g. on logout)
 */
export function resetDeviceRegistrationSession(): void {
  registeredUserId = null;
}

/**
 * Registers the device's FCM token with the backend API.
 * Endpoint: POST /api/devices/register
 * 
 * Execution rules:
 * - Executes EXACTLY ONCE per authenticated login/user session.
 * - Skips network request if the current token & user ID match the last registered cache.
 * - Stops all repeated calling.
 */
export async function registerDeviceTokenWithBackend(force: boolean = false): Promise<string | null> {
  if (isRegistering) {
    return null;
  }

  isRegistering = true;

  try {
    // 1. Ensure user is authenticated
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log('[pushNotifications] No active access token; skipping device registration.');
      return null;
    }

    // 2. Resolve current user ID
    const userData = await getUserData();
    const currentUserId = String(userData?.id || userData?.email || 'user');

    // 3. If already registered for this user in this session and !force, skip!
    if (!force && registeredUserId === currentUserId) {
      return null;
    }

    // 4. Retrieve device FCM token
    const fcmToken = await getDeviceFcmToken();
    if (!fcmToken) {
      return null;
    }

    // 5. Check local cache to avoid duplicate backend requests
    const cachedToken = await AsyncStorage.getItem(LAST_FCM_TOKEN_KEY);
    const cachedUserId = await AsyncStorage.getItem(LAST_USER_ID_KEY);

    if (!force && cachedToken === fcmToken && cachedUserId === currentUserId) {
      console.log('[pushNotifications] FCM token already registered for this device & user. Skipping.');
      registeredUserId = currentUserId;
      return fcmToken;
    }

    console.log('[pushNotifications] Registering FCM token with backend once for user:', currentUserId);

    // Mark user as registered for this session so it NEVER repeats
    registeredUserId = currentUserId;

    // 6. Dispatch to backend POST /api/devices/register strictly ONCE
    await apiClient.registerDeviceToken(fcmToken, Platform.OS || 'android');

    // 7. Cache registered state to permanently prevent repeated calls across restarts
    await AsyncStorage.setItem(LAST_FCM_TOKEN_KEY, fcmToken);
    await AsyncStorage.setItem(LAST_USER_ID_KEY, currentUserId);
    console.log('[pushNotifications] FCM token registration completed.');

    return fcmToken;
  } catch (err: any) {
    console.warn('[pushNotifications] registerDeviceTokenWithBackend error:', err?.message || err);
    return null;
  } finally {
    isRegistering = false;
  }
}

/**
 * Unregisters the device's FCM token from the backend upon logout.
 * Endpoint: PATCH /api/devices/unregister
 * Body: { fcm_token: string }
 * Auth: Raw access token in Authorization header.
 */
export async function unregisterDeviceTokenWithBackend(): Promise<boolean> {
  try {
    let fcmToken = await AsyncStorage.getItem(LAST_FCM_TOKEN_KEY);
    if (!fcmToken) {
      fcmToken = await getDeviceFcmToken();
    }
    if (!fcmToken) {
      console.log('[pushNotifications] No FCM token found to unregister.');
      resetDeviceRegistrationSession();
      return false;
    }

    console.log('[pushNotifications] Unregistering FCM token with backend...');
    await apiClient.unregisterDeviceToken(fcmToken);

    // Clear cached registered token state
    await AsyncStorage.removeItem(LAST_FCM_TOKEN_KEY);
    await AsyncStorage.removeItem(LAST_USER_ID_KEY);
    resetDeviceRegistrationSession();
    console.log('[pushNotifications] Device unregistration completed.');
    return true;
  } catch (err: any) {
    console.warn('[pushNotifications] unregisterDeviceTokenWithBackend error:', err?.message || err);
    resetDeviceRegistrationSession();
    return false;
  }
}

/**
 * Push token refresh listener: disabled to prevent repeated background calling loops.
 */
export function setupPushTokenRefreshListener(): () => void {
  return () => {};
}

/**
 * Sets up a listener for user interaction with incoming push notifications (tap to open).
 */
export function setupNotificationResponseListener(
  onNotificationResponse: (data: Record<string, any>) => void
): () => void {
  try {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response?.notification?.request?.content?.data || {};
      console.log('[pushNotifications] User tapped notification with payload:', data);
      if (typeof onNotificationResponse === 'function') {
        onNotificationResponse(data);
      }
    });

    return () => {
      try {
        subscription.remove();
      } catch {}
    };
  } catch (err: any) {
    console.warn('[pushNotifications] Error setting up notification response listener:', err?.message || err);
    return () => {};
  }
}
