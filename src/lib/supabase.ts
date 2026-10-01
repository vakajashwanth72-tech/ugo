import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig as any)?.extra || {};
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  extra.supabaseUrl ||
  'https://pddkgrveqwmeohxszuxr.supabase.co';

// Verified Supabase publishable key for UgO NITK (reject stale cached Metro env if present)
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey;
const supabaseAnonKey =
  rawKey && !rawKey.includes('LJDxg7VGa4eKUvwDyg')
    ? rawKey
    : 'sb_publishable_9hyRRfSxKoXNV_iX4Q_W2Q_6vx9hXVX';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
