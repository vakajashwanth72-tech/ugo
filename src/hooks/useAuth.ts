import { useState, useEffect, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types';
import { getAccessToken, getUserData, clearAuthTokens } from '../lib/secureStorage';
import { apiClient } from '../lib/apiClient';

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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = useCallback(async (userId: string) => {
    // Only query Supabase profiles table if userId is a valid UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.warn('Error fetching profile:', error);
        return null;
      }

      if (data) {
        const role = String(data.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'student';
        const formatted = { ...data, role } as Profile;
        setProfile(formatted);
        return formatted;
      }
      return null;
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      return null;
    }
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
          return;
        }

        // 2. Fallback to Supabase session
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (data.session?.user) {
          setSession(data.session);
          setUser(data.session.user);
          await fetchProfile(data.session.user.id);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        if (newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);
          await fetchProfile(newSession.user.id);
        } else if (event === 'SIGNED_OUT') {
          const storedToken = await getAccessToken();
          if (!storedToken) {
            setSession(null);
            setUser(null);
            setProfile(null);
          }
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch (e) {
      console.warn('[useAuth] Logout error:', e);
      await clearAuthTokens();
    }
    await supabase.auth.signOut().catch(() => {});
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
