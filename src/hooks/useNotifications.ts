import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, extractNotificationsList } from '../lib/apiClient';
import { getAccessToken } from '../lib/secureStorage';
import { NotificationItem } from '../types';
import { PaymentCoordinator } from '../lib/PaymentCoordinator';
import { AcceptedOtpCoordinator } from '../lib/AcceptedOtpCoordinator';
import { onNotificationReceived } from '../lib/socket';

// Set to false to enable active network fetching and polling of notifications
export const NOTIFICATIONS_FETCH_PAUSED = false;

// Purge legacy global keys once so previous mixed cache is permanently removed
(async () => {
  try {
    await AsyncStorage.multiRemove([
      '@ugo_stored_notifications',
      '@ugo_deleted_notification_ids',
      '@ugo_read_notification_ids',
    ]).catch(() => {});
  } catch {}
})();

/**
 * Computes a safe session partition key based strictly on the access token
 * without exposing or requiring any user_id.
 */
function getTokenSignature(token: string | null): string {
  if (!token) return 'unauthed';
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  if (!clean) return 'unauthed';
  const tail = clean.slice(-24);
  return tail.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getStorageKeys(token: string | null) {
  const sig = getTokenSignature(token);
  return {
    storageKey: `@ugo_notifs_${sig}`,
    deletedKey: `@ugo_deleted_notifs_${sig}`,
    readKey: `@ugo_read_notifs_${sig}`,
  };
}

// Helper to load IDs sets from AsyncStorage
async function getStoredIdSet(key: string): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.map(String));
    }
  } catch {
    // Ignore parse errors
  }
  return new Set<string>();
}

// Helper to save IDs set to AsyncStorage
async function saveStoredIdSet(key: string, set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.warn(`[useNotifications] Error saving set to ${key}:`, err);
  }
}

/**
 * Clears all stored notification caches from AsyncStorage across all sessions on logout.
 */
export async function clearStoredNotifications(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const notifKeys = keys.filter(
      (k) =>
        k.startsWith('@ugo_notifs_') ||
        k.startsWith('@ugo_deleted_notifs_') ||
        k.startsWith('@ugo_read_notifs_') ||
        k.startsWith('@ugo_stored_notifications') ||
        k.startsWith('@ugo_deleted_notification_ids') ||
        k.startsWith('@ugo_read_notification_ids')
    );
    if (notifKeys.length > 0) {
      await AsyncStorage.multiRemove(notifKeys);
      console.log(`[useNotifications] Purged ${notifKeys.length} cached notification storage key(s) on logout.`);
    }
    await AcceptedOtpCoordinator.clearHistory();
    notificationStore.reset();
  } catch (err) {
    console.warn('[clearStoredNotifications] Error clearing notifications:', err);
  }
}

/**
 * Singleton NotificationStore
 * Guarantees exactly ONE background poller interval (every 5 seconds)
 * and eliminates duplicate/concurrent requests across all consumer screens.
 */
class NotificationStore {
  private notifications: NotificationItem[] = [];
  private loading: boolean = true;
  private activeTokenSig: string = 'unauthed';
  private activeToken: string | null = null;
  private isFetching: boolean = false;
  private lastFetchTime: number = 0;
  private subscribers: Set<() => void> = new Set();
  private pollInterval: NodeJS.Timeout | null = null;
  private initialized: boolean = false;

