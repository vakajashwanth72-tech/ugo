/**
 * PaymentCoordinator
 * 
 * Strict Single-Instance UI Lock (Mutex) to guard Razorpay checkout popups.
 * Prevents race conditions, overlapping polling cycles, and duplicate Razorpay
 * modal triggers across foreground polling, FCM pushes, and user interactions.
 */

export interface PaymentPayload {
  payment_id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  razorpay_key?: string;
  status?: string;
  booking_id?: string;
  userEmail?: string;
  userName?: string;
  userContact?: string;
  [key: string]: any;
}

export interface PaymentCoordinatorState {
  isPaymentCheckoutActive: boolean;
  activeOrderId: string | null;
  activePayload: PaymentPayload | null;
}

type Listener = (state: PaymentCoordinatorState) => void;

class PaymentCoordinatorManager {
  private isPaymentCheckoutActive = false;
  private activeOrderId: string | null = null;
  private activePayload: PaymentPayload | null = null;
  private listeners: Set<Listener> = new Set();
  private safetyTimeoutId: any = null;
  private cancelledPaymentIds: Set<string> = new Set();

  /**
   * Returns current snapshot of coordinator state.
   */
  public getState(): PaymentCoordinatorState {
    return {
      isPaymentCheckoutActive: this.isPaymentCheckoutActive,
      activeOrderId: this.activeOrderId,
      activePayload: this.activePayload,
    };
  }

  /**
   * Subscribe to state changes (used by root App component to show/hide checkout modal).
   */
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Immediately emit current state
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
        console.error('[PaymentCoordinator] Error in listener execution:', err);
      }
    });
  }

  private completedPaymentIds: Set<string> = new Set();

  /**
   * Marks a payment or order ID as permanently cancelled by user.
   * Future notification polls for this ID will be rejected immediately.
   */
  public markPaymentCancelled(id?: string) {
    if (!id) return;
    const cleanId = String(id).trim();
    if (cleanId) {
      this.cancelledPaymentIds.add(cleanId);
      console.log(`[PaymentCoordinator] ⛔ Marked payment/order ${cleanId} as CANCELLED. Will reject repeated triggers.`);
    }
  }

  /**
   * Marks a payment or order ID as permanently completed after Razorpay success.
   * Strictly avoids asking backend for verification: backend verifies independently
   * and stops sending notifications. Frontend suppresses any further payment popups.
   */
  public markPaymentCompleted(id?: string) {
    if (!id) return;
    const cleanId = String(id).trim();
    if (cleanId) {
      this.completedPaymentIds.add(cleanId);
      console.log(`[PaymentCoordinator] ✅ Marked payment/order ${cleanId} as COMPLETED. No backend verification needed.`);
    }
  }

  public isPaymentCancelled(id?: string): boolean {
    if (!id) return false;
    return this.cancelledPaymentIds.has(String(id).trim());
  }

  public isPaymentCompleted(id?: string): boolean {
    if (!id) return false;
    return this.completedPaymentIds.has(String(id).trim());
  }

  /**
   * Request to acquire the checkout lock and trigger Razorpay.
   * If a checkout is already active, rejects duplicate calls to prevent duplicate popups.
   * 
   * @param orderIdentifier - Razorpay order_id or unique payment reference
   * @param payload - Complete payment payload received from notification or poller
   * @returns boolean - true if lock acquired; false if busy / duplicate
   */
  public acquireLock(orderIdentifier: string, payload: PaymentPayload): boolean {
    const normalizedId = String(orderIdentifier || payload.order_id || payload.payment_id || '').trim();

    // 0. Guard: Check if user already cancelled or completed this payment
    if (
      this.isPaymentCancelled(normalizedId) ||
      this.isPaymentCancelled(payload.payment_id) ||
      this.isPaymentCancelled(payload.order_id)
    ) {
      console.log(`[PaymentCoordinator] ⛔ Suppressing payment trigger: Payment ${normalizedId} was already cancelled by user.`);
      return false;
    }

    if (
      this.isPaymentCompleted(normalizedId) ||
      this.isPaymentCompleted(payload.payment_id) ||
      this.isPaymentCompleted(payload.order_id)
    ) {
      console.log(`[PaymentCoordinator] ⛔ Suppressing payment trigger: Payment ${normalizedId} is ALREADY COMPLETED.`);
      return false;
    }

    // 1. Guard: Check if checkout is already open
    if (this.isPaymentCheckoutActive) {
      if (this.activeOrderId === normalizedId) {
        console.warn(
          `[PaymentCoordinator] 🔒 Lock BUSY: Order ${normalizedId} is ALREADY open in Razorpay checkout. Ignoring duplicate poll/push.`
        );
      } else {
        console.warn(
          `[PaymentCoordinator] 🔒 Lock BUSY: A checkout is currently active for order ${this.activeOrderId}. Ignoring new request for order ${normalizedId}.`
        );
      }
      return false;
    }

    // 2. Acquire lock
    this.isPaymentCheckoutActive = true;
    this.activeOrderId = normalizedId || `order_${Date.now()}`;
    this.activePayload = payload;

    console.log(
      `[PaymentCoordinator] 🔑 Lock ACQUIRED for order: ${this.activeOrderId}. Mounting Razorpay Checkout Modal.`
    );
    console.log('[PaymentCoordinator] Checkout Payload:', JSON.stringify(payload, null, 2));

    // 3. Safety timeout: Automatically release lock after 5 minutes in case of abnormal app exit
    if (this.safetyTimeoutId) {
      clearTimeout(this.safetyTimeoutId);
    }
    this.safetyTimeoutId = setTimeout(() => {
      console.warn(
        `[PaymentCoordinator] ⏱️ Safety timeout expired (5 mins) for order ${this.activeOrderId}. Force-releasing lock to prevent UI deadlock.`
      );
      this.releaseLock('SAFETY_TIMEOUT_FORCE_RELEASE');
    }, 5 * 60 * 1000);

    this.notify();
    return true;
  }

  /**
   * Releases the UI lock after payment succeeds, user cancels, or payment fails.
   */
  public releaseLock(reason: string = 'NORMAL_COMPLETION') {
    if (this.safetyTimeoutId) {
      clearTimeout(this.safetyTimeoutId);
      this.safetyTimeoutId = null;
    }

    const previousOrder = this.activeOrderId;
    this.isPaymentCheckoutActive = false;
    this.activeOrderId = null;
    this.activePayload = null;

    console.log(
      `[PaymentCoordinator] 🔓 Lock RELEASED for order: ${previousOrder || 'none'}. Reason: ${reason}. System is now ready for future payments.`
    );

    this.notify();
  }
}

export const PaymentCoordinator = new PaymentCoordinatorManager();
