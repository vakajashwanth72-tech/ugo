import AsyncStorage from '@react-native-async-storage/async-storage';

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
  private initialized = false;

  constructor() {
    this.initStorage();
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
    } finally {
      this.initialized = true;
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
   * Marks a notification or booking ID as shown so it won't repeat on future polls.
   */
  public async markAsShown(uniqueKey?: string): Promise<void> {
    if (!uniqueKey) return;
    const cleanKey = String(uniqueKey).trim();
    if (!cleanKey) return;

    this.shownSetInMemory.add(cleanKey);

    try {
      const raw = await AsyncStorage.getItem(SHOWN_OTPS_KEY);
      let arr: string[] = [];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
      if (!arr.includes(cleanKey)) {
        arr.push(cleanKey);
        // Retain at most the last 100 entries to avoid bloating storage
        if (arr.length > 100) arr = arr.slice(-100);
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

    const key = payload.notificationId || payload.bookingId || payload.otp;
    console.log(`[AcceptedOtpCoordinator] 🎉 Triggering Booking Accepted Celebration Modal! OTP: ${payload.otp}`);

    this.isVisible = true;
    this.payload = payload;
    this.notify();

    if (key) {
      this.markAsShown(key);
    }

    return true;
  }

  /**
   * Dismisses the celebration modal.
   */
  public dismiss() {
    console.log('[AcceptedOtpCoordinator] Dismissing celebration modal.');
    this.isVisible = false;
    this.payload = null;
    this.notify();
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
