import { colors } from './theme';

export type BookingStatus =
  | 'pending'
  | 'slot_booked'
  | 'payment_pending'
  | 'active'
  | 'return_pending'
  | 'return_requested'
  | 'completed'
  | 'cancelled'
  | 'rejected';

/**
 * Ongoing statuses that appear on the Ongoing Rentals screen.
 * Immediately when the owner accepts the ride, the booking transitions to 'slot_booked'
 * or 'payment_pending' and MUST appear on Ongoing Rentals!
 */
export const ONGOING_STATUSES: BookingStatus[] = [
  'slot_booked',
  'payment_pending',
  'active',
  'return_pending',
];

/**
 * Chat and audio calling are unlocked as soon as the owner accepts the ride
 * so that the renter and owner can coordinate cycle pickup.
 */
export const canChatOrCall = (status: BookingStatus | string): boolean => {
  const s = String(status || '').toLowerCase();
  return (
    s === 'slot_booked' ||
    s === 'payment_pending' ||
    s === 'active' ||
    s === 'return_pending' ||
    s === 'return_requested'
  );
};

/**
 * Timer duration calculation MUST run ONLY after payment completion.
 * Pre-payment states ('slot_booked', 'payment_pending') do NOT tick the ride duration countdown.
 */
export const isTimerRunning = (status: BookingStatus | string): boolean => {
  const s = String(status || '').toLowerCase();
  return s === 'active' || s === 'return_requested' || s === 'return_pending';
};

export interface StatusMeta {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}

export const getStatusMeta = (status: BookingStatus | string): StatusMeta => {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'slot_booked':
      return {
        label: 'Awaiting Pickup & Payment',
        color: '#D97706',
        bgColor: 'rgba(217, 119, 6, 0.1)',
        description: 'Ride accepted! Share pickup OTP and complete payment to start ride.',
      };
    case 'payment_pending':
      return {
        label: 'Payment Pending',
        color: '#2563EB',
        bgColor: 'rgba(37, 99, 235, 0.1)',
        description: 'Pickup verified. Complete payment to activate timer and unlock ride.',
      };
    case 'active':
      return {
        label: 'Active Ride',
        color: '#10B981',
        bgColor: 'rgba(16, 185, 129, 0.1)',
        description: 'Ride in progress. Duration countdown is ticking.',
      };
    case 'return_pending':
    case 'return_requested':
      return {
        label: 'Return Requested',
        color: '#8B5CF6',
        bgColor: 'rgba(139, 92, 246, 0.1)',
        description: 'Return requested! Awaiting return OTP verification.',
      };
    case 'completed':
      return {
        label: 'Completed',
        color: '#10B981',
        bgColor: 'rgba(16, 185, 129, 0.1)',
        description: 'Rental completed and returned successfully.',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        color: '#EF4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
        description: 'This booking was cancelled.',
      };
    default:
      return {
        label: s.replace('_', ' ').toUpperCase(),
        color: '#6B7280',
        bgColor: 'rgba(107, 114, 128, 0.1)',
        description: '',
      };
  }
};

export interface TimeBreakdown {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  totalSecondsRemaining: number;
}

export const calculateRemainingTime = (
  startTime: string | null | undefined,
  durationHours: number
): TimeBreakdown => {
  if (!startTime) {
    return {
      hours: durationHours,
      minutes: 0,
      seconds: 0,
      isExpired: false,
      totalSecondsRemaining: durationHours * 3600,
    };
  }

  const startMs = new Date(startTime).getTime();
  const endMs = startMs + durationHours * 3600 * 1000;
  const nowMs = Date.now();
  const diffMs = endMs - nowMs;

  if (diffMs <= 0) {
    return {
      hours: 0,
      minutes: 0,
      seconds: 0,
      isExpired: true,
      totalSecondsRemaining: 0,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    hours,
    minutes,
    seconds,
    isExpired: false,
    totalSecondsRemaining: totalSeconds,
  };
};

export interface ExtraChargeResult {
  minutesOverdue: number;
  extraCharges: number;
  isGracePeriod: boolean;
}

export const calculateExtraCharges = (
  startTime: string | null | undefined,
  durationHours: number,
  ratePerMinute: number = 2,
  graceMinutes: number = 10
): ExtraChargeResult => {
  if (!startTime) {
    return { minutesOverdue: 0, extraCharges: 0, isGracePeriod: false };
  }

  const startMs = new Date(startTime).getTime();
  const endMs = startMs + durationHours * 3600 * 1000;
  const nowMs = Date.now();
  const overdueMs = nowMs - endMs;

  if (overdueMs <= 0) {
    return { minutesOverdue: 0, extraCharges: 0, isGracePeriod: false };
  }

  const totalOverdueMinutes = Math.floor(overdueMs / (60 * 1000));
  if (totalOverdueMinutes <= graceMinutes) {
    return {
      minutesOverdue: totalOverdueMinutes,
      extraCharges: 0,
      isGracePeriod: true,
    };
  }

  const billableMinutes = totalOverdueMinutes - graceMinutes;
  return {
    minutesOverdue: totalOverdueMinutes,
    extraCharges: billableMinutes * ratePerMinute,
    isGracePeriod: false,
  };
};