  public subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    this.subscribers.forEach((cb) => {
      try {
        cb();
      } catch (e) {}
    });
  }

  public getState() {
    return {
      notifications: this.notifications,
      loading: this.loading,
      unreadCount: this.notifications.filter((n) => !n.is_read).length,
    };
  }

  public init() {
    if (this.initialized) return;
    this.initialized = true;

    // Load initial partition and perform first fetch
    this.syncSessionToken().then(() => {
      this.fetchNotifications(true);
    });

    // Notification polling stopped: replaced by real-time Socket.IO events
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[NotificationStore] Notification polling stopped. Listening via Socket.IO.');

    // Subscribe to real-time Socket.IO "notification" events from backend
    onNotificationReceived((data) => {
      console.log('[NotificationStore] 🔔 Real-time Socket.IO notification received:', data);
      this.fetchNotifications(true);
    });
  }

  public async syncSessionToken(): Promise<void> {
    try {
      const token = await getAccessToken();
      const sig = getTokenSignature(token);

      if (!token) {
        if (this.activeTokenSig !== 'unauthed') {
          this.notifications = [];
          this.activeTokenSig = 'unauthed';
          this.activeToken = null;
          this.loading = false;
          this.notify();
        }
        return;
      }

      if (sig !== this.activeTokenSig) {
        console.log('[NotificationStore] Active token session changed. Wiping state and re-hydrating partition.');
        this.notifications = [];
        this.loading = true;
        this.activeTokenSig = sig;
        this.activeToken = token;
        this.notify();

        // Hydrate from storage for this token
        const { storageKey, deletedKey } = getStorageKeys(token);
        const [storedRaw, deletedIds] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          getStoredIdSet(deletedKey),
        ]);

        if (storedRaw) {
          try {
            const parsed = JSON.parse(storedRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.notifications = parsed.filter(
                (n: NotificationItem) =>
                  n &&
                  n.id &&
                  !deletedIds.has(String(n.id)) &&
                  String(n.title).trim().toUpperCase() !== 'PAYMENT_PENDING'
              );
            }
          } catch {}
        }
        this.loading = false;
        this.notify();
      }
    } catch (err) {
      console.warn('[NotificationStore] Token sync note:', err);
      this.loading = false;
      this.notify();
    }
  }

  public async fetchNotifications(force: boolean = false): Promise<void> {
    if (NOTIFICATIONS_FETCH_PAUSED) {
      this.loading = false;
      this.notify();
      return;
    }

    // 1. In-flight mutex: prevent concurrent requests
    if (this.isFetching) {
      return;
    }

    // 2. Throttle guard: enforce minimum 4.5 seconds between non-forced calls
    const now = Date.now();
    if (!force && now - this.lastFetchTime < 4500) {
      return;
    }

    this.isFetching = true;
    this.lastFetchTime = now;

    try {
      const token = await getAccessToken();
      if (!token) {
        this.notifications = [];
        this.loading = false;
        this.notify();
        return;
      }

      const sig = getTokenSignature(token);
      if (sig !== this.activeTokenSig) {
        await this.syncSessionToken();
      }

      // Single fetch to backend API /api/notifications
      console.log('[NotificationStore] 🔔 Polling api/notifications (5s interval)...');
      const res = await apiClient.getNotifications();
      const rawList: any[] = extractNotificationsList(res);
      console.log(`[NotificationStore] Extracted ${rawList.length} notification(s) from backend.`);

      const { storageKey, deletedKey, readKey } = getStorageKeys(token);
      const [storedRaw, deletedIds, readIds] = await Promise.all([
        AsyncStorage.getItem(storageKey),
        getStoredIdSet(deletedKey),
        getStoredIdSet(readKey),
      ]);

      let cachedList: NotificationItem[] = [];
      if (storedRaw) {
        try {
          const parsed = JSON.parse(storedRaw);
          if (Array.isArray(parsed)) {
            cachedList = parsed;
          }
        } catch {}
      }

      // Format all incoming notifications returned by backend for this access token
      const incomingFormatted: NotificationItem[] = (
        await Promise.all(
          rawList.map(async (item: any, index: number) => {
            let payload =
              item.payload_response ??
              item.payload ??
              item.response ??
              item.action_data ??
              item.data ??
              item.details ??
              item.metadata ??
              {};

            if (typeof payload === 'string') {
              try {
                payload = JSON.parse(payload);
              } catch {
                // Keep original payload
              }
            }

            const id = String(
              item.id ||
              item._id ||
              item.notification_id ||
              item.notificationId ||
              payload?.id ||
              payload?.notification_id ||
              `notif-${Date.now()}-${index}`
            );

            // Skip if user previously deleted this notification in this session
            if (deletedIds.has(id)) {
              return null;
            }

            const title =
              item.title ||
              item.subject ||
              item.heading ||
              payload?.title ||
              payload?.subject ||
              'UgO Notification';

            const message =
              item.message ||
              item.body ||
              item.text ||
              item.description ||
              payload?.message ||
              payload?.body ||
              payload?.text ||
              '';

            const type =
              item.type ||
              item.notification_type ||
              item.action_type ||
              payload?.type ||
              payload?.notification_type ||
              'general';

            const actionType =
              item.action_type ||
              item.actionType ||
              item.type ||
              payload?.action_type ||
              payload?.actionType ||
              payload?.type ||
              null;

            const backendRead = Boolean(
              item.is_read ??
              item.isRead ??
              item.read ??
              payload?.is_read ??
              payload?.isRead ??
              false
            );

            const isRead = backendRead || readIds.has(id);

            const createdAt =
              item.created_at ||
              item.createdAt ||
              item.date ||
              item.timestamp ||
              payload?.created_at ||
              payload?.createdAt ||
              new Date().toISOString();

            // Collect booking_id
            const rawBookingId =
              item.booking_id ??
              item.bookingId ??
              payload?.booking_id ??
              payload?.bookingId ??
              payload?.booking?.id ??
              payload?.booking?.booking_id ??
              item.action_data?.booking_id ??
              item.action_data?.bookingId ??
              (typeof payload === 'object' && payload?.data?.booking_id) ??
              (typeof payload === 'object' && payload?.data?.bookingId) ??
              null;

            let finalBookingId = rawBookingId ? String(rawBookingId).trim() : undefined;

            if (!finalBookingId) {
              const combined = `${title} ${message}`;
              const uuidMatch = combined.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
              if (uuidMatch) {
                finalBookingId = uuidMatch[1];
              }
            }

            let resolvedActionData = item.action_data ?? payload ?? {};
            if (typeof resolvedActionData === 'string') {
              try {
                resolvedActionData = JSON.parse(resolvedActionData);
              } catch {
                resolvedActionData = {};
              }
            }
            if (typeof resolvedActionData === 'object' && resolvedActionData !== null && finalBookingId) {
              if (!resolvedActionData.booking_id) resolvedActionData.booking_id = finalBookingId;
              if (!resolvedActionData.bookingId) resolvedActionData.bookingId = finalBookingId;
            }

            // PAYMENT_PENDING INTERCEPTION & SUPPRESSION
            const notifStatus = String(resolvedActionData?.status || item.status || '').trim().toLowerCase();

            if (notifStatus === 'cancelled') {
              console.log(`[NotificationStore] 🚫 Payment ${resolvedActionData?.payment_id || id} status is cancelled. Marking cancelled.`);
              PaymentCoordinator.markPaymentCancelled(resolvedActionData?.payment_id);
              PaymentCoordinator.markPaymentCancelled(resolvedActionData?.order_id);
              return null;
            }

            const isAlreadyFinished =
              notifStatus === 'completed' ||
              notifStatus === 'paid' ||
              notifStatus === 'success' ||
              notifStatus === 'captured' ||
              PaymentCoordinator.isPaymentCompleted(resolvedActionData?.payment_id) ||
              PaymentCoordinator.isPaymentCompleted(resolvedActionData?.order_id) ||
              PaymentCoordinator.isPaymentCompleted(id);

            if (isAlreadyFinished) {
              PaymentCoordinator.markPaymentCompleted(resolvedActionData?.payment_id);
              PaymentCoordinator.markPaymentCompleted(resolvedActionData?.order_id);
              return null;
            }

            const isPaymentPending =
              !isAlreadyFinished &&
              (String(title).trim().toUpperCase() === 'PAYMENT_PENDING' ||
               String(actionType).trim().toUpperCase() === 'PAYMENT_PENDING' ||
               Boolean(resolvedActionData?.order_id && (resolvedActionData?.razorpay_key || resolvedActionData?.payment_id || resolvedActionData?.amount)));

            if (isPaymentPending) {
              console.log(
                `[NotificationStore] ⚡ INTERCEPTED PAYMENT_PENDING notification (ID: ${id})! notifStatus: '${notifStatus}'`
              );

              let resolvedAmount = Number(
                resolvedActionData?.amount ||
                resolvedActionData?.total_amount ||
                resolvedActionData?.fare ||
                0
              );

              const paymentId = resolvedActionData?.payment_id || item.id || id;
              const orderId =
                resolvedActionData?.order_id ||
                resolvedActionData?.orderId ||
                resolvedActionData?.razorpay_order_id ||
                resolvedActionData?.provider_order_id ||
                item.order_id ||
                item.orderId ||
                item.provider_order_id ||
                (typeof payload === 'object' && (payload?.order_id || payload?.orderId || payload?.razorpay_order_id));
              let bookingId = finalBookingId || resolvedActionData?.booking_id;

              if (resolvedAmount <= 0) {
                const candidateAmount =
                  item.amount ??
                  item.total_price ??
                  item.rental_price ??
                  item.renter_charge ??
                  resolvedActionData?.total_amount ??
                  resolvedActionData?.fare;
                if (candidateAmount) {
                  resolvedAmount = Number(candidateAmount);
                } else {
                  const textMatch = `${title} ${message}`.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i);
                  if (textMatch && textMatch[1]) {
                    resolvedAmount = Number(textMatch[1]);
                  }
                }
              }

              const paymentOrderPayload = {
                payment_id: paymentId,
                order_id: orderId,
                amount: resolvedAmount,
                razorpay_key: resolvedActionData?.razorpay_key || 'rzp_test_TSslW485AyMVnu',
                status: resolvedActionData?.status || 'payment_pending',
                booking_id: bookingId,
                currency: resolvedActionData?.currency || 'INR',
              };

              console.log(
                `[NotificationStore] Requesting UI Mutex Lock for Order: ${paymentOrderPayload.order_id || paymentOrderPayload.payment_id}... Amount: ₹${resolvedAmount}`
              );
              PaymentCoordinator.acquireLock(
                paymentOrderPayload.order_id || paymentOrderPayload.payment_id,
                paymentOrderPayload
              );

              return null;
            }

            // Extract conversation_id from root item or inner payload/action_data
            const rawConvId =
              item.conversation_id ??
              item.conversationId ??
              payload?.conversation_id ??
              payload?.conversationId ??
              resolvedActionData?.conversation_id ??
              resolvedActionData?.conversationId ??
              null;

            const isRentalOtpGen =
              String(title).toLowerCase().includes('rental_otp_generated') ||
              String(actionType).toLowerCase().includes('rental_otp_generated') ||
              String(item.type || '').toLowerCase().includes('rental_otp_generated');

            if (isRentalOtpGen || rawConvId) {
              console.log(
                `[NotificationStore] 🎯 rental_otp_generated notification detected! conversation_id: "${rawConvId}"`,
                {
                  id,
                  title,
                  actionType,
                  booking_id: finalBookingId,
                  conversation_id: rawConvId,
                  action_data: resolvedActionData,
                }
              );
            }

            return {
              id,
              booking_id: finalBookingId,
              conversation_id: rawConvId ? String(rawConvId).trim() : undefined,
              title,
              message,
              type,
              action_type: actionType,
              action_data: resolvedActionData,
              payload,
              payload_response: item.payload_response ?? payload,
              is_read: isRead,
              created_at: createdAt,
            } as NotificationItem;
          })
        )
      ).filter(Boolean) as NotificationItem[];

      // BOOKING ACCEPTED (PICKUP & RETURN) OTP CELEBRATION POPUP DETECTION
      for (const item of incomingFormatted) {
        if (!item) continue;

        // Skip immediately if notification is already read (on backend or in local session cache)
        if (item.is_read || readIds.has(String(item.id))) {
          continue;
        }

        const actionData = (item as any).action_data || {};
        const titleLower = String(item.title || '').toLowerCase();
        const msgLower = String(item.message || '').toLowerCase();
        const actionTypeLower = String(item.action_type || '').toLowerCase();

        const recipientRole = String(
          actionData.role || actionData.user_role || actionData.recipient_role || ''
        ).toLowerCase();
        if (recipientRole === 'owner') continue;
        if (
          actionTypeLower.includes('enter') ||
          actionTypeLower.includes('verify') ||
          titleLower.includes('enter') ||
          titleLower.includes('verify') ||
          msgLower.includes('enter the otp') ||
          msgLower.includes('enter otp')
        ) {
          continue;
        }

        // Return OTP detection (when owner accepts return request)
        const isReturnAccepted =
          actionTypeLower.includes('return_otp') ||
          titleLower.includes('return otp') ||
          titleLower.includes('return_request_accepted') ||
          msgLower.includes('accepted your return request') ||
          msgLower.includes('your return otp is') ||
          (Boolean(actionData.return_otp) && !String(actionData.return_otp).includes('$'));

        // Pickup OTP detection (when owner accepts booking request)
        const isAcceptedOrPickup =
          actionTypeLower === 'pickup_otp_generated' ||
          actionTypeLower === 'rental_otp_generated' ||
          actionTypeLower === 'booking_accepted' ||
          actionTypeLower === 'slot_booked' ||
          actionTypeLower.includes('pickup_otp') ||
          titleLower.includes('accepted') ||
          titleLower.includes('confirmed') ||
          titleLower.includes('pickup otp') ||
          titleLower.includes('booking request accepted') ||
          msgLower.includes('booking request accepted') ||
          msgLower.includes('pickup otp') ||
          msgLower.includes('your otp is') ||
          msgLower.includes('share this otp') ||
          Boolean(actionData.pickup_otp || actionData.otp_code);

        if (!isAcceptedOrPickup && !isReturnAccepted) continue;

        let otp: string | null = null;

        if (isReturnAccepted) {
          if (actionData.return_otp && !String(actionData.return_otp).includes('$')) {
            const digits = String(actionData.return_otp).replace(/\D/g, '');
            if (digits.length >= 4 && digits.length <= 6) otp = digits;
          }
          if (!otp) {
            const returnMatch = String(item.message || '').match(/(?:return\s+otp(?:\s+code)?\s+is\s+|otp\s+is\s+|otp:\s*)(\d{4,6})/i);
            if (returnMatch && returnMatch[1]) otp = returnMatch[1];
          }
          if (!otp) {
            const sixDigit = String(item.message || '').match(/\b\d{6}\b/);
            if (sixDigit) otp = sixDigit[0];
          }
        } else {
          const cand =
            actionData.pickup_otp ||
            actionData.otp_code ||
            actionData.otp ||
            (item as any).pickup_otp ||
            (item as any).otp_code;
          if (cand && !String(cand).includes('$')) {
            const digits = String(cand).replace(/\D/g, '');
            if (digits.length >= 4 && digits.length <= 6) otp = digits;
          }
          if (!otp) {
            const match = String(item.message || '').match(/\b\d{6}\b/);
            if (match) otp = match[0];
          }
        }

        const bookingId = item.booking_id || actionData.booking_id || actionData.bookingId;

        if (otp) {
          const cleanOtp = String(otp).trim();
          const notifIdStr = String(item.id);
          const uniqueKey = isReturnAccepted
            ? `return_otp_${notifIdStr}_${bookingId || cleanOtp}`
            : `${notifIdStr}_${bookingId || cleanOtp}`;
          const isShown = await AcceptedOtpCoordinator.isAlreadyShown(uniqueKey);
          const isIdShown = await AcceptedOtpCoordinator.isAlreadyShown(notifIdStr);
          const isReturnIdShown = await AcceptedOtpCoordinator.isAlreadyShown(`return_id_${notifIdStr}`);
          const isBookingShown = bookingId
            ? await AcceptedOtpCoordinator.isAlreadyShown(String(bookingId))
            : false;
          const isBookingKeyShown = bookingId
            ? await AcceptedOtpCoordinator.isAlreadyShown(
                isReturnAccepted ? `booking_return_${bookingId}` : `booking_${bookingId}`
              )
            : false;
          const isOtpShown = await AcceptedOtpCoordinator.isAlreadyShown(cleanOtp);

          if (!isShown && !isIdShown && !isReturnIdShown && !isBookingShown && !isBookingKeyShown && !isOtpShown) {
            console.log(
              `[NotificationStore] 🎊 TRIGGERING ${isReturnAccepted ? 'RETURN' : 'PICKUP'} OTP POPUP (OTP: ${cleanOtp}) for Booking: ${bookingId || notifIdStr}`
            );

            await AcceptedOtpCoordinator.markAsShown([
              uniqueKey,
              notifIdStr,
              `id_${notifIdStr}`,
              `return_id_${notifIdStr}`,
              ...(bookingId ? [String(bookingId), `booking_${bookingId}`, `booking_return_${bookingId}`] : []),
              cleanOtp,
              `otp_${cleanOtp}`,
            ]);

            const cycleTitle =
              actionData.cycle_title ||
              actionData.cycle_name ||
              actionData.brand ||
              actionData.cycleBrand ||
              'Campus Cycle';

            const ownerName =
              actionData.owner_name ||
              actionData.ownerName ||
              actionData.owner_full_name;

            const location = actionData.location || actionData.cycle_location;

            AcceptedOtpCoordinator.showAcceptedOtp({
              notificationId: notifIdStr,
              bookingId: bookingId ? String(bookingId) : undefined,
              otp: cleanOtp,
              cycleTitle,
              ownerName,
              location,
              message: item.message,
              type: isReturnAccepted ? 'return' : 'pickup',
            });

            break;
          }
        }
      }

      // MERGE incoming with cached items for THIS access token session only
      const mergedMap = new Map<string, NotificationItem>();

      // 1. Seed with cached items from this session's persistent storage
      cachedList.forEach((n) => {
        if (
          n &&
          n.id &&
          !deletedIds.has(String(n.id)) &&
          String(n.title).trim().toUpperCase() !== 'PAYMENT_PENDING'
        ) {
          mergedMap.set(String(n.id), n);
        }
      });

      // 2. Seed with existing in-memory state
      this.notifications.forEach((n) => {
        if (
          n &&
          n.id &&
          !deletedIds.has(String(n.id)) &&
          String(n.title).trim().toUpperCase() !== 'PAYMENT_PENDING'
        ) {
          mergedMap.set(String(n.id), n);
        }
      });

      // 3. Upsert newly incoming items
      incomingFormatted.forEach((incoming) => {
        if (incoming && incoming.id && !deletedIds.has(String(incoming.id))) {
          const existing = mergedMap.get(String(incoming.id));
          const isReadLocally = existing?.is_read || readIds.has(String(incoming.id));
          mergedMap.set(String(incoming.id), {
            ...existing,
            ...incoming,
            is_read: isReadLocally ? true : incoming.is_read,
          });
        }
      });

      // 4. Sort by created_at descending
      const mergedList = Array.from(mergedMap.values()).sort((a, b) => {
        const tA = new Date(a.created_at).getTime() || 0;
        const tB = new Date(b.created_at).getTime() || 0;
        return tB - tA;
      });

      this.notifications = mergedList;
      this.loading = false;
      this.notify();

      AsyncStorage.setItem(storageKey, JSON.stringify(mergedList)).catch((err) =>
        console.warn('[NotificationStore] Cache write error:', err)
      );
    } catch (err: any) {
      console.warn('[NotificationStore] Error fetching notifications:', err?.message || err);
      this.loading = false;
      this.notify();
    } finally {
      this.isFetching = false;
    }
  }

  public async markAsRead(id: string) {
    const token = await getAccessToken();
    const { storageKey, readKey } = getStorageKeys(token);

    const readIds = await getStoredIdSet(readKey);
    readIds.add(id);
    await saveStoredIdSet(readKey, readIds);

    this.notifications = this.notifications.map((n) => (n.id === id ? { ...n, is_read: true } : n));
    this.notify();
    AsyncStorage.setItem(storageKey, JSON.stringify(this.notifications)).catch(() => {});

    // Dispatch backend PATCH /api/notifications/mark-notifications with [id]
    apiClient.markNotifications([id]).catch((err) =>
      console.warn('[NotificationStore] markNotifications backend error:', err?.message || err)
    );
  }

  public async markAllAsRead() {
    const token = await getAccessToken();
    const { storageKey, readKey } = getStorageKeys(token);

    const unreadIds = this.notifications.filter((n) => !n.is_read).map((n) => n.id);
    const readIds = await getStoredIdSet(readKey);
    this.notifications.forEach((n) => readIds.add(n.id));
    await saveStoredIdSet(readKey, readIds);

    this.notifications = this.notifications.map((n) => ({ ...n, is_read: true }));
    this.notify();
    AsyncStorage.setItem(storageKey, JSON.stringify(this.notifications)).catch(() => {});

    // Dispatch backend PATCH /api/notifications/mark-notifications with unread IDs
    if (unreadIds.length > 0) {
      apiClient.markNotifications(unreadIds).catch((err) =>
        console.warn('[NotificationStore] markAllAsRead backend error:', err?.message || err)
      );
    }
  }

  public async markMultipleAsRead(ids: string[]) {
    if (!ids || ids.length === 0) return;
    const token = await getAccessToken();
    const { storageKey, readKey } = getStorageKeys(token);

    const idSet = new Set(ids.map(String));
    const readIds = await getStoredIdSet(readKey);
    ids.forEach((id) => readIds.add(String(id)));
    await saveStoredIdSet(readKey, readIds);

    this.notifications = this.notifications.map((n) => (idSet.has(n.id) ? { ...n, is_read: true } : n));
    this.notify();
    AsyncStorage.setItem(storageKey, JSON.stringify(this.notifications)).catch(() => {});

    // Dispatch backend PATCH /api/notifications/mark-notifications with selected IDs
    apiClient.markNotifications(ids).catch((err) =>
      console.warn('[NotificationStore] markMultipleAsRead backend error:', err?.message || err)
    );
  }

  public async deleteNotification(id: string) {
    const token = await getAccessToken();
    const { storageKey, deletedKey } = getStorageKeys(token);

    const deletedIds = await getStoredIdSet(deletedKey);
    deletedIds.add(id);
    await saveStoredIdSet(deletedKey, deletedIds);

    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
    AsyncStorage.setItem(storageKey, JSON.stringify(this.notifications)).catch(() => {});

    // Dispatch backend PATCH /api/notifications/clear-notifications with [id]
    apiClient.clearNotifications([id]).catch((err) =>
      console.warn('[NotificationStore] clearNotifications backend error:', err?.message || err)
    );
  }

  public async clearAllNotifications() {
    const token = await getAccessToken();
    const { storageKey, deletedKey } = getStorageKeys(token);

    const allIds = this.notifications.map((n) => n.id);
    const deletedIds = await getStoredIdSet(deletedKey);
    this.notifications.forEach((n) => deletedIds.add(n.id));
    await saveStoredIdSet(deletedKey, deletedIds);

    this.notifications = [];
    this.notify();
    await AsyncStorage.removeItem(storageKey).catch(() => {});

    // Dispatch backend PATCH /api/notifications/clear-notifications with all IDs
    if (allIds.length > 0) {
      apiClient.clearNotifications(allIds).catch((err) =>
        console.warn('[NotificationStore] clearAllNotifications backend error:', err?.message || err)
      );
    }
  }

  public async clearMultipleNotifications(ids: string[]) {
    if (!ids || ids.length === 0) return;
    const token = await getAccessToken();
    const { storageKey, deletedKey } = getStorageKeys(token);

    const idSet = new Set(ids.map(String));
    const deletedIds = await getStoredIdSet(deletedKey);
    ids.forEach((id) => deletedIds.add(String(id)));
    await saveStoredIdSet(deletedKey, deletedIds);

    this.notifications = this.notifications.filter((n) => !idSet.has(n.id));
    this.notify();
    AsyncStorage.setItem(storageKey, JSON.stringify(this.notifications)).catch(() => {});

    // Dispatch backend PATCH /api/notifications/clear-notifications with selected IDs
    apiClient.clearNotifications(ids).catch((err) =>
      console.warn('[NotificationStore] clearMultipleNotifications backend error:', err?.message || err)
    );
  }

  public reset() {
    this.notifications = [];
    this.loading = false;
    this.activeTokenSig = 'unauthed';
    this.activeToken = null;
    this.notify();
  }
}

