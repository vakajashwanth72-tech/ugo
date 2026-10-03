import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './apiClient';

export interface AcceptedOtpPayload {
  notificationId?: string;
  bookingId?: string;
  otp: string;
  cycleTitle?: string;
  ownerName?: string;
  location?: string;
  message?: string;
  totalPrice?: number;
  type?: 'pickup' | 'return';
}

export interface AcceptedOtpState {
  isVisible: boolean;
  payload: AcceptedOtpPayload | null;
}

type Listener = (state: AcceptedOtpState) => void;

const SHOWN_OTPS_KEY = '@ugo_shown_accepted_otps';

class AcceptedOtpCoordinatorManager {
  private isVisible = false;
  private payload: AcceptedOtpPayload | null = null;
  private listeners: Set<Listener> = new Set();
  private shownSetInMemory: Set<string> = new Set();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.initStorage();
  }

  private async initStorage() {
    try {
      const raw = await AsyncStorage.getItem(SHOWN_OTPS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((id: string) => this.shownSetInMemory.add(String(id)));
        }
      }
    } catch (e) {
      console.warn('[AcceptedOtpCoordinator] Error loading shown OTPs set:', e);
    }
  }

  public getState(): AcceptedOtpState {
    return {
      isVisible: this.isVisible,
      payload: this.payload,
    };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('[AcceptedOtpCoordinator] Error in listener execution:', err);
      }
    });
  }

  /**
   * Checks whether this notification or booking ID has already triggered a celebration popup.
   */
  public async isAlreadyShown(uniqueKey?: string): Promise<boolean> {
    if (!uniqueKey) return false;
    const cleanKey = String(uniqueKey).trim();
    if (!cleanKey) return false;

    if (this.initPromise) {
      await this.initPromise;
    }

    if (this.shownSetInMemory.has(cleanKey)) {
      return true;
    }

    try {
      const raw = await AsyncStorage.getItem(SHOWN_OTPS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.includes(cleanKey)) {
          this.shownSetInMemory.add(cleanKey);
          return true;
        }
      }
    } catch {}

    return false;
  }

  /**
   * Marks notification or booking IDs as shown so they won't repeat on future polls.
   */
  public async markAsShown(keys: string | string[]): Promise<void> {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const validKeys = keyList.map((k) => String(k).trim()).filter(Boolean);
    if (validKeys.length === 0) return;

    validKeys.forEach((k) => this.shownSetInMemory.add(k));

    try {
      const raw = await AsyncStorage.getItem(SHOWN_OTPS_KEY);
      let arr: string[] = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
      let modified = false;
      validKeys.forEach((k) => {
        if (!arr.includes(k)) {
          arr.push(k);
          modified = true;
        }
      });
      if (modified) {
        if (arr.length > 200) arr = arr.slice(-200);
        await AsyncStorage.setItem(SHOWN_OTPS_KEY, JSON.stringify(arr));
      }
    } catch (err) {
      console.warn('[AcceptedOtpCoordinator] Error persisting shown key:', err);
    }
  }

  /**
   * Triggers the celebration modal with ribbons and Pickup OTP.
   */
  public showAcceptedOtp(payload: AcceptedOtpPayload): boolean {
    if (!payload.otp) {
      console.warn('[AcceptedOtpCoordinator] Cannot show modal without an OTP code.');
      return false;
    }

    // If modal is already open, do not overwrite unless it's a newer request
    if (this.isVisible) {
      console.log('[AcceptedOtpCoordinator] Modal already visible, ignoring duplicate trigger.');
      return false;
    }

    const keysToMark: string[] = [];
    if (payload.notificationId) {
      keysToMark.push(
        String(payload.notificationId),
        `id_${payload.notificationId}`,
        `return_id_${payload.notificationId}`
      );
    }
    if (payload.bookingId) {
      keysToMark.push(
        String(payload.bookingId),
        `booking_${payload.bookingId}`,
        `booking_return_${payload.bookingId}`
      );
    }
    if (payload.otp) {
      keysToMark.push(String(payload.otp), `otp_${payload.otp}`);
    }

    console.log(`[AcceptedOtpCoordinator] 🎉 Triggering Booking Accepted Celebration Modal! OTP: ${payload.otp}`);

    this.isVisible = true;
    this.payload = payload;
    this.notify();

    if (keysToMark.length > 0) {
      this.markAsShown(keysToMark);
    }

    return true;
  }

  /**
   * Dismisses the celebration modal and marks the notification as read on the backend API.
   */
  public async dismiss(notificationId?: string, bookingId?: string): Promise<void> {
    const activePayload = this.payload;
    const targetNotifId = notificationId || activePayload?.notificationId;
    const targetBookingId = bookingId || activePayload?.bookingId;
    const targetOtp = activePayload?.otp;

    console.log(`[AcceptedOtpCoordinator] Dismissing celebration modal. Target Notif: ${targetNotifId || 'none'}`);

    // Persist all keys to ensure it never re-triggers
    const keysToPersist: string[] = [];
    if (targetNotifId) {
      keysToPersist.push(
        String(targetNotifId),
        `id_${targetNotifId}`,
        `return_id_${targetNotifId}`
      );
    }
    if (targetBookingId) {
      keysToPersist.push(
        String(targetBookingId),
        `booking_${targetBookingId}`,
        `booking_return_${targetBookingId}`
      );
    }
    if (targetOtp) {
      keysToPersist.push(String(targetOtp), `otp_${targetOtp}`);
    }

    if (keysToPersist.length > 0) {
      await this.markAsShown(keysToPersist);
    }

    this.isVisible = false;
    this.payload = null;
    this.notify();

    // Call suitable backend API endpoint to mark the notification as read
    if (targetNotifId) {
      try {
        console.log(`[AcceptedOtpCoordinator] Calling PATCH /api/notifications/mark-notifications for [${targetNotifId}]`);
        await apiClient.markNotifications([String(targetNotifId)]);
      } catch (err: any) {
        console.warn('[AcceptedOtpCoordinator] Backend markNotifications error on dismiss:', err?.message || err);
      }
    }
  }

  /**
   * Clears the history of shown OTPs on logout.
   */
  public async clearHistory() {
    this.shownSetInMemory.clear();
    this.isVisible = false;
    this.payload = null;
    this.notify();
    try {
      await AsyncStorage.removeItem(SHOWN_OTPS_KEY);
    } catch {}
  }
}

export const AcceptedOtpCoordinator = new AcceptedOtpCoordinatorManager();
