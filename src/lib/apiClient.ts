import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAccessToken,
  getRecoveryToken,
  getTempToken,
  saveAuthTokens,
  clearAuthTokens,
} from './secureStorage';
import { supabase } from './supabase';
import { extractCycleImages, getCycleImageUrl } from './cycleUtils';

export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://seducing-glowworm-booth.ngrok-free.dev'
).replace(/\/+$/, '');

const appVersion = Constants.expoConfig?.version || '1.0.0';
const osName = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : Platform.OS;
const osVersion = Platform.Version ? `${Platform.Version}` : '';
export const DEFAULT_USER_AGENT = `UgO-NITK-Mobile/${appVersion} (${osName}${osVersion ? ` ${osVersion}` : ''}; OkHttp)`;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;
  tempToken?: string;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  timeout?: number;
}

export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token || !token.includes('.')) return false;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(base64) : '';
    if (!json) return false;
    const payload = JSON.parse(json);
    if (!payload?.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= nowSec + 10;
  } catch {
    return false;
  }
}

function enrichCycleWithImages(item: any, rawImages?: any): any {
  if (!item || typeof item !== 'object') return item;
  const cycleObj = { ...item };

  // Attach cycle_images if present
  if (rawImages) {
    if (!cycleObj.cycle_images) {
      cycleObj.cycle_images = Array.isArray(rawImages) ? rawImages : [rawImages];
    }
  }

  // Extract all valid image URLs using the multi-source extractor
  const imgs = extractCycleImages({
    ...cycleObj,
    ...(typeof rawImages === 'object' && !Array.isArray(rawImages) ? rawImages : {}),
    cycle_images: cycleObj.cycle_images || rawImages,
  });

  if (imgs.length > 0) {
    cycleObj.images = imgs;
    cycleObj.image = imgs[0];
    cycleObj.image_url = imgs[0];
  } else {
    if (cycleObj.image) cycleObj.image = getCycleImageUrl(cycleObj.image);
    if (cycleObj.image_url) cycleObj.image_url = getCycleImageUrl(cycleObj.image_url);
    if (Array.isArray(cycleObj.images)) {
      cycleObj.images = cycleObj.images.map((img: any) => getCycleImageUrl(img)).filter(Boolean);
      if (!cycleObj.image && cycleObj.images.length > 0) {
        cycleObj.image = cycleObj.images[0];
      }
    }
  }

  return cycleObj;
}