export const notificationStore = new NotificationStore();

/**
 * useNotifications hook
 * Consumed by any screen to read notifications and trigger read/delete actions.
 * Shares the single global 5-second polling interval and state.
 */
export function useNotifications() {
  const [, setTick] = useState(0);

  useEffect(() => {
    // Ensure the single global poller is active
    notificationStore.init();

    // Subscribe to shared state updates
    const unsubscribe = notificationStore.subscribe(() => {
      setTick((t) => t + 1);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const state = notificationStore.getState();

  const refreshNotifications = useCallback(async () => {
    await notificationStore.fetchNotifications(true);
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    await notificationStore.markAsRead(id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    await notificationStore.markAllAsRead();
  }, []);

  const markMultipleAsRead = useCallback(async (ids: string[]) => {
    await notificationStore.markMultipleAsRead(ids);
  }, []);

  const deleteNotification = useCallback(async (id: string) => {
    await notificationStore.deleteNotification(id);
  }, []);

  const clearAllNotifications = useCallback(async () => {
    await notificationStore.clearAllNotifications();
  }, []);

  const clearMultipleNotifications = useCallback(async (ids: string[]) => {
    await notificationStore.clearMultipleNotifications(ids);
  }, []);

  return {
    notifications: state.notifications,
    loading: state.loading,
    unreadCount: state.unreadCount,
    refreshNotifications,
    refetch: refreshNotifications,
    markAsRead,
    markAllAsRead,
    markMultipleAsRead,
    deleteNotification,
    clearAllNotifications,
    clearMultipleNotifications,
  };
}
