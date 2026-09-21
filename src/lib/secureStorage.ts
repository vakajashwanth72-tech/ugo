import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'ugo_access_token';
const RECOVERY_TOKEN_KEY = 'ugo_recovery_token';
const TEMP_TOKEN_KEY = 'ugo_temp_token';
const USER_DATA_KEY = 'ugo_user_data';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persists access and recovery/refresh tokens using EncryptedSharedPreferences on Android
 * (backed by Android Keystore hardware AES-256 GCM) and Keychain on iOS, with AsyncStorage backup.
 */
export async function saveAuthTokens(
  accessToken: string,
  recoveryToken?: string,
  userData?: any
): Promise<void> {
  try {
    if (accessToken) {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken, STORE_OPTIONS).catch(() => {});
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken).catch(() => {});
    }
    if (recoveryToken) {
      await SecureStore.setItemAsync(RECOVERY_TOKEN_KEY, recoveryToken, STORE_OPTIONS).catch(() => {});
      await AsyncStorage.setItem(RECOVERY_TOKEN_KEY, recoveryToken).catch(() => {});
    }
    if (userData) {
      await SecureStore.setItemAsync(USER_DATA_KEY, JSON.stringify(userData), STORE_OPTIONS).catch(() => {});
      await AsyncStorage.setItem(USER_DATA_KEY, JSON.stringify(userData)).catch(() => {});
    }
  } catch (err) {
    console.error('[SecureStorage] Error saving tokens:', err);
    throw err;
  }
}

export async function getAccessToken(): Promise<string | null> {
  try {
    let token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY, STORE_OPTIONS);
    if (!token) {
      token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY).catch(() => null);
    }
    if (!token) {
      token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY).catch(() => null);
    }
    if (!token) {
      token = (await SecureStore.getItemAsync(TEMP_TOKEN_KEY, STORE_OPTIONS).catch(() => null)) ||
        (await AsyncStorage.getItem(TEMP_TOKEN_KEY).catch(() => null));
    }
    return token || null;
  } catch (err) {
    console.warn('[SecureStorage] SecureStore getAccessToken error, falling back to AsyncStorage:', err);
    try {
      return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export async function getRecoveryToken(): Promise<string | null> {
  try {
    let token = await SecureStore.getItemAsync(RECOVERY_TOKEN_KEY, STORE_OPTIONS);
    if (!token) {
      token = await SecureStore.getItemAsync(RECOVERY_TOKEN_KEY).catch(() => null);
    }
    if (!token) {
      token = await AsyncStorage.getItem(RECOVERY_TOKEN_KEY).catch(() => null);
    }
    return token || null;
  } catch (err) {
    console.warn('[SecureStorage] SecureStore getRecoveryToken error, falling back to AsyncStorage:', err);
    try {
      return await AsyncStorage.getItem(RECOVERY_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}

export async function saveTempToken(tempToken: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TEMP_TOKEN_KEY, tempToken, STORE_OPTIONS);
  } catch (err) {
    console.error('[SecureStorage] Error saving temp token:', err);
  }
}

export async function getTempToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TEMP_TOKEN_KEY, STORE_OPTIONS);
  } catch (err) {
    return null;
  }
}

export async function getUserData<T = any>(): Promise<T | null> {
  try {
    let raw = await SecureStore.getItemAsync(USER_DATA_KEY, STORE_OPTIONS);
    if (!raw) {
      raw = await SecureStore.getItemAsync(USER_DATA_KEY).catch(() => null);
    }
    if (!raw) {
      raw = await AsyncStorage.getItem(USER_DATA_KEY).catch(() => null);
    }
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    try {
      const raw = await AsyncStorage.getItem(USER_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

export async function clearAuthTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(RECOVERY_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(TEMP_TOKEN_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(USER_DATA_KEY).catch(() => {});
    await AsyncStorage.removeItem(ACCESS_TOKEN_KEY).catch(() => {});
    await AsyncStorage.removeItem(RECOVERY_TOKEN_KEY).catch(() => {});
    await AsyncStorage.removeItem(TEMP_TOKEN_KEY).catch(() => {});
    await AsyncStorage.removeItem(USER_DATA_KEY).catch(() => {});
  } catch (err) {
    console.error('[SecureStorage] Error clearing tokens:', err);
  }
}