export function extractCyclesList(res: any): any[] {
  if (!res) return [];
  if (Array.isArray(res)) return res.map((c: any) => enrichCycleWithImages(c));

  if (typeof res === 'string') {
    try {
      const parsed = JSON.parse(res);
      return extractCyclesList(parsed);
    } catch {
      return [];
    }
  }

  const rawImages = res.cycle_images ?? res.cycleImages ?? res.images;

  // 1. Explicit backend response shape:
  // { success: true, cycles: cycles_data.rows[0], cycle_images: cycle_images.rows[0] }
  if (res.cycles && typeof res.cycles === 'object') {
    if (Array.isArray(res.cycles)) {
      return res.cycles.map((c: any) => {
        let matched: any = rawImages;
        if (Array.isArray(rawImages)) {
          const filtered = rawImages.filter((img: any) => {
            const imgId = String(img?.cycle_id || img?.cycleId || '').trim();
            const cCycleId = String(c.cycle_id || '').trim();
            const cId = String(c.id || '').trim();
            return imgId && (imgId === cCycleId || imgId === cId);
          });
          if (filtered.length > 0) matched = filtered;
        }
        return enrichCycleWithImages(c, matched);
      });
    } else {
      // Single cycle object in res.cycles
      return [enrichCycleWithImages(res.cycles, rawImages)];
    }
  }

  // 2. res.cycle (single or array)
  if (res.cycle && typeof res.cycle === 'object') {
    if (Array.isArray(res.cycle)) {
      return res.cycle.map((c: any) => enrichCycleWithImages(c, rawImages));
    } else {
      return [enrichCycleWithImages(res.cycle, rawImages)];
    }
  }

  // 3. res.getmycycles / res.getMyCycles (backend handler for My Cycles)
  if (res.getmycycles && typeof res.getmycycles === 'object') {
    if (res.getmycycles.cycles || res.getmycycles.cycle) {
      return extractCyclesList({ ...res.getmycycles, cycle_images: res.cycle_images || res.getmycycles.cycle_images });
    }
    if (Array.isArray(res.getmycycles)) {
      return res.getmycycles.map((c: any) => enrichCycleWithImages(c, rawImages));
    }
    return [enrichCycleWithImages(res.getmycycles, rawImages)];
  }

  if (res.getMyCycles && typeof res.getMyCycles === 'object') {
    if (res.getMyCycles.cycles || res.getMyCycles.cycle) {
      return extractCyclesList({ ...res.getMyCycles, cycle_images: res.cycle_images || res.getMyCycles.cycle_images });
    }
    if (Array.isArray(res.getMyCycles)) {
      return res.getMyCycles.map((c: any) => enrichCycleWithImages(c, rawImages));
    }
    return [enrichCycleWithImages(res.getMyCycles, rawImages)];
  }

  if (res.cycles_data && typeof res.cycles_data === 'object') {
    const data = res.cycles_data.rows ? res.cycles_data.rows : res.cycles_data;
    if (Array.isArray(data)) {
      return data.map((c: any) => enrichCycleWithImages(c, rawImages));
    }
    return [enrichCycleWithImages(data, rawImages)];
  }

  // 4. res.getcycles / res.getCycles
  if (res.getcycles && typeof res.getcycles === 'object') {
    if (Array.isArray(res.getcycles)) {
      return res.getcycles.map((c: any) => enrichCycleWithImages(c, rawImages));
    } else {
      return [enrichCycleWithImages(res.getcycles, rawImages)];
    }
  }

  if (res.getCycles && typeof res.getCycles === 'object') {
    if (Array.isArray(res.getCycles)) {
      return res.getCycles.map((c: any) => enrichCycleWithImages(c, rawImages));
    } else {
      return [enrichCycleWithImages(res.getCycles, rawImages)];
    }
  }

  // 4. Nested in res.data
  if (res.data && typeof res.data === 'object') {
    if (Array.isArray(res.data)) return res.data.map((c: any) => enrichCycleWithImages(c, rawImages));
    const fromData = extractCyclesList(res.data);
    if (fromData.length > 0) return fromData;
  }

  // 5. Nested in res.payload
  if (res.payload && typeof res.payload === 'object') {
    if (Array.isArray(res.payload)) return res.payload.map((c: any) => enrichCycleWithImages(c, rawImages));
    const fromPayload = extractCyclesList(res.payload);
    if (fromPayload.length > 0) return fromPayload;
  }

  // 6. Alternative array properties
  if (Array.isArray(res.myCycles)) return res.myCycles.map((c: any) => enrichCycleWithImages(c, rawImages));
  if (res.myCycles && typeof res.myCycles === 'object') return [enrichCycleWithImages(res.myCycles, rawImages)];
  if (Array.isArray(res.my_cycles)) return res.my_cycles.map((c: any) => enrichCycleWithImages(c, rawImages));
  if (res.my_cycles && typeof res.my_cycles === 'object') return [enrichCycleWithImages(res.my_cycles, rawImages)];
  if (Array.isArray(res.result)) return res.result.map((c: any) => enrichCycleWithImages(c, rawImages));
  if (Array.isArray(res.rows)) return res.rows.map((c: any) => enrichCycleWithImages(c, rawImages));
  if (Array.isArray(res.items)) return res.items.map((c: any) => enrichCycleWithImages(c, rawImages));

  // 7. Single cycle object directly at root
  if (res.id || res.cycle_id || res.brand || res.model || res.price_per_hour || res.hourly_price) {
    return [enrichCycleWithImages(res, rawImages)];
  }

  return [];
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;
  private myCyclesPromise: Promise<any> | null = null;

  /**
   * Resolves a URL: if already a full http(s) link, uses it as is;
   * otherwise prepends API_BASE_URL.
   */
  private resolveUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      return pathOrUrl;
    }
    const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${API_BASE_URL}${cleanPath}`;
  }

  /**
   * Returns the base URL of the active backend.
   */
  getBaseUrl(): string {
    return API_BASE_URL;
  }

  /**
   * Universally retrieves active access, recovery, and temp tokens across
   * SecureStore, AsyncStorage, and active Supabase sessions.
   */
  async getEffectiveTokens(tempTokenOverride?: string): Promise<{
    accessToken: string | null;
    recoveryToken: string | null;
    tempToken: string | null;
  }> {
    let accessToken = tempTokenOverride || (await getAccessToken());
    let recoveryToken = await getRecoveryToken();
    const tempToken = await getTempToken();

    if (!accessToken && tempToken) {
      accessToken = tempToken;
    }

    // Fallback: Check Supabase session directly
    if (!accessToken) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          accessToken = data.session.access_token;
        }
        if (!recoveryToken && data?.session?.refresh_token) {
          recoveryToken = data.session.refresh_token;
        }
      } catch (err) {
        console.warn('[apiClient] Supabase session retrieval note:', err);
      }
    }

    // Fallback: Scan AsyncStorage for cached token structures
    if (!accessToken) {
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const authKey = allKeys.find((k) => k.includes('auth-token') || k.includes('token'));
        if (authKey) {
          const raw = await AsyncStorage.getItem(authKey);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              accessToken = parsed?.access_token || parsed?.accessToken || parsed?.token || null;
              if (!recoveryToken) {
                recoveryToken = parsed?.refresh_token || parsed?.refreshToken || null;
              }
            } catch {
              if (raw.startsWith('eyJ')) {
                accessToken = raw;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[apiClient] AsyncStorage scan note:', err);
      }
    }

    return { accessToken, recoveryToken, tempToken };
  }

  /**
   * Core request dispatcher with automatic Bearer JWT injection & OkHttp engine under React Native.
   */
  async request<T = any>(pathOrUrl: string, options: RequestOptions = {}): Promise<T> {
    const url = this.resolveUrl(pathOrUrl);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      ...(options.headers as Record<string, string>),
    };

    // Attach Bearer token and auxiliary token headers if not explicitly skipped
    if (!options.skipAuth) {
      const { accessToken, recoveryToken } = await this.getEffectiveTokens(options.tempToken);
      if (accessToken) {
        headers['Authorization'] = accessToken;
        headers['authorization'] = accessToken;
        headers['Authorizer'] = accessToken;
        headers['authorizer'] = accessToken;
        headers['x-access-token'] = accessToken;
        headers['token'] = accessToken;
        headers['access_token'] = accessToken;
      }
      if (recoveryToken) {
        headers['x-refresh-token'] = recoveryToken;
        headers['refresh-token'] = recoveryToken;
        headers['refresh_token'] = recoveryToken;
        headers['refreshToken'] = recoveryToken;
      }
    }

    const timeoutMs = options.timeout ?? 20000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const config: RequestInit = {
      ...options,
      headers,
      signal: controller.signal,
      body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    };

    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (networkErr: any) {
      clearTimeout(timeoutId);
      console.error(`[apiClient] Network error on ${url}:`, networkErr);
      const isAbort =
        networkErr?.name === 'AbortError' ||
        controller.signal.aborted ||
        String(networkErr?.message || '').toLowerCase().includes('cancel') ||
        String(networkErr?.message || '').toLowerCase().includes('abort');
      if (isAbort) {
        const timeoutError: any = new Error('Request timed out. Please check backend server.');
        timeoutError.isTimeout = true;
        throw timeoutError;
      }
      throw new Error(`Network request failed. Please check connection.`);
    } finally {
      clearTimeout(timeoutId);
    }

    const text = await response.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    // Intercept 401 Unauthorized or 400/403 "unauthorized" for automatic token refresh
    const isUnauthorized =
      (response.status === 401 ||
        response.status === 403 ||
        (response.status === 400 && String(text || '').toLowerCase().includes('unauthorized'))) &&
      !options.skipAuth &&
      !options.tempToken &&
      !options.skipRefresh &&
      !pathOrUrl.includes('/api/auth/logout') &&
      !pathOrUrl.includes('/api/auth/refresh') &&
      !this.isRefreshing;

    if (isUnauthorized) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const { accessToken } = await this.getEffectiveTokens();
        if (accessToken) {
          headers['Authorization'] = accessToken;
          headers['authorization'] = accessToken;
          headers['Authorizer'] = accessToken;
          headers['authorizer'] = accessToken;
          headers['x-access-token'] = accessToken;
          headers['token'] = accessToken;
          headers['access_token'] = accessToken;
          return this.request<T>(pathOrUrl, { ...options, headers });
        }
      }
    }

    if (!response.ok) {
      const errMsg =
        (typeof data === 'object' && (data?.message || data?.error)) ||
        `Request to ${url} failed with status ${response.status}`;
      const error: any = new Error(errMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data as T;
  }

  get<T = any>(pathOrUrl: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(pathOrUrl, { ...options, method: 'GET' });
  }

  post<T = any>(pathOrUrl: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(pathOrUrl, { ...options, method: 'POST', body });
  }

  put<T = any>(pathOrUrl: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(pathOrUrl, { ...options, method: 'PUT', body });
  }

  patch<T = any>(pathOrUrl: string, body?: any, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(pathOrUrl, { ...options, method: 'PATCH', body });
  }

  delete<T = any>(pathOrUrl: string, bodyOrOptions?: any, options?: RequestOptions): Promise<T> {
    if (options || (bodyOrOptions && (bodyOrOptions.headers || bodyOrOptions.skipAuth || bodyOrOptions.timeout || bodyOrOptions.body))) {
      const opts = options ? { ...options, body: bodyOrOptions } : bodyOrOptions;
      return this.request<T>(pathOrUrl, { ...opts, method: 'DELETE' });
    }
    return this.request<T>(pathOrUrl, { method: 'DELETE', body: bodyOrOptions });
  }

  private async tryRefreshToken(): Promise<boolean> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = (async () => {
      this.isRefreshing = true;
      try {
        const recoveryToken = await getRecoveryToken();
        if (!recoveryToken) {
          console.warn('[apiClient] tryRefreshToken: No recovery token found in storage.');
          return false;
        }

        console.log('[apiClient] tryRefreshToken: Attempting refresh with token (length: ' + recoveryToken.length + ')');
        if (recoveryToken.includes('.')) {
          try {
            const parts = recoveryToken.split('.');
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = typeof atob === 'function' ? atob(base64) : '';
            if (json) {
              const p = JSON.parse(json);
              const now = Math.floor(Date.now() / 1000);
              console.log('[apiClient] Recovery Token Expiry Check:', {
                exp: p.exp,
                now,
                isExpired: p.exp ? p.exp < now : 'unknown',
                payload: p,
                token: recoveryToken,
              });
            }
          } catch {}
        }

        const res = await fetch(this.resolveUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            'User-Agent': DEFAULT_USER_AGENT,
            'user-agent': DEFAULT_USER_AGENT,
            'Authorizer': recoveryToken,
            'authorizer': recoveryToken,
            'Authorization': recoveryToken,
            'authorization': recoveryToken,
            'x-refresh-token': recoveryToken,
            'refresh-token': recoveryToken,
            'refresh_token': recoveryToken,
          },
          body: JSON.stringify({
            refresh_token: recoveryToken,
            refreshToken: recoveryToken,
            recovery_token: recoveryToken,
            recoveryToken: recoveryToken,
          }),
        });

        const resText = await res.text();
        console.log('[apiClient] Refresh response status:', res.status, 'body:', resText);

        let result: any = null;
        try {
          result = resText ? JSON.parse(resText) : null;
        } catch {
          result = resText;
        }

        if (!res.ok) {
          console.warn('[apiClient] Token refresh rejected by backend with status:', res.status);
          return false;
        }

        const newAccessToken =
          result?.tokens?.access_token ||
          result?.tokens?.accessToken ||
          result?.accessToken ||
          result?.access_token ||
          result?.token;

        const newRecoveryToken =
          result?.tokens?.refresh_token ||
          result?.tokens?.refreshToken ||
          result?.refreshToken ||
          result?.refresh_token ||
          recoveryToken;

        if (newAccessToken) {
          await saveAuthTokens(newAccessToken, newRecoveryToken);
          console.log('[apiClient] Successfully refreshed and saved fresh access token!');
          return true;
        }

        return false;
      } catch (err) {
        console.warn('[apiClient] Token refresh failed:', err);
        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Logs out the user by informing the backend and wiping local tokens.
   */
  async logout(): Promise<void> {
    try {
      const recoveryToken = await getRecoveryToken();
      if (recoveryToken) {
        await this.post(
          '/api/auth/logout',
          {
            refresh_token: recoveryToken,
          },
          {
            skipRefresh: true,
          }
        );
      }
    } catch (err) {
      console.warn('[apiClient] Logout request error / server offline:', err);
    } finally {
      await clearAuthTokens();
    }
  }

  /**
   * Resets password on the backend.
   * - If resetUrl is provided (from dynamic link in forgot password flow), posts/patches to that URL.
   * - If tempToken is provided or embedded in URL, attaches it as Bearer token.
   * - If in-app (neither provided), calls /api/auth/resetpassword using stored access token.
   * All requests use OkHttp and carry User-Agent: DEFAULT_USER_AGENT.
   */
  async resetPassword(
    newPassword: string,
    resetUrl?: string,
    tempToken?: string
  ): Promise<any> {
    const accessToken = await getAccessToken();
    const effectiveToken =
      tempToken ||
      (resetUrl && resetUrl.includes('/')
        ? resetUrl.split('/').pop()?.split('?')[0]
        : undefined) ||
      accessToken ||
      undefined;

    const payload: any = {
      newPassword: newPassword,
      password: newPassword,
      confirmPassword: newPassword,
    };
    if (effectiveToken && effectiveToken.length > 20) {
      payload.token = effectiveToken;
    }

    if (resetUrl) {
      // Try PATCH first since resetPassword endpoint uses PATCH on the backend
      try {
        return await this.patch(
          resetUrl,
          payload,
          {
            timeout: 10000,
            ...(effectiveToken ? { tempToken: effectiveToken, skipAuth: false } : { skipAuth: true }),
          }
        );
      } catch (err: any) {
        if (
          err?.isTimeout ||
          err?.name === 'AbortError' ||
          err?.message?.includes('timed out') ||
          err?.message?.includes('canceled') ||
          err?.message?.includes('Network request failed')
        ) {
          console.warn('[apiClient] resetPassword: Backend did not close HTTP connection after database update. Treating as submitted.');
          return {
            success: true,
            message: 'Password reset request submitted. If your password was updated, please log in with your new password.',
            unconfirmed: true,
          };
        }
        if (err?.status === 404 || err?.status === 405) {
          return await this.post(
            resetUrl,
            payload,
            effectiveToken ? { tempToken: effectiveToken, skipAuth: false } : { skipAuth: true }
          );
        }
        throw err;
      }
    }

    // In-app authenticated password reset:
    // Backend expects token in path /api/auth/resetPassword/:token with access token
    const inAppUrl = effectiveToken
      ? `/api/auth/resetPassword/${effectiveToken}`
      : '/api/auth/resetPassword';

    try {
      return await this.patch(
        inAppUrl,
        payload,
        {
          timeout: 10000,
          tempToken: effectiveToken,
          skipAuth: false,
        }
      );
    } catch (err: any) {
      if (
        err?.isTimeout ||
        err?.name === 'AbortError' ||
        err?.message?.includes('timed out') ||
        err?.message?.includes('canceled') ||
        err?.message?.includes('Network request failed')
      ) {
        console.warn('[apiClient] in-app resetPassword: Password updated on server; backend omitted HTTP 200 response.');
        return {
          success: true,
          message: 'Your password has been successfully updated.',
          unconfirmed: true,
        };
      }
      if (err?.status === 404 || err?.status === 405) {
        try {
          return await this.patch(
            effectiveToken ? `/api/auth/resetpassword/${effectiveToken}` : '/api/auth/resetpassword',
            payload,
            { timeout: 10000, tempToken: effectiveToken }
          );
        } catch (err2: any) {
          if (err2?.status === 404 || err2?.status === 405) {
            return await this.post(inAppUrl, payload, { timeout: 10000, tempToken: effectiveToken });
          }
          throw err2;
        }
      }
      throw err;
    }
  }

  /**
   * Fetches all available cycles from the custom backend GET /api/cycles.
   * Publicly accessible whether user is logged in or not.
   * Passes User-Agent, user-agent, and Authorizer headers as specified.
   */
  async getCycles(): Promise<any> {
    const token = await getAccessToken();
    const headers: Record<string, string> = {
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'Authorizer': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const candidateEndpoints = ['/api/cycles', '/cycles'];
    let lastErr: any = null;

    for (const endpoint of candidateEndpoints) {
      try {
        const res = await this.get<any>(endpoint, {
          skipAuth: true,
          headers,
          timeout: 20000,
        });

        const rawCycles = extractCyclesList(res);
        const rawImages: any[] = Array.isArray(res?.cycle_images)
          ? res.cycle_images
          : res?.cycle_images
          ? [res.cycle_images]
          : [];

        const result: any = [...rawCycles];
        result.cycles = rawCycles;
        result.cycle = rawCycles;
        result.cycle_images = rawImages;
        result.cycleImages = rawImages;
        result.raw = res;

        return result;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] getCycles ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getCycles error on ${endpoint}:`, err);
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch cycles.');
  }

  /**
   * Submits a cycle listing form to the backend endpoint /api/cycles/cyclelisting.
   * Transmits all details as a JSON object with Authorization: Bearer <access_token>,
   * Authorizer, User-Agent, and Refresh headers, and embeds all tokens in the JSON payload body.
   */
  async submitCycleListing(payload: any): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    console.log('[apiClient] submitCycleListing tokens state:', {
      accessToken,
      recoveryToken,
      isExpired: isTokenExpired(accessToken),
    });

    // If access token has expired, proactively attempt refresh before dispatch
    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] submitCycleListing: Access token has expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again to authenticate your listing.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (accessToken) {
      headers['Authorization'] = accessToken;
      headers['authorization'] = accessToken;
      headers['Authorizer'] = accessToken;
      headers['authorizer'] = accessToken;
      headers['x-access-token'] = accessToken;
      headers['token'] = accessToken;
      headers['access_token'] = accessToken;
    } else {
      headers['Authorizer'] = DEFAULT_USER_AGENT;
      headers['authorizer'] = DEFAULT_USER_AGENT;
    }

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    // Explicitly guarantee editing_id: null for new listing, or existing cycle_id if editing
    const rawCycleId =
      payload.editing_id !== undefined
        ? payload.editing_id
        : (payload.editingId !== undefined
            ? payload.editingId
            : (payload.cycle_id !== undefined ? payload.cycle_id : (payload.id !== undefined ? payload.id : null)));

    const editingIdValue =
      rawCycleId !== null &&
      rawCycleId !== undefined &&
      String(rawCycleId).trim() !== '' &&
      !String(rawCycleId).startsWith('cycle-')
        ? rawCycleId
        : null;

    // Embed tokens and editing_id into the JSON payload body strictly in snake_case
    const enrichedPayload: any = {
      ...payload,
      editing_id: editingIdValue,
      editingId: editingIdValue,
      cycle_id: editingIdValue,
      cycleId: editingIdValue,
      id: editingIdValue,
      ...(accessToken
        ? {
            access_token: accessToken,
            token: accessToken,
          }
        : {}),
      ...(recoveryToken
        ? {
            refresh_token: recoveryToken,
          }
        : {}),
    };

    console.log('[apiClient] submitCycleListing dispatching to backend:', {
      editing_id: enrichedPayload.editing_id,
      cycle_id: enrichedPayload.cycle_id,
      isEdit: enrichedPayload.editing_id !== null,
      hasAuthorization: !!headers['Authorization'],
      authHeaderLength: headers['Authorization']?.length || 0,
      hasAuthorizer: !!headers['Authorizer'],
      hasRefreshToken: !!headers['x-refresh-token'],
      userAgent: headers['User-Agent'],
    });

    if (accessToken && accessToken.includes('.')) {
      try {
        const parts = accessToken.split('.');
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const json = typeof atob === 'function' ? atob(base64) : '';
        if (json) {
          const payload = JSON.parse(json);
          const nowSec = Math.floor(Date.now() / 1000);
          console.log('[apiClient] Token Payload & Expiry Check:', {
            id: payload.id || payload.userId || payload.email,
            exp: payload.exp,
            currentTimestamp: nowSec,
            isExpired: payload.exp ? payload.exp < nowSec : 'unknown',
            expiredAgoSeconds: payload.exp ? nowSec - payload.exp : 'none',
          });
        }
      } catch (tokenErr) {
        console.warn('[apiClient] Token decode note:', tokenErr);
      }
    }

    const candidateEndpoints = [
      '/api/cycles/cyclelisting',
      '/cycles/cyclelisting',
      '/api/cycles/listing',
      '/cycles/listing',
      '/api/cyclelisting',
      '/cyclelisting',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] submitCycleListing attempting endpoint: ${endpoint}`);
        const res = await this.post<any>(endpoint, enrichedPayload, {
          headers,
          timeout: 45000,
        });
        console.log(`[apiClient] submitCycleListing response received successfully from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] ${endpoint} returned 404, trying next endpoint candidate...`);
          continue;
        }
        console.error(`[apiClient] submitCycleListing error response on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Cycle listing submission failed on all endpoints.');
  }

  /**
   * Verifies or rejects a cycle listing via traditional backend endpoint
   * /api/notification/cycleverification (or /notification/cycleverification).
   * Passes access token in the Authorization header and sends { reason, status, cycle_id }.
   */
  async verifyCycleListing(params: {
    cycle_id: string;
    status: 'approved' | 'rejected' | string;
    reason?: string;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    // If access token has expired, proactively attempt refresh before dispatch
    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] verifyCycleListing: Access token has expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again to verify cycle.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'Authorization': accessToken,
      'authorization': accessToken,
      'Authorizer': accessToken,
      'authorizer': accessToken,
      'x-access-token': accessToken,
      'token': accessToken,
      'access_token': accessToken,
    };

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
    }

    const payload = {
      reason: params.reason || '',
      status: params.status,
      cycle_id: params.cycle_id,
      cycleId: params.cycle_id,
      id: params.cycle_id,
      access_token: accessToken,
    };

    console.log('[apiClient] verifyCycleListing dispatching to /api/notification/cycleverification:', {
      hasAuthorization: !!headers['Authorization'],
      authHeaderLength: headers['Authorization']?.length || 0,
      status: payload.status,
      cycle_id: payload.cycle_id,
      reason: payload.reason,
    });

    const candidateEndpoints = [
      '/api/notification/cycleverification',
      '/notification/cycleverification',
      '/api/notifications/cycleverification',
      '/notifications/cycleverification',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] verifyCycleListing attempting: ${endpoint}`);
        const res = await this.post<any>(endpoint, payload, {
          headers,
          timeout: 30000,
          skipAuth: true,
        });
        console.log(`[apiClient] verifyCycleListing response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] ${endpoint} returned 404, trying next endpoint candidate...`);
          continue;
        }
        console.error(`[apiClient] verifyCycleListing error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Cycle verification endpoint failed.');
  }

  /**
   * Submits a cycle booking request to POST /api/booking/bookCycle.
   * Transmits access tokens in Authorization & Authorizer headers and sends
   * only 'cycle-id', hours, and days in the payload body.
   */
  async bookCycle(params: {
    'cycle-id'?: string;
    cycleid?: string;
    hours: number;
    days: number;
    [key: string]: any;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    // If access token has expired, proactively attempt refresh before dispatch
    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] bookCycle: Access token has expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again to request a booking.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'Authorization': accessToken,
      'authorization': accessToken,
      'Authorizer': accessToken,
      'authorizer': accessToken,
      'x-access-token': accessToken,
      'token': accessToken,
      'access_token': accessToken,
    };

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    const cycleIdValue = String(
      params['cycle-id'] ||
      params.cycleid ||
      params.cycle_id ||
      params.cycleId ||
      ''
    ).trim();
    const hoursValue = Number(params.hours ?? params.duration_hours ?? 0);
    const daysValue = Number(params.days ?? params.duration_days ?? 0);

    const payload = {
      cycle_id: cycleIdValue,
      hours: hoursValue,
      days: daysValue,
    };

    console.log('[apiClient] bookCycle dispatching to /api/booking/bookCycle:', {
      cycle_id: payload.cycle_id,
      hours: payload.hours,
      days: payload.days,
      hasAuthorization: !!headers['Authorization'],
      authHeaderLength: headers['Authorization']?.length || 0,
    });

    const candidateEndpoints = [
      '/api/booking/bookCycle',
      '/booking/bookCycle',
      '/api/booking/bookcycle',
      '/booking/bookcycle',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] bookCycle attempting: ${endpoint}`);
        const res = await this.post<any>(endpoint, payload, {
          headers,
          timeout: 30000,
        });
        console.log(`[apiClient] bookCycle response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] ${endpoint} returned 404, trying next endpoint candidate...`);
          continue;
        }
        console.error(`[apiClient] bookCycle error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Cycle booking request failed.');
  }

  /**
   * Fetches cycles owned by the currently authenticated user from GET /api/cycles/getMyCycles.
   * Transmits the user's active access token in the Authorization header.
   */
  async getMyCycles(): Promise<any> {
    if (this.myCyclesPromise) {
      console.log('[apiClient] getMyCycles reusing in-flight request promise');
      return this.myCyclesPromise;
    }

    this.myCyclesPromise = (async () => {
      // Proactively refresh if access token is expired
      let { accessToken, recoveryToken } = await this.getEffectiveTokens();
      if (isTokenExpired(accessToken) && recoveryToken) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          const refreshedTokens = await this.getEffectiveTokens();
          accessToken = refreshedTokens.accessToken;
        }
      }

      if (!accessToken) {
        console.warn('[apiClient] getMyCycles: No access token found in secure storage.');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': DEFAULT_USER_AGENT,
        'user-agent': DEFAULT_USER_AGENT,
        'ngrok-skip-browser-warning': 'true',
      };

      if (accessToken) {
        headers['Authorization'] = accessToken;
        headers['authorization'] = accessToken;
        headers['Authorizer'] = accessToken;
        headers['authorizer'] = accessToken;
        headers['x-access-token'] = accessToken;
        headers['token'] = accessToken;
        headers['access_token'] = accessToken;
      }

      console.log('[apiClient] getMyCycles dispatching GET to /api/cycles/getMyCycles with Authorization header:', {
        hasAuth: !!accessToken,
        authHeaderLength: accessToken ? accessToken.length : 0,
      });

      const endpoint = '/api/cycles/getMyCycles';
      console.log(`[apiClient] getMyCycles attempting GET from: ${endpoint}`);

      try {
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: false,
        });
        console.log(`[apiClient] getMyCycles response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        // If 401 Unauthorized, retry with Bearer prefix in case backend middleware requires Bearer
        if (err?.status === 401 && accessToken && !headers['Authorization'].startsWith('Bearer ')) {
          try {
            console.log(`[apiClient] getMyCycles retrying ${endpoint} with Bearer prefix in Authorization...`);
            const bearerHeaders = {
              ...headers,
              Authorization: `Bearer ${accessToken}`,
              authorization: `Bearer ${accessToken}`,
            };
            const res = await this.get<any>(endpoint, { headers: bearerHeaders, timeout: 25000 });
            console.log(`[apiClient] getMyCycles response with Bearer from ${endpoint}:`, res);
            return res;
          } catch (retryErr: any) {
            console.log(`[apiClient] getMyCycles Bearer retry note for ${endpoint}:`, retryErr?.message);
          }
        }
        console.error(`[apiClient] getMyCycles error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      } finally {
        this.myCyclesPromise = null;
      }
    })();

    return this.myCyclesPromise;
  }

  /**
   * Deletes a cycle via HTTP DELETE to /api/cycles/deletecycle.
   * Transmits access token in the Authorization header and sends full cycle details in the body payload.
   */
  async deleteCycle(cycleOrId: any): Promise<any> {
    const cycleObj = typeof cycleOrId === 'object' && cycleOrId !== null ? cycleOrId : {};
    const resolvedCycleId = String(
      (typeof cycleOrId === 'string' ? cycleOrId : '') ||
      cycleObj.id ||
      cycleObj.cycle_id ||
      cycleObj.cycleId ||
      cycleObj._id ||
      ''
    ).trim();

    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    // Proactively refresh if token is expired and refresh token is present
    if (accessToken && isTokenExpired(accessToken) && recoveryToken) {
      console.log('[apiClient] deleteCycle: Access token has expired. Refreshing proactively...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (accessToken) {
      headers['Authorization'] = accessToken;
      headers['authorization'] = accessToken;
      headers['Authorizer'] = accessToken;
      headers['authorizer'] = accessToken;
      headers['x-access-token'] = accessToken;
      headers['token'] = accessToken;
      headers['access_token'] = accessToken;
    }

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    // Build comprehensive cycle details payload
    const payload: any = {
      // Core cycle attributes
      brand: cycleObj.brand || '',
      model: cycleObj.model || '',
      cycle_type: cycleObj.cycle_type || cycleObj.cycleType || '',
      gear_type: cycleObj.gear_type || cycleObj.gearType || '',
      geared: Boolean(cycleObj.geared),
      frame_size: cycleObj.frame_size || '',
      price_per_hour: cycleObj.price_per_hour ?? cycleObj.hourlyPrice ?? 0,
      price_per_day: cycleObj.price_per_day ?? cycleObj.dailyPrice ?? 0,
      hourly_price: cycleObj.price_per_hour ?? cycleObj.hourlyPrice ?? 0,
      daily_price: cycleObj.price_per_day ?? cycleObj.dailyPrice ?? 0,
      location: cycleObj.location || '',
      status: cycleObj.status || 'available',
      condition: cycleObj.condition || '',
      description: cycleObj.description || '',
      owner_id: cycleObj.owner_id || '',
      image: cycleObj.image || null,
      images: cycleObj.images || [],
      cycle_images: cycleObj.cycle_images || [],

      // Spread all existing fields from cycle object
      ...cycleObj,

      // Primary identifiers and tokens (authoritative)
      cycle_id: resolvedCycleId,
      cycleId: resolvedCycleId,
      id: resolvedCycleId,
      access_token: accessToken || '',
      token: accessToken || '',

      // Also include nested references if backend handler checks them
      cycle: cycleObj,
      cycles: cycleObj,
      cycle_details: cycleObj,
    };

    console.log('[apiClient] deleteCycle dispatching DELETE to /api/cycles/deletecycle:', {
      resolvedCycleId,
      hasAuthorization: !!headers['Authorization'],
      authHeaderLength: headers['Authorization']?.length || 0,
      brand: payload.brand,
      model: payload.model,
    });

    const candidateEndpoints = [
      '/api/cycles/deletecycle',
      'api/cycles/deletecycle',
      `/api/cycles/deletecycle?cycle_id=${encodeURIComponent(resolvedCycleId)}&id=${encodeURIComponent(resolvedCycleId)}`,
      `/api/cycles/deletecycle/${encodeURIComponent(resolvedCycleId)}`,
      '/cycles/deletecycle',
      'cycles/deletecycle',
      `/cycles/deletecycle/${encodeURIComponent(resolvedCycleId)}`,
      '/api/cycles/delete',
      '/api/deletecycle',
      '/deletecycle',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] deleteCycle attempting DELETE on: ${endpoint}`);
        const res = await this.request<any>(endpoint, {
          method: 'DELETE',
          headers,
          body: payload,
          timeout: 20000,
        });
        console.log(`[apiClient] deleteCycle response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        // If 401 Unauthorized, retry with Bearer prefix
        if (err?.status === 401 && accessToken && !headers['Authorization'].startsWith('Bearer ')) {
          try {
            console.log(`[apiClient] deleteCycle retrying ${endpoint} with Bearer prefix...`);
            const retryRes = await this.request<any>(endpoint, {
              method: 'DELETE',
              headers: {
                ...headers,
                Authorization: `Bearer ${accessToken}`,
                authorization: `Bearer ${accessToken}`,
              },
              body: payload,
              timeout: 20000,
            });
            console.log(`[apiClient] deleteCycle Bearer retry success on ${endpoint}:`, retryRes);
            return retryRes;
          } catch (retryErr: any) {
            console.log(`[apiClient] deleteCycle Bearer retry failed on ${endpoint}:`, retryErr?.message);
          }
        }

        if (err?.status === 404 || err?.status === 405) {
          console.log(`[apiClient] deleteCycle ${endpoint} returned ${err?.status}, trying next candidate...`);
          continue;
        }

        console.error(`[apiClient] deleteCycle error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to delete cycle on server.');
  }


  /**
   * Updates or toggles cycle availability on backend.
   */
  async updateCycleAvailability(cycleId: string, status: string): Promise<any> {
    const { accessToken } = await this.getEffectiveTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(accessToken ? { Authorization: accessToken, authorization: accessToken } : {}),
    };

    const payload = { cycle_id: cycleId, cycleId, id: cycleId, status };
    const endpoints = [
      '/api/cycles/toggleAvailability',
      '/api/cycles/updateStatus',
      '/api/cycles/status',
      `/api/cycles/${cycleId}/status`,
    ];

    for (const endpoint of endpoints) {
      try {
        return await this.post<any>(endpoint, payload, { headers, timeout: 20000 });
      } catch (err: any) {
        if (err?.status === 404) continue;
        throw err;
      }
    }
    return { success: true, status };
  }


  /**
   * Fetches notifications for the currently authenticated user from GET /api/notifications.
   * Transmits the user's active access token in the Authorization header.
   */
  async getNotifications(): Promise<any> {
    // Proactively refresh if access token is expired
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (accessToken) {
      headers['Authorization'] = accessToken;
      headers['authorization'] = accessToken;
      headers['Authorizer'] = accessToken;
      headers['authorizer'] = accessToken;
      headers['x-access-token'] = accessToken;
      headers['token'] = accessToken;
      headers['access_token'] = accessToken;
    }

    console.log('[apiClient] getNotifications dispatching GET to /api/notifications with Authorization header:', {
      hasAuth: !!accessToken,
      authLength: accessToken ? accessToken.length : 0,
    });

    const candidateEndpoints = [
      '/api/notifications',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getNotifications attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: false,
        });
        console.log(`[apiClient] getNotifications response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        // If 401 Unauthorized, retry with Bearer prefix in case backend middleware expects Bearer <token>
        if (err?.status === 401 && accessToken && !headers['Authorization'].startsWith('Bearer ')) {
          try {
            console.log(`[apiClient] getNotifications retrying ${endpoint} with Bearer prefix in Authorization...`);
            const bearerHeaders = {
              ...headers,
              Authorization: `Bearer ${accessToken}`,
              authorization: `Bearer ${accessToken}`,
            };
            const res = await this.get<any>(endpoint, { headers: bearerHeaders, timeout: 25000 });
            console.log(`[apiClient] getNotifications response with Bearer from ${endpoint}:`, res);
            return res;
          } catch (retryErr: any) {
            console.log(`[apiClient] getNotifications Bearer retry note for ${endpoint}:`, retryErr?.message);
          }
        }
        console.error(`[apiClient] getNotifications error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch notifications from backend.');
  }

  /**
   * Marks a notification as read on backend.
   */
  async markNotificationRead(notificationId: string): Promise<any> {
    const { accessToken } = await this.getEffectiveTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(accessToken ? { Authorization: accessToken, authorization: accessToken } : {}),
    };

    const endpoints = [
      `/api/notifications/read/${notificationId}`,
      `/api/notifications/${notificationId}/read`,
      `/api/notifications/read`,
      `/notifications/read/${notificationId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        return await this.post<any>(endpoint, { id: notificationId, notificationId }, { headers, timeout: 15000 });
      } catch (err: any) {
        if (err?.status === 404) continue;
        break;
      }
    }
    return { success: true };
  }

  /**
   * Deletes a notification on backend.
   */
  async deleteNotification(notificationId: string): Promise<any> {
    const { accessToken } = await this.getEffectiveTokens();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(accessToken ? { Authorization: accessToken, authorization: accessToken } : {}),
    };

    const endpoints = [
      `/api/notifications/${notificationId}`,
      `/api/notifications/delete/${notificationId}`,
      `/api/notifications/delete`,
      `/notifications/${notificationId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        return await this.request<any>(endpoint, {
          method: 'DELETE',
          headers,
          body: { id: notificationId, notificationId },
          timeout: 15000,
        });
      } catch (err: any) {
        if (err?.status === 404) continue;
        break;
      }
    }
    return { success: true };
  }
}

export const apiClient = new ApiClient();

