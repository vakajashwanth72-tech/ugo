export default ({ config }: any): any => ({
  ...config,
  name: 'UgO NITK',
  slug: 'ugo-mobile',
  scheme: 'ugo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/app_logo.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/UGO_logo.jpeg',
    resizeMode: 'contain',
    backgroundColor: '#000000',
  },
  android: {
    package: 'in.ugo.nitk.mobile',
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      foregroundImage: './assets/app_logo.png',
      backgroundColor: '#000000',
    },
    permissions: [
      'CAMERA',
      'RECORD_AUDIO',
      'POST_NOTIFICATIONS',
      'INTERNET',
      'MODIFY_AUDIO_SETTINGS',
      'ACCESS_NETWORK_STATE',
      'VIBRATE',
      'WAKE_LOCK',
    ],
  },
  ios: {
    bundleIdentifier: 'in.ugo.nitk.mobile',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'UgO camera access for cycle verification during returns.',
      NSMicrophoneUsageDescription: 'UgO microphone access for real-time owner-renter voice calls.',
    },
  },
  extra: {
    razorpayKeyId: process.env.EXPO_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_TSslW485AyMVnu',
    n8nBaseUrl: process.env.EXPO_PUBLIC_N8N_BASE_URL || 'https://ugonitk.app.n8n.cloud/webhook',
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
  plugins: [
    'expo-notifications',
    'expo-status-bar',
    'expo-secure-store',
  ],
});
