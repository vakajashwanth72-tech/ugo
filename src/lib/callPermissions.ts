import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Checks and requests RECORD_AUDIO runtime permission on Android.
 * Always returns true on iOS (handled via Info.plist).
 */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );

    if (hasPermission) {
      console.log('[callPermissions] Microphone permission already granted.');
      return true;
    }

    console.log('[callPermissions] Requesting microphone permission from user...');
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone Permission',
        message: 'UgO requires microphone access so you can speak to the other person on this call.',
        buttonNeutral: 'Ask Later',
        buttonNegative: 'Deny',
        buttonPositive: 'Allow',
      }
    );

    const isGranted = status === PermissionsAndroid.RESULTS.GRANTED;
    console.log('[callPermissions] Microphone permission result:', status, 'granted:', isGranted);
    return isGranted;
  } catch (err) {
    console.warn('[callPermissions] Error requesting microphone permission:', err);
    return false;
  }
}
