import { useState, useEffect, useCallback } from 'react';
import { Profile } from '../types';
import { getAccessToken, getUserData, clearAuthTokens } from '../lib/secureStorage';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: any;
  app_metadata?: any;
  created_at?: string;
  [key: string]: any;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}
import { apiClient, normalizeProfileData } from '../lib/apiClient';
import { clearStoredNotifications } from './useNotifications';
import {
  registerDeviceTokenWithBackend,
  unregisterDeviceTokenWithBackend,
  resetDeviceRegistrationSession,
} from '../lib/pushNotifications';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { clearAllTempChats } from '../lib/chatStorage';

function decodeBase64(str: string): string {
  try {
    if (typeof atob === 'function') {
      return atob(str);
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    const cleanStr = String(str).replace(/=+$/, '');
    for (let bc = 0, bs = 0, buffer, idx = 0; (buffer = cleanStr.charAt(idx++)); ) {
      const charIndex = chars.indexOf(buffer);
      if (~charIndex) {
        bs = bc % 4 ? bs * 64 + charIndex : charIndex;
        if (bc++ % 4) {
          output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
        }
      }
    }
    return output;
  } catch {
    return '';
  }
}

function parseJwtPayload(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = decodeBase64(base64);
      if (decoded) {
        return JSON.parse(decoded);
      }
    }
  } catch {}
  return null;
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = useCallback(async (userId?: string) => {
    try {
      const res = await apiClient.getProfile();
      const p = normalizeProfileData(res);
      if (p) {
        setProfile((prev) => ({
          id: userId || prev?.id || 'user',
          email: p.email || prev?.email || '',
          full_name: p.full_name || prev?.full_name || 'NITK Student',
          role: prev?.role || 'student',
          phone: p.phone || prev?.phone || '',
          hostel: p.hostel || prev?.hostel || '',
          avatar_url: p.avatar_url || (prev as any)?.avatar_url,
          net_balance: p.net_balance !== undefined ? p.net_balance : prev?.net_balance || 0,
        } as any));
        return p;
      }
    } catch (err) {
      console.warn('[useAuth] fetchProfile note:', err);
    }
    return null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // 1. Check custom backend session in SecureStore first (fast path)
        const storedToken = await getAccessToken();
        const storedUser = await getUserData();

        if (storedToken && mounted) {
          const email = storedUser?.email || '';
          const jwtPayload = parseJwtPayload(storedToken);
          const resolvedId =
            (storedUser?.id && !storedUser.id.includes('@') ? storedUser.id : null) ||
            jwtPayload?.id ||
            jwtPayload?.userId ||
            jwtPayload?.user_id ||
            jwtPayload?.sub ||
            storedUser?.id ||
            email ||
            'custom-user';

          const rawRole =
            storedUser?.role ||
            storedUser?.user?.role ||
            jwtPayload?.role ||
            jwtPayload?.user?.role ||
            'student';
          const isUserAdmin = String(rawRole).trim().toLowerCase() === 'admin';
          const resolvedRole: 'admin' | 'student' = isUserAdmin ? 'admin' : 'student';

          const userObj: any = {
            id: resolvedId,
            email,
            app_metadata: {},
            user_metadata: { ...storedUser, id: resolvedId, role: resolvedRole },
            aud: 'authenticated',
            created_at: new Date().toISOString(),
          };
          setUser(userObj);
          setSession({ user: userObj, access_token: storedToken });
          setProfile({
            id: userObj.id,
            email,
            full_name: storedUser?.full_name || storedUser?.name || email.split('@')[0] || 'NITK Student',
            role: resolvedRole,
            phone: storedUser?.phone || '',
            hostel: storedUser?.hostel || '',
            net_balance: storedUser?.net_balance || 0,
          } as any);
          setLoading(false);

          // Fetch fresh profile from backend
          fetchProfile(resolvedId).catch(() => {});

          // Register device FCM token and connect real-time Socket.IO
          registerDeviceTokenWithBackend().catch(() => {});
          connectSocket(storedToken);
          return;
        }

        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, [fetchProfile]);

  const logout = async () => {
    try {
      await unregisterDeviceTokenWithBackend();
    } catch (e) {
      console.warn('[useAuth] Device unregistration error on logout:', e);
    }
    try {
      await apiClient.logout();
    } catch (e) {
      console.warn('[useAuth] Logout error:', e);
    }
    disconnectSocket();
    await clearAuthTokens();
    await clearStoredNotifications();
    await clearAllTempChats();
    resetDeviceRegistrationSession();
    try {
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.clear();
      console.log('[useAuth] Frontend storage completely cleared on logout.');
    } catch (e) {
      console.warn('[useAuth] Error clearing storage on logout:', e);
    }
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  };

  return {
    session,
    user,
    profile,
    isAdmin:
      String(profile?.role || (user as any)?.user_metadata?.role || '').trim().toLowerCase() === 'admin',
    loading,
    logout,
    refreshProfile,
  };
}
