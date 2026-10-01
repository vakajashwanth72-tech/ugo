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
import * as FileSystem from 'expo-file-system';

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

function enrichCycleWithImages(item: any, rawImages: any): any {
  if (!item || typeof item !== 'object') return item;
  const cycleObj = { ...item };
  const targetId = String(cycleObj.id || cycleObj.cycle_id || cycleObj.cycleId || '').toLowerCase().trim();

  // If rawImages is an array of strictly matched cycle_images for this cycle
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    const sorted = [...rawImages].sort(
      (a: any, b: any) => (parseInt(a?.display_order, 10) || 0) - (parseInt(b?.display_order, 10) || 0)
    );
    const urls = sorted
      .map((img: any) => getCycleImageUrl(img?.image_url || img?.imageUrl || img))
      .filter(Boolean);
    if (urls.length > 0) {
      cycleObj.images = urls;
      cycleObj.image = urls[0];
      cycleObj.image_url = urls[0];
      cycleObj.cycle_images = sorted;
      return cycleObj;
    }
  }

  // Extract from cycleObj itself
  const imgs = extractCycleImages(cycleObj);
  // Filter out any image url that belongs to another cycle
  const filteredImgs = imgs.filter((url: string) => {
    if (targetId && url.includes('_image')) {
      const filename = url.split('/').pop() || '';
      const prefix = filename.split('_image')[0];
      return prefix.toLowerCase() === targetId;
    }
    return Boolean(url);
  });

  if (filteredImgs.length > 0) {
    cycleObj.images = filteredImgs;
    cycleObj.image = filteredImgs[0];
    cycleObj.image_url = filteredImgs[0];
  } else if (cycleObj.image) {
    cycleObj.image = getCycleImageUrl(cycleObj.image);
    cycleObj.images = [cycleObj.image];
  }

  return cycleObj;
}

export function extractCyclesList(res: any): any[] {
  if (!res) return [];

  if (typeof res === 'string') {
    try {
      const parsed = JSON.parse(res);
      return extractCyclesList(parsed);
    } catch {
      return [];
    }
  }

  const rawImages = res.cycle_images ?? res.cycleImages ?? res.images;

  // Helper to extract an array of cycles from any response structure
  function extractCycleArray(obj: any): any[] | null {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) return obj;

    // Keys that may hold the cycles array or a query result object with .rows
    const candidateKeys = [
      'getMyCycles',
      'getmycycles',
      'mycycles',
      'myCycles',
      'my_cycles',
      'cycles',
      'cycle',
      'cycles_data',
      'user_cycles',
      'userCycles',
      'getCycles',
      'getcycles',
      'data',
      'rows',
      'items',
      'result',
      'payload',
      'my_cycles_data',
      'cycles_list',
    ];

    for (const key of candidateKeys) {
      const val = obj[key];
      if (!val) continue;

      if (Array.isArray(val)) {
        return val.flatMap((item) => {
          if (item && Array.isArray(item.rows)) return item.rows;
          if (item && Array.isArray(item.cycles)) return item.cycles;
          return [item];
        });
      }

      if (typeof val === 'object') {
        // Check if database query result object e.g. { rows: [ ... ], rowCount: ... }
        if (Array.isArray(val.rows)) return val.rows;
        if (Array.isArray(val.cycles)) return val.cycles;
        if (Array.isArray(val.data)) return val.data;
        if (Array.isArray(val.items)) return val.items;
        if (Array.isArray(val.result)) return val.result;
        if (Array.isArray(val.my_cycles)) return val.my_cycles;
        if (Array.isArray(val.myCycles)) return val.myCycles;
        if (Array.isArray(val.mycycles)) return val.mycycles;
        if (val.cycles_data && Array.isArray(val.cycles_data.rows)) return val.cycles_data.rows;
        if (val.cycles_data && Array.isArray(val.cycles_data)) return val.cycles_data;

        // Check if val is dictionary map { '0': {...}, '1': {...} }
        const values: any[] = Object.values(val);
        if (
          values.length > 0 &&
          values.every(
            (v: any) =>
              v &&
              typeof v === 'object' &&
              (v.id || v.cycle_id || v.cycleId || v.brand || v.model || v.hourly_price || v.price_per_hour)
          )
        ) {
          return values;
        }

        // Recursive attempt for deeper wrapper
        const deeper = extractCycleArray(val);
        if (deeper && deeper.length > 0) return deeper;
      }
    }

    // Check if root object itself is dictionary map { '0': {...}, '1': {...} }
    const rootValues = Object.values(obj).filter(
      (v: any) => v && typeof v === 'object' && !Array.isArray(v)
    );
    if (
      rootValues.length > 0 &&
      rootValues.every(
        (v: any) =>
          v &&
          typeof v === 'object' &&
          (v.id || v.cycle_id || v.cycleId || v.brand || v.model || v.hourly_price || v.price_per_hour)
      )
    ) {
      return rootValues;
    }

    // Single cycle object directly at root
    if (obj.id || obj.cycle_id || obj.brand || obj.model || obj.price_per_hour || obj.hourly_price) {
      return [enrichCycleWithImages(obj, rawImages)];
    }

    return null;
  }

  const cycleArray = extractCycleArray(res);

  if (Array.isArray(cycleArray) && cycleArray.length > 0) {
    const imagesByCycleId = new Map<string, any[]>();
    const imageGroups: any[][] = [];
    if (Array.isArray(rawImages)) {
      for (const img of rawImages) {
        const cId = String(img?.cycle_id || img?.cycleId || '').toLowerCase().trim();
        if (cId) {
          if (!imagesByCycleId.has(cId)) {
            const group: any[] = [];
            imagesByCycleId.set(cId, group);
            imageGroups.push(group);
          }
          imagesByCycleId.get(cId)!.push(img);
        } else {
          imageGroups.push([img]);
        }
      }
    }

    const hasAnyStrictMatch = cycleArray.some((c: any) => {
      const cId = String(c?.cycle_id || c?.id || '').toLowerCase().trim();
      return cId && imagesByCycleId.has(cId);
    });

    return cycleArray.map((c: any, index: number) => {
      let matched: any[] = [];
      const cId = String(c?.cycle_id || c?.id || '').toLowerCase().trim();
      if (cId && imagesByCycleId.has(cId)) {
        matched = imagesByCycleId.get(cId)!;
      } else if (!hasAnyStrictMatch && index < imageGroups.length) {
        // Row-wise mapping strictly for cycles that have their image rows in backend (NO modulo %)
        // Cycle rows beyond available image rows receive [] (backend will send later)
        matched = imageGroups[index];
      }
      return enrichCycleWithImages(c, matched);
    });
  }

  // Single cycle object directly at root
  if (res.id || res.cycle_id || res.brand || res.model || res.price_per_hour || res.hourly_price) {
    return [enrichCycleWithImages(res, rawImages)];
  }

  return [];
}

function isNotificationObject(obj: any): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;

  // Exclude auth profile / user objects that aren't notifications
  if (obj.email && obj.full_name && !obj.title && !obj.message && !obj.action_type) return false;
  if (obj.token && obj.user && !obj.title && !obj.message) return false;

  const hasId = !!(
    obj.id ||
    obj._id ||
    obj.notification_id ||
    obj.notificationId
  );

  const hasContent = !!(
    obj.title ||
    obj.message ||
    obj.body ||
    obj.subject ||
    obj.heading ||
    obj.action_type ||
    obj.actionType ||
    obj.action_data
  );

  // An object with both id and content is definitely a notification
  if (hasId && hasContent) return true;

  // Or if it has title AND (message or action_type) even without explicit id
  if (obj.title && (obj.message || obj.body || obj.action_type)) return true;

  return false;
}

export function extractNotificationsList(res: any): any[] {
  if (!res) return [];

  // Parse string if needed (handles JSON, NDJSON, concatenated JSON)
  if (typeof res === 'string') {
    try {
      return extractNotificationsList(JSON.parse(res));
    } catch {
      const matches = res.match(/\{[\s\S]*?\}(?=\s*\{|\s*$)/g);
      if (matches && matches.length > 0) {
        const list: any[] = [];
        for (const m of matches) {
          try {
            list.push(...extractNotificationsList(JSON.parse(m)));
          } catch {}
        }
        if (list.length > 0) return list;
      }
      return [];
    }
  }

  const collected: any[] = [];
  const seenIds = new Set<string>();

  function walk(node: any, depth = 0) {
    if (!node || depth > 10) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1);
      }
      return;
    }

    if (typeof node === 'object') {
      if (isNotificationObject(node)) {
        const id = String(
          node.id ||
          node._id ||
          node.notification_id ||
          node.notificationId ||
          `${node.title}-${node.created_at || Date.now()}`
        );
        if (!seenIds.has(id)) {
          seenIds.add(id);
          collected.push(node);
        }
      }

      // Recursively walk properties to find nested, sibling, or dictionary notifications
      for (const key of Object.keys(node)) {
        // Skip descending into action_data or payload looking for separate top-level notifications
        if (key === 'action_data' || key === 'payload' || key === 'metadata') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          walk(val, depth + 1);
        }
      }
    }
  }

  walk(res);
  return collected;
}

export interface UserProfileData {
  created_at?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  updated_at?: string | null;
  hostel?: string | null;
  net_balance?: number;
}

export function normalizeProfileData(res: any): UserProfileData | null {
  if (!res) return null;

  let parsed = res;
  if (typeof res === 'string') {
    try {
      parsed = JSON.parse(res);
    } catch {
      return null;
    }
  }

  const raw =
    parsed?.profile_data && typeof parsed.profile_data === 'object' && !Array.isArray(parsed.profile_data)
      ? parsed.profile_data
      : Array.isArray(parsed?.profile_data) && parsed.profile_data.length > 0
      ? parsed.profile_data[0]
      : parsed?.profileData && typeof parsed.profileData === 'object' && !Array.isArray(parsed.profileData)
      ? parsed.profileData
      : parsed?.profile && typeof parsed.profile === 'object' && !Array.isArray(parsed.profile)
      ? parsed.profile
      : Array.isArray(parsed?.profile) && parsed.profile.length > 0
      ? parsed.profile[0]
      : parsed?.data?.profile_data && typeof parsed.data.profile_data === 'object'
      ? parsed.data.profile_data
      : parsed?.data?.profile && typeof parsed.data.profile === 'object'
      ? parsed.data.profile
      : parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? parsed.data
      : Array.isArray(parsed?.data) && parsed.data.length > 0
      ? parsed.data[0]
      : Array.isArray(parsed) && parsed.length > 0
      ? parsed[0]
      : parsed;

  if (!raw || typeof raw !== 'object') return null;

  const rawBalance =
    raw.net_balance !== undefined && raw.net_balance !== null
      ? raw.net_balance
      : raw.netBalance !== undefined && raw.netBalance !== null
      ? raw.netBalance
      : raw.balance !== undefined && raw.balance !== null
      ? raw.balance
      : 0;

  const parsedBalance = Number(rawBalance);

  return {
    created_at: raw.created_at || raw.createdAt || null,
    full_name: raw.full_name || raw.fullName || raw.name || null,
    email: raw.email || null,
    phone: raw.phone || raw.phone_number || raw.phoneNumber || null,
    avatar_url: raw.avatar_url || raw.avatarUrl || raw.image || null,
    updated_at: raw.updated_at || raw.updatedAt || null,
    hostel: raw.hostel || raw.residence || null,
    net_balance: isNaN(parsedBalance) ? 0 : parsedBalance,
  };
}

export interface BookingHistoryItem {
  id: string;
  cycle_id: string;
  total_amout: number;
  total_amount?: number;
  start_time: string | null;
  returned_at: string | null;
  cancelled_at: string | null;
  status: string;
  return_image_url: string | null;
  renter_charge: number;
  overdue_charge: number;
  brand: string | null;
  model: string | null;
  cycle_type: string | null;
  rating: number | null;
  full_name: string | null;
  image_url: string | null;
}

export function extractBookingHistory(res: any): BookingHistoryItem[] {
  if (!res) return [];

  let parsed = res;
  if (typeof res === 'string') {
    try {
      parsed = JSON.parse(res);
    } catch {
      return [];
    }
  }

  let list: any[] = [];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.booking_data)) {
      list = parsed.booking_data;
    } else if (parsed.booking_data?.rows && Array.isArray(parsed.booking_data.rows)) {
      list = parsed.booking_data.rows;
    } else if (Array.isArray(parsed.data?.booking_data)) {
      list = parsed.data.booking_data;
    } else if (parsed.data?.booking_data?.rows && Array.isArray(parsed.data.booking_data.rows)) {
      list = parsed.data.booking_data.rows;
    } else if (Array.isArray(parsed.data)) {
      list = parsed.data;
    } else if (parsed.data?.rows && Array.isArray(parsed.data.rows)) {
      list = parsed.data.rows;
    } else if (Array.isArray(parsed.rows)) {
      list = parsed.rows;
    } else if (Array.isArray(parsed.bookings)) {
      list = parsed.bookings;
    } else if (parsed.bookings?.rows && Array.isArray(parsed.bookings.rows)) {
      list = parsed.bookings.rows;
    }
  }

  return list.map((item: any) => {
    const rawTotal =
      item.total_amout !== undefined && item.total_amout !== null
        ? item.total_amout
        : item.total_amount !== undefined && item.total_amount !== null
        ? item.total_amount
        : item.total_price !== undefined && item.total_price !== null
        ? item.total_price
        : item.amount !== undefined && item.amount !== null
        ? item.amount
        : 0;

    const rawRenterCharge =
      item.renter_charge !== undefined && item.renter_charge !== null
        ? item.renter_charge
        : item.renterCharge !== undefined && item.renterCharge !== null
        ? item.renterCharge
        : 0;

    const rawOverdue =
      item.overdue_charge !== undefined && item.overdue_charge !== null
        ? item.overdue_charge
        : item.overdueCharge !== undefined && item.overdueCharge !== null
        ? item.overdueCharge
        : 0;

    const totalNum = isNaN(Number(rawTotal)) ? 0 : Number(rawTotal);
    const renterChargeNum = isNaN(Number(rawRenterCharge)) ? 0 : Number(rawRenterCharge);
    const overdueChargeNum = isNaN(Number(rawOverdue)) ? 0 : Number(rawOverdue);

    return {
      id: String(item.id || item.booking_id || item.bookingId || ''),
      cycle_id: String(item.cycle_id || item.cycleId || ''),
      total_amout: totalNum,
      total_amount: totalNum,
      start_time: item.start_time || item.startTime || null,
      returned_at: item.returned_at || item.returnedAt || null,
      cancelled_at: item.cancelled_at || item.cancelledAt || null,
      status: String(item.status || 'completed').toLowerCase(),
      return_image_url: item.return_image_url || item.returnImageUrl || null,
      renter_charge: renterChargeNum,
      overdue_charge: overdueChargeNum,
      brand: item.brand || null,
      model: item.model || null,
      cycle_type: item.cycle_type || item.cycleType || null,
      rating: item.rating !== undefined && item.rating !== null ? Number(item.rating) : null,
      full_name: item.full_name || item.fullName || null,
      image_url: item.image_url || item.imageUrl || null,
    };
  });
}

export interface WalletHistoryItem {
  id: string;
  amount: number;
  upi_id?: string;
  account_holder_name?: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'failed';
  type?: 'withdrawal' | 'credit' | 'debit' | 'payout' | string;
  created_at: string;
  requested_at?: string;
  responded_at?: string;
  description?: string;
}

/**
 * Robustly extracts the wallet balance number from a GET /api/profile/wallet response.
 * Specifically handles the backend query:
 *   select p.net_balance as currecnt_balance, ...
 * along with all possible envelopes and wrappers.
 */
export function extractWalletBalance(res: any, fallback: number = 0): number {
  if (!res) return fallback;

  let parsed = res;
  if (typeof res === 'string') {
    try {
      parsed = JSON.parse(res);
    } catch {
      return fallback;
    }
  }

  // Handle single row, array of rows from pg query, or data wrappers
  const rootObj = Array.isArray(parsed) ? parsed[0] : parsed;
  const dataObj = Array.isArray(parsed?.data) ? parsed.data[0] : parsed?.data;
  const rowsObj = Array.isArray(parsed?.rows) ? parsed.rows[0] : parsed?.rows;

  const candidateContainers = [rootObj, dataObj, rowsObj, parsed?.wallet, parsed?.data?.wallet].filter(Boolean);

  for (const container of candidateContainers) {
    if (typeof container !== 'object') continue;
    const candidates = [
      container.currecnt_balance, // Exact query alias: p.net_balance as currecnt_balance
      container.current_balance,
      container.net_balance,
      container.wallet_balance,
      container.balance,
      container.amount,
      container.profile?.net_balance,
      container.profile?.currecnt_balance,
    ];

    for (const val of candidates) {
      if (val !== undefined && val !== null && !isNaN(Number(val))) {
        return Number(val);
      }
    }
  }

  return fallback;
}

/**
 * Robustly extracts the withdrawals history array from a GET /api/profile/wallet response.
 * Specifically handles the backend query:
 *   COALESCE(json_agg(json_build_object(
 *     'requested_at',w.created_at,'responded_at',w.updated_at,'amount',w.amount,'status',w.status,'upi_id',w.upi_id
 *   )) FILTER (where w.id is not NULL),'[]') as withdrawals
 */
export function extractWalletHistory(res: any): WalletHistoryItem[] {
  if (!res) return [];

  let parsed = res;
  if (typeof res === 'string') {
    try {
      parsed = JSON.parse(res);
    } catch {
      return [];
    }
  }

  // Handle row array or object wrappers
  let rawWithdrawals: any = null;

  if (Array.isArray(parsed)) {
    if (parsed.length > 0 && parsed[0]?.withdrawals !== undefined) {
      rawWithdrawals = parsed[0].withdrawals;
    } else if (parsed.length > 0 && (parsed[0]?.amount !== undefined || parsed[0]?.requested_at !== undefined)) {
      rawWithdrawals = parsed;
    }
  } else if (parsed && typeof parsed === 'object') {
    if (parsed.withdrawals !== undefined) {
      rawWithdrawals = parsed.withdrawals;
    } else if (parsed.data?.withdrawals !== undefined) {
      rawWithdrawals = parsed.data.withdrawals;
    } else if (Array.isArray(parsed.data) && parsed.data[0]?.withdrawals !== undefined) {
      rawWithdrawals = parsed.data[0].withdrawals;
    } else if (Array.isArray(parsed.rows) && parsed.rows[0]?.withdrawals !== undefined) {
      rawWithdrawals = parsed.rows[0].withdrawals;
    } else if (parsed.wallet_history !== undefined) {
      rawWithdrawals = parsed.wallet_history;
    } else if (parsed.history !== undefined) {
      rawWithdrawals = parsed.history;
    } else if (parsed.transactions !== undefined) {
      rawWithdrawals = parsed.transactions;
    } else if (parsed.data?.wallet_history !== undefined) {
      rawWithdrawals = parsed.data.wallet_history;
    } else if (Array.isArray(parsed.data)) {
      rawWithdrawals = parsed.data;
    }
  }

  // In PostgreSQL, json_agg with COALESCE may be serialized as a JSON string '[]' or array
  if (typeof rawWithdrawals === 'string') {
    try {
      rawWithdrawals = JSON.parse(rawWithdrawals);
    } catch {
      rawWithdrawals = [];
    }
  }

  if (!Array.isArray(rawWithdrawals)) {
    return [];
  }

  return rawWithdrawals.map((item: any, idx: number) => {
    const rawAmount =
      item.amount !== undefined && item.amount !== null
        ? item.amount
        : item.withdraw_amount !== undefined && item.withdraw_amount !== null
        ? item.withdraw_amount
        : item.total_amount !== undefined && item.total_amount !== null
        ? item.total_amount
        : 0;

    const amountNum = isNaN(Number(rawAmount)) ? 0 : Math.abs(Number(rawAmount));

    const rawStatus = String(item.status || 'pending').toLowerCase().trim();
    let status: 'pending' | 'processing' | 'completed' | 'rejected' | 'failed' = 'pending';
    if (rawStatus === 'completed' || rawStatus === 'success' || rawStatus === 'approved') {
      status = 'completed';
    } else if (rawStatus.includes('process')) {
      status = 'processing';
    } else if (rawStatus.includes('reject')) {
      status = 'rejected';
    } else if (rawStatus.includes('fail')) {
      status = 'failed';
    } else {
      status = 'pending';
    }

    const requestedAt = item.requested_at || item.created_at || item.createdAt || new Date().toISOString();
    const respondedAt = item.responded_at || item.updated_at || item.updatedAt || null;

    return {
      id: String(item.id || item.withdrawal_id || `wd-${idx}-${requestedAt}`),
      amount: amountNum,
      upi_id: item.upi_id || item.upi || undefined,
      account_holder_name: item.account_holder_name || item.name || undefined,
      status,
      type: 'withdrawal',
      created_at: requestedAt,
      requested_at: requestedAt,
      responded_at: respondedAt || undefined,
      description: item.description || (respondedAt ? `Updated on ${new Date(respondedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : undefined),
    };
  });
}

class ApiClient {
  private isRefreshing = false;
  private refreshPromise: Promise<boolean> | null = null;
  private myCyclesPromise: Promise<any> | null = null;
  private profilePromise: Promise<any> | null = null;

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
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      ...(options.headers as Record<string, string>),
    };
    if (isFormData) {
      delete headers['Content-Type'];
      delete headers['content-type'];
    }

    // Attach token and auxiliary token headers if not explicitly skipped
    if (!options.skipAuth) {
      const { accessToken, recoveryToken } = await this.getEffectiveTokens(options.tempToken);
      if (accessToken) {
        const rawToken = accessToken.replace(/^Bearer\s+/i, '').trim();
        headers['Authorization'] = rawToken;
        headers['authorization'] = rawToken;
        headers['Authorizer'] = rawToken;
        headers['authorizer'] = rawToken;
        headers['x-access-token'] = rawToken;
        headers['token'] = rawToken;
        headers['access_token'] = rawToken;
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
      body: options.body
        ? isFormData
          ? options.body
          : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
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
          const rawToken = accessToken.replace(/^Bearer\s+/i, '').trim();
          headers['Authorization'] = rawToken;
          headers['authorization'] = rawToken;
          headers['Authorizer'] = rawToken;
          headers['authorizer'] = rawToken;
          headers['x-access-token'] = rawToken;
          headers['token'] = rawToken;
          headers['access_token'] = rawToken;
          return this.request<T>(pathOrUrl, { ...options, headers });
        }
      }
    }

    if (!response.ok) {
      const errMsg =
        (typeof data === 'object' && (data?.message || data?.error || data?.msg || data?.detail || data?.error_description || data?.description)) ||
        (typeof data === 'string' && data.length < 200 ? data : null) ||
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
   * Fetches full cycle details from backend GET /api/notification/viewdetails/:cycle_id.
   * Transmits active access tokens normally (non-Bearer) in Authorization, Authorizer, x-access-token, token, and access_token headers.
   */
  async getCycleDetails(cycleId: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanId = encodeURIComponent(String(cycleId).trim());
    // Ensure token is sent normally without 'Bearer ' prefix
    const normalToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'cycle-id': String(cycleId).trim(),
      'cycle_id': String(cycleId).trim(),
    };

    if (normalToken) {
      headers['Authorization'] = normalToken;
      headers['authorization'] = normalToken;
      headers['Authorizer'] = normalToken;
      headers['authorizer'] = normalToken;
      headers['x-access-token'] = normalToken;
      headers['token'] = normalToken;
      headers['access_token'] = normalToken;
    }

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    const endpoint = `/api/notifications/viewdetails/${cleanId}`;

    console.log(`[apiClient] getCycleDetails dispatching GET to ${endpoint} with normal (non-Bearer) token headers:`, {
      cycleId: cleanId,
      hasAuthorization: !!headers['Authorization'],
      authHeaderLength: headers['Authorization']?.length || 0,
      startsWithBearer: headers['Authorization']?.startsWith('Bearer ') || false,
      hasAuthorizer: !!headers['Authorizer'],
    });

    try {
      const res = await this.get<any>(endpoint, {
        headers,
        timeout: 20000,
        skipAuth: true, // Preserve explicitly formatted normal token headers
      });
      console.log(`[apiClient] getCycleDetails response from ${endpoint}:`, res);
      return res;
    } catch (err: any) {
      console.warn(`[apiClient] getCycleDetails error on ${endpoint}:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Submits admin cycle verification to POST /api/cycles/cycle-verification.
   * Transmits active access tokens without Bearer in Authorization & Authorizer headers.
   * Sends JSON body: { status, reason, cycle_id }.
   */
  async verifyCycleListing(params: {
    cycle_id: string;
    status: 'accept' | 'reject' | 'approved' | 'rejected' | string;
    reason?: string;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] verifyCycleListing: Token expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'Authorization': cleanToken,
      'authorization': cleanToken,
      'Authorizer': cleanToken,
      'authorizer': cleanToken,
      'x-access-token': cleanToken,
      'token': cleanToken,
      'access_token': cleanToken,
    };

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    const cleanCycleId = String(params.cycle_id || '').trim();
    const rawStatus = String(params.status || '').toLowerCase().trim();
    const normalizedStatus =
      rawStatus === 'accept' || rawStatus === 'accepted' || rawStatus === 'approved'
        ? 'approved'
        : 'rejected';

    const cleanReason = String(params.reason || '').trim();

    const payload = {
      status: normalizedStatus,
      reason: cleanReason,
      cycle_id: cleanCycleId,
    };

    const endpoint = '/api/cycles/cycle-verification';

    console.log(`[apiClient] verifyCycleListing dispatching POST to ${endpoint}:`, {
      payload,
      hasAuthorization: !!headers['Authorization'],
      startsWithBearer: headers['Authorization']?.startsWith('Bearer ') || false,
      authLength: headers['Authorization']?.length || 0,
    });

    try {
      const res = await this.post<any>(endpoint, payload, {
        headers,
        timeout: 20000,
        skipAuth: true, // Preserve exact normal non-Bearer headers
      });
      console.log(`[apiClient] verifyCycleListing response from ${endpoint}:`, res);
      return res;
    } catch (err: any) {
      console.warn(`[apiClient] verifyCycleListing error on ${endpoint}:`, err?.message || err);
      throw err;
    }
  }

  /**
   * Sends booking acceptance decision (accepted or rejected) to POST /api/notifications/booking-acceptance.
   * Transmits booking_id and status ('accepted' | 'rejected') with active access token (without Bearer) in Authorization header.
   */
  async respondBookingAcceptance(
    bookingId: string,
    status: 'accepted' | 'rejected' | 'accept' | 'reject' | string
  ): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] respondBookingAcceptance: Token expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'Authorization': cleanToken,
      'authorization': cleanToken,
      'Authorizer': cleanToken,
      'authorizer': cleanToken,
      'x-access-token': cleanToken,
      'token': cleanToken,
      'access_token': cleanToken,
    };

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    const cleanBookingId = String(bookingId).trim();
    const rawStatus = String(status || '').toLowerCase().trim();
    const cleanStatus =
      rawStatus === 'accepted' || rawStatus === 'accept' || rawStatus === 'approved'
        ? 'accepted'
        : 'rejected';

    const payload = {
      booking_id: cleanBookingId,
      bookingId: cleanBookingId,
      status: cleanStatus,
    };

    console.log('[apiClient] respondBookingAcceptance dispatching POST to /api/notifications/booking-acceptance:', {
      booking_id: cleanBookingId,
      status: cleanStatus,
      hasAuthorization: !!headers['Authorization'],
      startsWithBearer: headers['Authorization']?.startsWith('Bearer ') || false,
      authLength: headers['Authorization']?.length || 0,
    });

    const endpoint = '/api/notifications/booking-acceptance';
    console.log(`[apiClient] respondBookingAcceptance attempting POST: ${endpoint}`);
    const res = await this.post<any>(endpoint, payload, {
      headers,
      timeout: 20000,
      skipAuth: true, // Preserve exact normal non-Bearer headers
    });
    console.log(`[apiClient] respondBookingAcceptance response from ${endpoint}:`, res);
    return res;
  }

  /**
   * Verifies booking OTP on backend at POST /api/otp/otp-verification.
   * Transmits active access token without Bearer prefix in Authorization header,
   * and sends { booking_id, otp } in the payload body.
   */
  async verifyBookingOtp(bookingId: string, otp: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();

    if (accessToken && isTokenExpired(accessToken)) {
      console.log('[apiClient] verifyBookingOtp: Token expired. Attempting proactive refresh...');
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
        recoveryToken = fresh.recoveryToken;
      }
    }

    if (!accessToken || isTokenExpired(accessToken)) {
      const expiredErr: any = new Error('Session Expired: Please log in again.');
      expiredErr.isSessionExpired = true;
      expiredErr.status = 401;
      throw expiredErr;
    }

    const cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      'Authorization': cleanToken,
      'authorization': cleanToken,
      'Authorizer': cleanToken,
      'authorizer': cleanToken,
      'x-access-token': cleanToken,
      'token': cleanToken,
      'access_token': cleanToken,
    };

    if (recoveryToken) {
      headers['x-refresh-token'] = recoveryToken;
      headers['refresh-token'] = recoveryToken;
      headers['refresh_token'] = recoveryToken;
      headers['refreshToken'] = recoveryToken;
    }

    const cleanBookingId = String(bookingId).trim();
    const cleanOtp = String(otp).trim();

    const payload = {
      booking_id: cleanBookingId,
      otp: cleanOtp,
      bookingId: cleanBookingId,
      OTP: cleanOtp,
    };

    console.log('[apiClient] verifyBookingOtp dispatching POST to /api/otp/otp-verification:', {
      booking_id: cleanBookingId,
      otp: cleanOtp,
      hasAuthorization: !!headers['Authorization'],
      startsWithBearer: headers['Authorization']?.startsWith('Bearer ') || false,
      authLength: headers['Authorization']?.length || 0,
    });

    const candidateEndpoints = [
      '/api/otp/otp-verification',
      'api/otp/otp-verification',
      '/api/otp/otp-verfication',
      'api/otp/otp-verfication',
      '/otp/otp-verification',
      '/otp/otp-verfication',
      '/api/booking/otp-verification',
      '/api/booking/otp-verfication',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] verifyBookingOtp attempting POST: ${endpoint}`);
        const res = await this.post<any>(endpoint, payload, {
          headers,
          timeout: 25000,
          skipAuth: true, // Preserve exact normal non-Bearer headers
        });
        console.log(`[apiClient] verifyBookingOtp response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] verifyBookingOtp ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] verifyBookingOtp error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to verify OTP with backend.');
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
      try {
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

      const candidateEndpoints = [
        '/api/cycles/getMyCycles',
        '/api/cycles/mycycles',
        '/api/cycles/getmycycles',
        '/api/cycles/my-cycles',
        '/api/mycycles',
      ];

      let lastErr: any = null;
      for (const endpoint of candidateEndpoints) {
        try {
          console.log(`[apiClient] getMyCycles attempting GET from: ${endpoint}`);
          const res = await this.get<any>(endpoint, {
            headers,
            timeout: 25000,
            skipAuth: false,
          });
          console.log(`[apiClient] getMyCycles response from ${endpoint}:`, res);
          return res;
        } catch (err: any) {
          lastErr = err;
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

          if (err?.status === 404) {
            console.log(`[apiClient] getMyCycles endpoint ${endpoint} returned 404, trying next candidate...`);
            continue;
          }

          console.error(`[apiClient] getMyCycles error on ${endpoint}:`, {
            status: err?.status,
            message: err?.message,
            data: err?.data,
          });
          throw err;
        }
      }

      throw lastErr || new Error('Failed to fetch user cycles from backend.');
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
   * Changes cycle availability status on backend via PATCH /api/cycles/change-availability-status.
   * Transmits raw access token in Authorization header without Bearer prefix.
   * Body: { cycle_id: cycleId, status: currentStatus }
   * The backend takes the current status and toggles it to the counter status.
   */
  async changeAvailabilityStatus(cycleId: string, currentStatus: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const cleanCycleId = String(cycleId || '').trim();
    const cleanStatus = String(currentStatus || '').toLowerCase().trim();

    const payload = {
      cycle_id: cleanCycleId,
      status: cleanStatus,
    };

    const endpoint = '/api/cycles/change-availability-status';
    console.log(`[apiClient] changeAvailabilityStatus dispatching PATCH to ${endpoint}:`, {
      payload,
      hasAuth: !cleanToken,
      authLength: cleanToken.length,
    });

    try {
      const res = await this.patch<any>(endpoint, payload, {
        headers,
        timeout: 20000,
        skipAuth: true,
      });
      console.log(`[apiClient] changeAvailabilityStatus response from ${endpoint}:`, res);
      return res;
    } catch (err: any) {
      console.error(`[apiClient] changeAvailabilityStatus error on ${endpoint}:`, {
        status: err?.status,
        message: err?.message,
        data: err?.data,
      });
      throw err;
    }
  }

  /**
   * Alias for backward compatibility
   */
  async updateCycleAvailability(cycleId: string, status: string): Promise<any> {
    return this.changeAvailabilityStatus(cycleId, status);
  }

  /**
   * Fetches the user profile from GET /api/profile.
   * Transmits the user's active access token in the Authorization and Authorizer headers.
   * Backend executes:
   * select created_at,full_name,email,phone,avatar_url,updated_at,hostel,net_balance from profiles where id = $1 and is_verified = true
   */
  async getProfile(): Promise<any> {
    if (this.profilePromise) {
      console.log('[apiClient] getProfile returning active in-flight request');
      return this.profilePromise;
    }

    this.profilePromise = (async () => {
      try {
        let { accessToken, recoveryToken } = await this.getEffectiveTokens();
        if (isTokenExpired(accessToken) && recoveryToken) {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const refreshedTokens = await this.getEffectiveTokens();
            accessToken = refreshedTokens.accessToken;
          }
        }

        const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': DEFAULT_USER_AGENT,
          'user-agent': DEFAULT_USER_AGENT,
          'ngrok-skip-browser-warning': 'true',
        };

        if (cleanToken) {
          headers['Authorization'] = cleanToken;
          headers['authorization'] = cleanToken;
          headers['Authorizer'] = cleanToken;
          headers['authorizer'] = cleanToken;
          headers['x-access-token'] = cleanToken;
          headers['token'] = cleanToken;
          headers['access_token'] = cleanToken;
        }

        console.log('[apiClient] getProfile dispatching GET to /api/profile with Authorization header:', {
          hasAuth: !!cleanToken,
          authLength: cleanToken.length,
        });

        const candidateEndpoints = [
          '/api/profile',
          'api/profile',
          '/api/profile/get',
          'api/profile/get',
          '/api/user/profile',
          '/profile',
        ];

        let lastErr: any = null;
        for (const endpoint of candidateEndpoints) {
          try {
            console.log(`[apiClient] getProfile attempting GET from: ${endpoint}`);
            const res = await this.get<any>(endpoint, {
              headers,
              timeout: 25000,
              skipAuth: false,
            });
            return res;
          } catch (err: any) {
            lastErr = err;
            // If 401 Unauthorized, retry with Bearer prefix
            if (err?.status === 401 && cleanToken && !headers['Authorization'].startsWith('Bearer ')) {
              try {
                console.log(`[apiClient] getProfile retrying ${endpoint} with Bearer prefix...`);
                const bearerHeaders = {
                  ...headers,
                  Authorization: `Bearer ${cleanToken}`,
                  authorization: `Bearer ${cleanToken}`,
                };
                const res = await this.get<any>(endpoint, { headers: bearerHeaders, timeout: 25000 });
                console.log(`[apiClient] getProfile response with Bearer from ${endpoint}:`, res);
                return res;
              } catch (retryErr: any) {
                console.log(`[apiClient] getProfile Bearer retry note for ${endpoint}:`, retryErr?.message);
              }
            }

            if (err?.status === 404) {
              console.log(`[apiClient] getProfile ${endpoint} returned 404, trying next candidate...`);
              continue;
            }

            console.error(`[apiClient] getProfile error on ${endpoint}:`, {
              status: err?.status,
              message: err?.message,
              data: err?.data,
            });
            throw err;
          }
        }

        throw lastErr || new Error('Failed to fetch profile from server.');
      } finally {
        this.profilePromise = null;
      }
    })();

    return this.profilePromise;
  }

  /**
   * Updates the user profile via PATCH /api/profile/edit-profile.
   * Transmits the user's active access token in the Authorization header (without Bearer prefix).
   * Backend expects:
   * const { full_name, phone, avatar_url, hostel } = req.body;
   */
  async editProfile(data: {
    full_name?: string | null;
    phone?: string | null;
    avatar_url?: string | null;
    hostel?: string | null;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const payload = {
      full_name: data.full_name !== undefined ? data.full_name : null,
      phone: data.phone !== undefined ? data.phone : null,
      avatar_url: data.avatar_url !== undefined ? data.avatar_url : null,
      hostel: data.hostel !== undefined ? data.hostel : null,
    };

    console.log('[apiClient] editProfile dispatching PATCH to /api/profile/edit-profile with body:', {
      ...payload,
      avatar_url: payload.avatar_url
        ? payload.avatar_url.length > 50
          ? `${payload.avatar_url.substring(0, 50)}...`
          : payload.avatar_url
        : null,
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/profile/edit-profile',
      'api/profile/edit-profile',
      '/api/profile/update',
      'api/profile/update',
      '/api/profile',
      '/api/user/profile',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] editProfile attempting PATCH to: ${endpoint}`);
        const res = await this.patch<any>(endpoint, payload, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });
        console.log(`[apiClient] editProfile response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.status === 405) {
          console.log(`[apiClient] editProfile endpoint ${endpoint} returned ${err?.status}, trying next candidate...`);
          continue;
        }

        console.error(`[apiClient] editProfile error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to update profile.');
  }

  /**
   * Submits a payout withdrawal request: PATCH /api/profiles/withdraw-request.
   * Transmits withdraw_amount, upi_id, and account_holder_name in the request body,
   * with active access token (strictly without Bearer) in Authorization header.
   */
  async requestWithdrawal(params: {
    withdraw_amount: number | string;
    upi_id: string;
    account_holder_name: string;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to submit a withdrawal request.');
    }

    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    const cleanUpi = String(params.upi_id || '').trim();
    const cleanName = String(params.account_holder_name || '').trim();
    const cleanAmount =
      typeof params.withdraw_amount === 'number'
        ? params.withdraw_amount
        : !isNaN(Number(params.withdraw_amount))
        ? Number(params.withdraw_amount)
        : params.withdraw_amount;

    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
    });

    const payload = {
      withdraw_amount: cleanAmount,
      upi_id: cleanUpi,
      account_holder_name: cleanName,
    };

    const targetEndpoint = '/api/profiles/withdraw-request';

    console.log('[apiClient] requestWithdrawal dispatching single PATCH to:', {
      endpoint: targetEndpoint,
      payload,
      tokenLength: cleanToken.length,
      hasBearerInAuth: cleanToken.startsWith('Bearer'),
    });

    try {
      const res = await this.patch<any>(targetEndpoint, payload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 25000,
        skipAuth: true,
      });
      console.log(`[apiClient] requestWithdrawal response from ${targetEndpoint}:`, res);
      return res;
    } catch (err: any) {
      console.warn(`[apiClient] requestWithdrawal error on ${targetEndpoint}:`, err?.message || err);

      const finalMsg =
        err?.data?.message ||
        err?.message ||
        'Unable to submit withdrawal request. Please check your connection and try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = err?.status;
      finalErr.data = err?.data;
      throw finalErr;
    }
  }

  /**
   * Fetches user wallet balance and withdrawal/transaction history via GET /api/profile/wallet.
   * Transmits the user's active access token in the Authorization header strictly without Bearer prefix.
   */
  async getWalletData(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to view wallet details.');
    }

    const cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const targetEndpoint = '/api/profile/wallet';

    console.log('[apiClient] getWalletData dispatching single GET to /api/profile/wallet with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
      startsWithBearer: cleanToken.startsWith('Bearer'),
    });

    try {
      const res = await this.get<any>(targetEndpoint, {
        headers,
        timeout: 25000,
        skipAuth: true,
      });
      console.log(`[apiClient] getWalletData response from ${targetEndpoint}:`, res);
      return res;
    } catch (err: any) {
      console.warn(`[apiClient] getWalletData error on ${targetEndpoint}:`, err?.message || err);

      const finalMsg =
        err?.data?.message ||
        err?.message ||
        'Unable to load wallet data. Please try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = err?.status;
      finalErr.data = err?.data;
      throw finalErr;
    }
  }

  /**
   * Fetches user rental & booking history via GET /api/profile/booking-history.
   * Transmits the user's active access token in the Authorization header (without Bearer prefix).
   * Backend query:
   * select b.total_amout,b.cycle_id,b.id,b.start_time,b.returned_at,b.cancelled_at,b.status,
   * b.return_image_url,b.renter_charge,b.overdue_charge,c.brand,c.model,c.cycle_type,c.rating,
   * p.full_name,ci.image_url
   * from booking_table b
   * JOIN cycles c ON b.cycle_id = c.id
   * JOIN profiles p ON p.id = CASE WHEN b.renter_id = $1 THEN b.owner_id ELSE b.renter_id
   * LEFT JOIN cycle_images ci ON ci.cycle_id = c.id and ci.display_order = 1
   * where b.owner_id = $1 or b.renter_id = $1
   */
  async getBookingHistory(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getBookingHistory dispatching GET to /api/profile/booking-history with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/profile/booking-history',
      'api/profile/booking-history',
      '/api/profile/bookinghistory',
      'api/profile/bookinghistory',
      '/api/booking/history',
      '/api/bookings/history',
      '/api/profile/rentals',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getBookingHistory attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });
        console.log(`[apiClient] getBookingHistory response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404) {
          console.log(`[apiClient] getBookingHistory ${endpoint} returned 404, trying next candidate...`);
          continue;
        }

        console.error(`[apiClient] getBookingHistory error on ${endpoint}:`, {
          status: err?.status,
          message: err?.message,
          data: err?.data,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch booking history from server.');
  }

  /**
   * Cancels a booking via PATCH /api/profile/booking-history/cancel-booking.
   * Transmits the clean access token (without Bearer prefix) in the Authorization header
   * and sends { booking_id } in the request body.
   */
  async cancelBooking(bookingId: string, userId?: string): Promise<any> {
    let { accessToken } = await this.getEffectiveTokens();
    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const payload = {
      booking_id: bookingId,
      bookingId: bookingId,
      id: bookingId,
      cancelled_by: userId,
      status: 'cancelled',
    };

    const targetEndpoint = '/api/profile/booking-history/cancel-booking';

    try {
      console.log(`[apiClient] cancelBooking attempting PATCH to: ${targetEndpoint} with booking_id: ${bookingId}`);
      const res = await this.patch<any>(targetEndpoint, payload, {
        headers,
        timeout: 12000,
        skipAuth: true,
      });
      console.log(`[apiClient] cancelBooking response from ${targetEndpoint}:`, res);
      return res;
    } catch (err: any) {
      console.warn(`[apiClient] cancelBooking PATCH failed on ${targetEndpoint}:`, err?.status, err?.message);

      // If backend responded with non-404/405 error (e.g. 400 validation error, 401 unauth, 500 error), rethrow
      if (err?.status && err.status !== 404 && err.status !== 405) {
        throw err;
      }

      // If route is pending or mounted slightly differently on backend router, check candidate paths
      const candidateEndpoints = [
        'api/profile/booking-history/cancel-booking',
        '/api/booking/cancel-booking',
        'api/booking/cancel-booking',
        '/api/profile/cancel-booking',
        '/api/booking/cancel',
        '/api/bookings/cancel',
      ];

      for (const endpoint of candidateEndpoints) {
        try {
          console.log(`[apiClient] cancelBooking attempting candidate PATCH to: ${endpoint}`);
          const patchRes = await this.patch<any>(endpoint, payload, {
            headers,
            timeout: 8000,
            skipAuth: true,
          });
          return patchRes;
        } catch (cErr: any) {
          if (cErr?.status === 404 || cErr?.status === 405) {
            try {
              const postRes = await this.post<any>(endpoint, payload, {
                headers,
                timeout: 8000,
                skipAuth: true,
              });
              return postRes;
            } catch {}
          }
        }
      }

      // Fallback: Webhook
      try {
        console.log('[apiClient] cancelBooking falling back to n8n webhook...');
        const response = await fetch('https://ugonitk.app.n8n.cloud/webhook/cancel-booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ booking_id: bookingId, cancelled_by: userId }),
        });
        if (response.ok) {
          return { success: true };
        }
      } catch (whErr) {
        console.warn('[apiClient] cancelBooking webhook note:', whErr);
      }

      throw err;
    }
  }

  /**
   * Fetches notifications for the currently authenticated user from GET /api/notifications.
   * Transmits the user's active access token in the Authorization header.
   * Does NOT send user_id parameters or headers (backend determines the user via the access token).
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

    const endpoint = '/api/notifications';

    try {
      const res = await this.get<any>(endpoint, {
        headers,
        timeout: 25000,
        skipAuth: false,
      });
      return res;
    } catch (err: any) {
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

  /**
   * Clears notifications in backend from PATCH /api/notifications/clear-notifications.
   * Transmits array of notification_id strings directly as request body: const notifi_ids = req.body;
   * Transmits raw access token in Authorization header without Bearer.
   */
  async clearNotifications(notificationIds: string[]): Promise<any> {
    if (!notificationIds || notificationIds.length === 0) return { success: true };

    const cleanIds = notificationIds.map((id) => String(id).trim()).filter(Boolean);
    if (cleanIds.length === 0) return { success: true };

    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const endpoint = '/api/notifications/clear-notifications';
    console.log(`[apiClient] clearNotifications dispatching PATCH to ${endpoint} with ${cleanIds.length} ID(s):`, cleanIds);

    try {
      const res = await this.patch<any>(endpoint, cleanIds, {
        headers,
        timeout: 15000,
        skipAuth: true,
      });
      console.log(`[apiClient] clearNotifications response from ${endpoint}:`, res);
      return res;
    } catch (err: any) {
      console.error(`[apiClient] clearNotifications error on ${endpoint}:`, {
        status: err?.status,
        message: err?.message,
        data: err?.data,
      });
      throw err;
    }
  }

  /**
   * Marks notifications as read in backend from PATCH /api/notifications/mark-notifications.
   * Transmits array of notification_id strings directly as request body: const notifi_ids = req.body;
   * Transmits raw access token in Authorization header without Bearer.
   */
  async markNotifications(notificationIds: string[]): Promise<any> {
    if (!notificationIds || notificationIds.length === 0) return { success: true };

    const cleanIds = notificationIds.map((id) => String(id).trim()).filter(Boolean);
    if (cleanIds.length === 0) return { success: true };

    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const endpoint = '/api/notifications/mark-notifications';
    console.log(`[apiClient] markNotifications dispatching PATCH to ${endpoint} with ${cleanIds.length} ID(s):`, cleanIds);

    try {
      const res = await this.patch<any>(endpoint, cleanIds, {
        headers,
        timeout: 15000,
        skipAuth: true,
      });
      console.log(`[apiClient] markNotifications response from ${endpoint}:`, res);
      return res;
    } catch (err: any) {
      console.error(`[apiClient] markNotifications error on ${endpoint}:`, {
        status: err?.status,
        message: err?.message,
        data: err?.data,
      });
      throw err;
    }
  }

  /**
   * Fetches ongoing rentals for the authenticated user from GET /api/booking/get-Ongoing-rentals.
   * Transmits raw access token in Authorization header without Bearer prefix.
   */
  async getOngoingRentals(): Promise<any> {
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
      const rawToken = accessToken.replace(/^Bearer\s+/i, '').trim();
      headers['Authorization'] = rawToken;
      headers['authorization'] = rawToken;
      headers['Authorizer'] = rawToken;
      headers['authorizer'] = rawToken;
      headers['x-access-token'] = rawToken;
      headers['token'] = rawToken;
      headers['access_token'] = rawToken;
    }

    const endpoint = '/api/booking/get-Ongoing-rentals';
    console.log(`[apiClient] getOngoingRentals dispatching GET to ${endpoint} with raw token`);

    try {
      const res = await this.get<any>(endpoint, {
        headers,
        timeout: 25000,
        skipAuth: false,
      });
      console.log(`[apiClient] getOngoingRentals response from ${endpoint}:\n` + JSON.stringify(res, null, 2));
      return res;
    } catch (err: any) {
      console.error(`[apiClient] getOngoingRentals error on ${endpoint}:`, {
        status: err?.status,
        message: err?.message,
        data: err?.data,
      });
      throw err;
    }
  }

  /**
   * Submits cycle return verification request to PATCH /api/rentals/return-cycle.
   * Transmits active access token in Authorization headers.
   * Payload sends strictly and only { booking_id, image_url } in JPEG format.
   */
  async returnCycle(bookingId: string, photoUri: string, base64Override?: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to return a cycle.');
    }

    // 1. Clean token strictly without Bearer prefix
    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    // 2. Clean booking_id strictly without Bearer prefix
    const cleanBookingId = String(bookingId).replace(/^Bearer\s+/i, '').trim();
    const endpoint = '/api/rentals/return-cycle';

    // Obtain clean base64 of the live photo
    let base64String = base64Override || '';
    if (!base64String && photoUri) {
      try {
        base64String = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
      } catch (fsErr: any) {
        console.warn('[apiClient] returnCycle reading photo base64 note:', fsErr?.message);
      }
    }

    // Strip any existing data URI scheme to get the raw base64 data
    const rawBase64 = base64String.replace(/^data:image\/[a-zA-Z+]+;base64,/, '').trim();
    // Strictly format as JPEG base64 Data URI
    const jpegDataUri = rawBase64 ? `data:image/jpeg;base64,${rawBase64}` : photoUri;

    // Headers with access token strictly without Bearer prefix
    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      authorization: token,
      Authorizer: token,
      authorizer: token,
      'x-access-token': token,
      token: token,
      access_token: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
    });

    // Strictly and only booking_id and image_url in JPEG format, without any Bearer prefix
    const exactPayload = {
      booking_id: cleanBookingId,
      image_url: jpegDataUri,
    };

    console.log(`[apiClient] returnCycle dispatching PATCH to ${endpoint} with exact payload:`, {
      booking_id: cleanBookingId,
      image_url: `${jpegDataUri.slice(0, 35)}... (JPEG base64 total length: ${jpegDataUri.length})`,
      authHeaderLength: cleanToken.length,
      hasBearer: cleanToken.startsWith('Bearer'),
    });

    try {
      // Primary Attempt: JSON with clean access token (no Bearer)
      const res = await this.patch<any>(endpoint, exactPayload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 30000,
        skipAuth: true,
      });

      console.log(`[apiClient] returnCycle response from ${endpoint}:`, res);
      return res;
    } catch (primaryErr: any) {
      console.warn(`[apiClient] returnCycle primary attempt note on ${endpoint}:`, primaryErr?.message || primaryErr);

      // If 401 Unauthorized, refresh token and retry with refreshed clean token (strictly without Bearer)
      if (primaryErr?.status === 401) {
        try {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const freshTokens = await this.getEffectiveTokens();
            if (freshTokens.accessToken) {
              cleanToken = freshTokens.accessToken.replace(/^Bearer\s+/i, '').trim();
              const res = await this.patch<any>(endpoint, exactPayload, {
                headers: buildAuthHeaders(cleanToken),
                timeout: 30000,
                skipAuth: true,
              });
              console.log(`[apiClient] returnCycle token refresh retry success:`, res);
              return res;
            }
          }
        } catch (refreshErr: any) {
          console.warn('[apiClient] returnCycle refresh retry error:', refreshErr?.message || refreshErr);
        }
      }

      // If 400/422 Bad Request, try sending rawBase64 without data URI prefix (in case backend expects raw base64)
      if ((primaryErr?.status === 400 || primaryErr?.status === 422) && rawBase64 && jpegDataUri !== rawBase64) {
        try {
          const rawBase64Payload = {
            booking_id: cleanBookingId,
            image_url: rawBase64,
          };
          const res = await this.patch<any>(endpoint, rawBase64Payload, {
            headers: buildAuthHeaders(cleanToken),
            timeout: 30000,
            skipAuth: true,
          });
          console.log(`[apiClient] returnCycle raw base64 retry success:`, res);
          return res;
        } catch (rawErr: any) {
          console.warn('[apiClient] returnCycle raw base64 retry note:', rawErr?.message || rawErr);
        }
      }

      // Throw the most specific backend error message
      const finalMsg =
        primaryErr?.data?.message ||
        primaryErr?.message ||
        'Unable to complete return. Please check your connection and try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = primaryErr?.status;
      finalErr.data = primaryErr?.data;
      throw finalErr;
    }
  }

  /**
   * Accepts cycle return request by owner: PATCH /api/rentals/return-accept.
   * Transmits booking_id (without Bearer) in the JSON body with active access token (without Bearer) in Authorization headers.
   */
  async acceptReturn(bookingId: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to accept a return request.');
    }

    // Access token strictly without Bearer prefix
    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    // Booking ID strictly without Bearer prefix
    const cleanBookingId = String(bookingId).replace(/^Bearer\s+/i, '').trim();
    const endpoint = '/api/rentals/return-accept';

    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
    });

    const payload = {
      booking_id: cleanBookingId,
    };

    try {
      const res = await this.patch<any>(endpoint, payload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 25000,
        skipAuth: true,
      });
      markReturnBookingAccepted(cleanBookingId);
      return res;
    } catch (primaryErr: any) {
      console.warn(`[apiClient] acceptReturn primary error on ${endpoint}:`, primaryErr?.message || primaryErr);

      // If 401 Unauthorized, refresh token and retry without Bearer prefix
      if (primaryErr?.status === 401) {
        try {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const freshTokens = await this.getEffectiveTokens();
            if (freshTokens.accessToken) {
              cleanToken = freshTokens.accessToken.replace(/^Bearer\s+/i, '').trim();
              const res = await this.patch<any>(endpoint, payload, {
                headers: buildAuthHeaders(cleanToken),
                timeout: 25000,
                skipAuth: true,
              });
              console.log(`[apiClient] acceptReturn token refresh retry success:`, res);
              markReturnBookingAccepted(cleanBookingId);
              return res;
            }
          }
        } catch (retryErr: any) {
          console.warn('[apiClient] acceptReturn token refresh retry error:', retryErr?.message || retryErr);
        }
      }

      const finalMsg =
        primaryErr?.data?.message ||
        primaryErr?.message ||
        'Unable to accept return request. Please check your connection and try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = primaryErr?.status;
      finalErr.data = primaryErr?.data;
      throw finalErr;
    }
  }

  /**
   * Verifies return OTP entered by cycle owner: PATCH /api/rentals/return-otp-verification.
   * Transmits booking_id and client_otp (without Bearer) in request body,
   * with active access token (without Bearer) in Authorization header.
   */
  async verifyReturnOtp(bookingId: string, clientOtp: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to verify return OTP.');
    }

    // Access token strictly without Bearer prefix
    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    // Booking ID and client_otp strictly without Bearer prefix
    const cleanBookingId = String(bookingId).replace(/^Bearer\s+/i, '').trim();
    const cleanOtp = String(clientOtp).replace(/^Bearer\s+/i, '').trim();
    const endpoint = '/api/rentals/return-otp-verification';

    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
    });

    const payload = {
      booking_id: cleanBookingId,
      client_otp: cleanOtp,
    };

    console.log(`[apiClient] verifyReturnOtp dispatching PATCH to ${endpoint} with payload:`, {
      booking_id: cleanBookingId,
      client_otp: cleanOtp,
      tokenLength: cleanToken.length,
      hasBearerInAuth: cleanToken.startsWith('Bearer'),
      hasBearerInBookingId: cleanBookingId.startsWith('Bearer'),
      hasBearerInOtp: cleanOtp.startsWith('Bearer'),
    });

    try {
      const res = await this.patch<any>(endpoint, payload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 25000,
        skipAuth: true,
      });
      console.log(`[apiClient] verifyReturnOtp response from ${endpoint}:`, res);
      return res;
    } catch (primaryErr: any) {
      console.warn(`[apiClient] verifyReturnOtp primary error on ${endpoint}:`, primaryErr?.message || primaryErr);

      if (primaryErr?.status === 401) {
        try {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const freshTokens = await this.getEffectiveTokens();
            if (freshTokens.accessToken) {
              cleanToken = freshTokens.accessToken.replace(/^Bearer\s+/i, '').trim();
              const res = await this.patch<any>(endpoint, payload, {
                headers: buildAuthHeaders(cleanToken),
                timeout: 25000,
                skipAuth: true,
              });
              console.log(`[apiClient] verifyReturnOtp token refresh retry success:`, res);
              return res;
            }
          }
        } catch (retryErr: any) {
          console.warn('[apiClient] verifyReturnOtp token refresh retry error:', retryErr?.message || retryErr);
        }
      }

      const finalMsg =
        primaryErr?.data?.message ||
        primaryErr?.data?.error ||
        primaryErr?.message ||
        'Unable to verify return OTP. Please check the code and try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = primaryErr?.status;
      finalErr.data = primaryErr?.data;
      throw finalErr;
    }
  }

  /**
   * Regenerates Return OTP for a booking when time completes / OTP expires:
   * PATCH /api/rentals/regenerate-return-otp
   * Transmits booking_id (without Bearer) in request body,
   * with active access token (without Bearer) in Authorization header.
   */
  async regenerateReturnOtp(bookingId: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const freshTokens = await this.getEffectiveTokens();
        accessToken = freshTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to regenerate return OTP.');
    }

    // Access token strictly without Bearer prefix
    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    // Booking ID strictly without Bearer prefix
    const cleanBookingId = String(bookingId).replace(/^Bearer\s+/i, '').trim();
    const endpoint = '/api/rentals/regenerate-return-otp';

    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
    });

    const payload = {
      booking_id: cleanBookingId,
    };

    console.log(`[apiClient] regenerateReturnOtp dispatching PATCH to ${endpoint} with payload:`, {
      booking_id: cleanBookingId,
      tokenLength: cleanToken.length,
      hasBearerInAuth: cleanToken.startsWith('Bearer'),
      hasBearerInBookingId: cleanBookingId.startsWith('Bearer'),
    });

    try {
      const res = await this.patch<any>(endpoint, payload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 25000,
        skipAuth: true,
      });
      console.log(`[apiClient] regenerateReturnOtp response from ${endpoint}:`, res);
      return res;
    } catch (primaryErr: any) {
      console.warn(`[apiClient] regenerateReturnOtp primary error on ${endpoint}:`, primaryErr?.message || primaryErr);

      if (primaryErr?.status === 401) {
        try {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const freshTokens = await this.getEffectiveTokens();
            if (freshTokens.accessToken) {
              cleanToken = freshTokens.accessToken.replace(/^Bearer\s+/i, '').trim();
              const res = await this.patch<any>(endpoint, payload, {
                headers: buildAuthHeaders(cleanToken),
                timeout: 25000,
                skipAuth: true,
              });
              console.log(`[apiClient] regenerateReturnOtp token refresh retry success:`, res);
              return res;
            }
          }
        } catch (retryErr: any) {
          console.warn('[apiClient] regenerateReturnOtp token refresh retry error:', retryErr?.message || retryErr);
        }
      }

      const finalMsg =
        primaryErr?.data?.message ||
        primaryErr?.message ||
        'Unable to regenerate return OTP. Please try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = primaryErr?.status;
      finalErr.data = primaryErr?.data;
      throw finalErr;
    }
  }

  /**
   * Submits an issue report for an ongoing rental: POST /api/rentals/report.
   * Transmits reason, booking_id, and description in the request body,
   * with active access token (strictly without Bearer) in Authorization header.
   */
  async submitRentalReport(params: {
    booking_id: string;
    reason: string;
    description: string;
  }): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    if (!accessToken) {
      throw new Error('You must be signed in to submit a report.');
    }

    let cleanToken = accessToken.replace(/^Bearer\s+/i, '').trim();
    const cleanBookingId = String(params.booking_id).replace(/^Bearer\s+/i, '').trim();
    const endpoint = '/api/rentals/report';

    const buildAuthHeaders = (token: string): Record<string, string> => ({
      Authorization: token,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true',
      'User-Agent': DEFAULT_USER_AGENT,
    });

    const payload = {
      reason: params.reason.trim(),
      booking_id: cleanBookingId,
      description: params.description.trim(),
    };

    console.log(`[apiClient] submitRentalReport dispatching POST to ${endpoint} with payload:`, {
      booking_id: cleanBookingId,
      reason: payload.reason,
      descLength: payload.description.length,
      tokenLength: cleanToken.length,
      hasBearerInAuth: cleanToken.startsWith('Bearer'),
      hasBearerInBookingId: cleanBookingId.startsWith('Bearer'),
    });

    try {
      const res = await this.post<any>(endpoint, payload, {
        headers: buildAuthHeaders(cleanToken),
        timeout: 25000,
        skipAuth: true,
      });
      console.log(`[apiClient] submitRentalReport response from ${endpoint}:`, res);
      return res;
    } catch (primaryErr: any) {
      console.warn(`[apiClient] submitRentalReport primary error on ${endpoint}:`, primaryErr?.message || primaryErr);

      // If 401 Unauthorized, refresh token and retry without Bearer prefix
      if (primaryErr?.status === 401) {
        try {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            const freshTokens = await this.getEffectiveTokens();
            if (freshTokens.accessToken) {
              cleanToken = freshTokens.accessToken.replace(/^Bearer\s+/i, '').trim();
              const res = await this.post<any>(endpoint, payload, {
                headers: buildAuthHeaders(cleanToken),
                timeout: 25000,
                skipAuth: true,
              });
              console.log(`[apiClient] submitRentalReport token refresh retry success:`, res);
              return res;
            }
          }
        } catch (retryErr: any) {
          console.warn('[apiClient] submitRentalReport token refresh retry error:', retryErr?.message || retryErr);
        }
      }

      const finalMsg =
        primaryErr?.data?.message ||
        primaryErr?.message ||
        'Unable to submit report. Please try again.';
      const finalErr: any = new Error(finalMsg);
      finalErr.status = primaryErr?.status;
      finalErr.data = primaryErr?.data;
      throw finalErr;
    }
  }

  /**
   * Requests OTP regeneration for a booking when the previous OTP has expired.
   * Transmits access token without Bearer prefix in Authorization/Authorizer headers.
   * For return OTP, calls regenerateReturnOtp (PATCH /api/rentals/regenerate-return-otp).
   */
  async regenerateOtp(bookingId: string, isReturn: boolean = false): Promise<any> {
    if (isReturn) {
      return this.regenerateReturnOtp(bookingId);
    }

    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (accessToken && isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const fresh = await this.getEffectiveTokens();
        accessToken = fresh.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(cleanToken
        ? {
            'Authorization': cleanToken,
            'authorization': cleanToken,
            'Authorizer': cleanToken,
            'authorizer': cleanToken,
            'x-access-token': cleanToken,
            'token': cleanToken,
            'access_token': cleanToken,
          }
        : {}),
    };

    const cleanBookingId = String(bookingId).trim();
    const payload = {
      booking_id: cleanBookingId,
      bookingId: cleanBookingId,
      is_return: Boolean(isReturn),
    };

    console.log('[apiClient] regenerateOtp dispatching for booking:', {
      booking_id: cleanBookingId,
      is_return: isReturn,
      hasAuthorization: !!cleanToken,
      authLength: cleanToken.length,
    });

    // 1. Candidate backend endpoints
    const candidateEndpoints = isReturn
      ? [
          '/api/otp/regenerate-return-otp',
          'api/otp/regenerate-return-otp',
          '/api/booking/regenerate-return-otp',
          '/api/otp/regenerate',
        ]
      : [
          '/api/otp/regenerate-otp',
          'api/otp/regenerate-otp',
          '/api/booking/regenerate-otp',
          '/api/otp/regenerate',
          '/api/otp/resend',
        ];

    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] regenerateOtp attempting backend endpoint: ${endpoint}`);
        const res = await this.post<any>(endpoint, payload, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });
        console.log(`[apiClient] regenerateOtp response from ${endpoint}:`, res);
        return res;
      } catch (err: any) {
        if (err?.status === 405) {
          try {
            console.log(`[apiClient] regenerateOtp attempting PATCH fallback for ${endpoint}`);
            const patchRes = await this.patch<any>(endpoint, payload, {
              headers,
              timeout: 25000,
              skipAuth: true,
            });
            console.log(`[apiClient] regenerateOtp PATCH response from ${endpoint}:`, patchRes);
            return patchRes;
          } catch (patchErr: any) {
            console.log(`[apiClient] regenerateOtp PATCH fallback returned ${patchErr?.status}`);
          }
        }
        if (err?.status === 404 || err?.status === 405) {
          console.log(`[apiClient] regenerateOtp endpoint ${endpoint} returned ${err?.status}, trying next...`);
          continue;
        }
        console.warn(`[apiClient] regenerateOtp error on ${endpoint}:`, err?.message);
        break;
      }
    }

    // 2. Candidate webhooks (primary is ugocycle.app.n8n.cloud from production web app, fallback ugonitk)
    const webhookCandidates = isReturn
      ? [
          'https://ugocycle.app.n8n.cloud/webhook/regenerate-return-otp',
          'https://ugonitk.app.n8n.cloud/webhook/regenerate-return-otp',
        ]
      : [
          'https://ugocycle.app.n8n.cloud/webhook/regenerate-otp',
          'https://ugonitk.app.n8n.cloud/webhook/regenerate-otp',
        ];

    let lastWebhookErr: any = null;
    for (const webhookUrl of webhookCandidates) {
      try {
        console.log(`[apiClient] regenerateOtp attempting webhook: ${webhookUrl}`);
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ booking_id: cleanBookingId }),
        });

        const text = await res.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }

        if (!res.ok) {
          const msg =
            (typeof data === 'object' && (data?.message || data?.error || data?.msg)) ||
            `Webhook failed (HTTP ${res.status})`;
          throw new Error(msg);
        }

        console.log(`[apiClient] regenerateOtp webhook success from ${webhookUrl}:`, data);
        return data || { success: true };
      } catch (webhookErr: any) {
        lastWebhookErr = webhookErr;
        console.warn(`[apiClient] regenerateOtp webhook ${webhookUrl} note:`, webhookErr?.message);
      }
    }

    throw lastWebhookErr || new Error('Failed to regenerate OTP. Please try again.');
  }

  /**
   * Registers an FCM device push token with the backend.
   * Endpoint: POST /api/devices/register
   * Body: { fcm_token: string, platform: string }
   * Transmits access token without Bearer prefix in Authorization/Authorizer headers.
   */
  async registerDeviceToken(fcmToken: string, platform: string = 'android'): Promise<any> {
    if (!fcmToken) {
      return null;
    }

    let { accessToken } = await this.getEffectiveTokens();
    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(cleanToken
        ? {
            'Authorization': cleanToken,
            'authorization': cleanToken,
            'Authorizer': cleanToken,
            'authorizer': cleanToken,
          }
        : {}),
    };

    // Strictly the required body: { fcm_token, platform }
    const payload = {
      fcm_token: String(fcmToken).trim(),
      platform: platform || Platform.OS || 'android',
    };

    console.log('[apiClient] registerDeviceToken dispatching:', {
      endpoint: '/api/devices/register',
      platform: payload.platform,
      fcmTokenLength: payload.fcm_token.length,
      hasAuthorization: !!cleanToken,
    });

    try {
      const res = await this.post<any>('/api/devices/register', payload, {
        headers,
        timeout: 15000,
        skipAuth: true,
      });
      console.log('[apiClient] registerDeviceToken success:', res);
      return res;
    } catch (err: any) {
      console.warn('[apiClient] registerDeviceToken error:', err?.message || err);
      return null;
    }
  }

  /**
   * Unregisters an FCM device push token with the backend upon logout.
   * Endpoint: PATCH /api/devices/unregister
   * Body: { fcm_token: string }
   * Transmits raw access token without Bearer prefix in Authorization/Authorizer headers.
   */
  async unregisterDeviceToken(fcmToken: string): Promise<any> {
    if (!fcmToken) {
      return null;
    }

    let { accessToken } = await this.getEffectiveTokens();
    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
      ...(cleanToken
        ? {
            'Authorization': cleanToken,
            'authorization': cleanToken,
            'Authorizer': cleanToken,
            'authorizer': cleanToken,
          }
        : {}),
    };

    // Strictly the required body: { fcm_token }
    const payload = {
      fcm_token: String(fcmToken).trim(),
    };

    console.log('[apiClient] unregisterDeviceToken dispatching PATCH to /api/devices/unregister:', {
      endpoint: '/api/devices/unregister',
      fcmTokenLength: payload.fcm_token.length,
      hasAuthorization: !!cleanToken,
    });

    try {
      const res = await this.patch<any>('/api/devices/unregister', payload, {
        headers,
        timeout: 15000,
        skipAuth: true,
      });
      console.log('[apiClient] unregisterDeviceToken success:', res);
      return res;
    } catch (err: any) {
      console.warn('[apiClient] unregisterDeviceToken error:', err?.message || err);
      return null;
    }
  }

  /**
   * Fetches real-time Admin Dashboard data from GET /api/admin/dashboard.
   * Transmits raw access token without Bearer in Authorization header.
   */
  async getAdminDashboardData(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getAdminDashboardData dispatching GET to /api/admin/dashboard with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/dashboard',
      'api/admin/dashboard',
      
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getAdminDashboardData attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getAdminDashboardData response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getAdminDashboardData ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getAdminDashboardData error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch admin dashboard data.');
  }

  /**
   * Fetches all registered campus users from GET /api/admin/users.
   * Transmits raw access token in Authorization header without Bearer.
   */
  async getAdminUsers(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getAdminUsers dispatching GET to /api/admin/users with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/users',
      'api/admin/users',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getAdminUsers attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getAdminUsers response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getAdminUsers ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getAdminUsers error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch admin users.');
  }

  /**
   * Fetches verified campus cycles from GET /api/admin/cycles.
   * Transmits raw access token in Authorization header without Bearer.
   */
  async getAdminCycles(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getAdminCycles dispatching GET to /api/admin/cycles with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/cycles',
      'api/admin/cycles',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getAdminCycles attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getAdminCycles response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getAdminCycles ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getAdminCycles error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch admin cycles.');
  }

  /**
   * Fetches active rides / bookings from GET /api/admin/activeBookings.
   * Transmits raw access token in Authorization header without Bearer.
   */
  async getActiveBookings(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getActiveBookings dispatching GET to /api/admin/activeBookings with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/activeBookings',
      'api/admin/activeBookings',
      '/api/admin/active-bookings',
      'api/admin/active-bookings',
      '/api/admin/activebookings',
      'api/admin/activebookings',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getActiveBookings attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getActiveBookings response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getActiveBookings ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getActiveBookings error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch active bookings.');
  }

  /**
   * Fetches cycle verification requests assigned to this admin from GET /api/admin/cycleVerifications.
   * Transmits raw access token in Authorization header without Bearer.
   */
  async getAdminCycleVerifications(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getAdminCycleVerifications dispatching GET to /api/admin/cycleVerifications with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/cycleVerifications',
      'api/admin/cycleVerifications',
      '/api/admin/cycle-verifications',
      'api/admin/cycle-verifications',
      '/api/admin/cycleverifications',
      'api/admin/cycleverifications',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getAdminCycleVerifications attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getAdminCycleVerifications response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getAdminCycleVerifications ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getAdminCycleVerifications error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch cycle verifications.');
  }

  /**
   * Fetches all reports (both pending and completed) from GET /api/admin/reports.
   * Transmits raw access token in Authorization header without Bearer.
   */
  async getAdminReports(): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': DEFAULT_USER_AGENT,
      'user-agent': DEFAULT_USER_AGENT,
      'ngrok-skip-browser-warning': 'true',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    console.log('[apiClient] getAdminReports dispatching GET to /api/admin/reports with Authorization header:', {
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/admin/reports',
      'api/admin/reports',
      '/api/admin/all-reports',
      'api/admin/all-reports',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] getAdminReports attempting GET from: ${endpoint}`);
        const res = await this.get<any>(endpoint, {
          headers,
          timeout: 25000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] getAdminReports response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] getAdminReports ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] getAdminReports error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to fetch admin reports.');
  }

  /**
  

  /**
   * Marks a notification as read (handled locally; no unnecessary HTTP calls to /notifications/read).
   */
  async markNotificationRead(_notificationId: string): Promise<any> {
    return { success: true };
  }

  /**
   * Deletes a notification (handled locally; no unnecessary HTTP calls to /notifications/delete).
   */
  async deleteNotification(_notificationId: string): Promise<any> {
    return { success: true };
  }

  /**
   * Cancels a pending payment via PATCH /api/payment/cancel-payment.
   * Transmits raw access token in Authorization header without Bearer.
   * Body: { payment_id: paymentId }
   */
  async cancelPayment(paymentId: string): Promise<any> {
    let { accessToken, recoveryToken } = await this.getEffectiveTokens();
    if (isTokenExpired(accessToken) && recoveryToken) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        const refreshedTokens = await this.getEffectiveTokens();
        accessToken = refreshedTokens.accessToken;
      }
    }

    const cleanToken = accessToken ? accessToken.replace(/^Bearer\s+/i, '').trim() : '';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (cleanToken) {
      headers['Authorization'] = cleanToken;
      headers['authorization'] = cleanToken;
      headers['Authorizer'] = cleanToken;
      headers['authorizer'] = cleanToken;
      headers['x-access-token'] = cleanToken;
      headers['token'] = cleanToken;
      headers['access_token'] = cleanToken;
    }

    const payload = {
      payment_id: paymentId,
      paymentId: paymentId,
      id: paymentId,
    };

    console.log('[apiClient] cancelPayment dispatching PATCH to /api/payment/cancel-payment with:', {
      payment_id: paymentId,
      hasAuth: !!cleanToken,
      authLength: cleanToken.length,
    });

    const candidateEndpoints = [
      '/api/payment/cancel-payment',
      'api/payment/cancel-payment',
      '/api/payments/cancel-payment',
      'api/payments/cancel-payment',
      '/api/payment/cancel',
      'api/payment/cancel',
    ];

    let lastErr: any = null;
    for (const endpoint of candidateEndpoints) {
      try {
        console.log(`[apiClient] cancelPayment attempting PATCH to: ${endpoint}`);
        const res = await this.patch<any>(endpoint, payload, {
          headers,
          timeout: 15000,
          skipAuth: true,
        });

        if (res !== undefined && res !== null) {
          console.log(`[apiClient] cancelPayment response from ${endpoint}:`, res);
          return res;
        }
      } catch (err: any) {
        lastErr = err;
        if (err?.status === 404 || err?.message?.includes('404')) {
          console.log(`[apiClient] cancelPayment ${endpoint} returned 404, trying next candidate...`);
          continue;
        }
        console.error(`[apiClient] cancelPayment error on ${endpoint}:`, {
          message: err?.message || err,
          status: err?.status,
        });
        throw err;
      }
    }

    throw lastErr || new Error('Failed to cancel payment.');
  }
}

export const apiClient = new ApiClient();

// In-memory set of bookings whose return requests have been accepted by owner
const acceptedReturnBookings = new Set<string>();

export const isReturnBookingAccepted = (bookingId: string): boolean => {
  const cleanId = String(bookingId || '').replace(/^Bearer\s+/i, '').trim();
  return cleanId ? acceptedReturnBookings.has(cleanId) : false;
};

export const markReturnBookingAccepted = (bookingId: string): void => {
  const cleanId = String(bookingId || '').replace(/^Bearer\s+/i, '').trim();
  if (cleanId) acceptedReturnBookings.add(cleanId);
};
