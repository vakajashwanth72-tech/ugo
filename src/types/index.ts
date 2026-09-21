export type BookingStatus =
  | 'pending'
  | 'requested'
  | 'slot_booked'
  | 'payment_pending'
  | 'active'
  | 'return_pending'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'payment_failed';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'student' | 'admin';
  hostel?: string | null;
  net_balance?: number | null;
  is_blocked?: boolean;
}

export interface CycleImage {
  id: string;
  cycle_id?: string;
  image_url: string;
  storage_path?: string | null;
  display_order?: number;
}

export interface Cycle {
  id: string;
  owner_id: string;
  owner_name?: string | null;
  ownerName?: string | null;
  brand: string;
  model: string;
  price_per_hour: number;
  price_per_day: number;
  hourlyPrice?: number;
  dailyPrice?: number;
  location: string;
  status: 'available' | 'unavailable' | 'active' | 'inactive' | 'maintenance';
  is_verified: boolean;
  geared?: boolean;
  condition?: string;
  cycle_type?: string;
  description?: string;
  rating?: number;
  image?: string | null;
  images?: string[];
  created_at?: string;
  cycle_images?: CycleImage[];
  latitude?: number | null;
  longitude?: number | null;
}

export interface Booking {
  id: string;
  cycle_id: string;
  owner_id: string;
  renter_id: string;
  status: BookingStatus;
  rental_price?: number;
  total_amount?: number;
  total_price?: number;
  total_duration_hours?: number;
  duration_hours?: number;
  duration_days?: number;
  no_of_hours?: number;
  no_of_days?: number;
  start_time: string | null;
  end_time?: string | null;
  return_deadline?: string | null;
  otp_code?: string | null;
  pickup_otp?: string | null;
  pickup_otp_expires_at?: string | null;
  return_otp?: string | null;
  return_otp_expires_at?: string | null;
  return_image_url?: string | null;
  return_request_deadline?: string | null;
  renter_charge?: number | null;
  overdue_charge?: number | null;
  created_at: string;
  updated_at?: string;
  cycles?: Cycle;
  cycle_title?: string;
  cycle_image?: string | null;
  cycle_location?: string;
  other_user_id?: string;
  other_user_name?: string;
  other_user_phone?: string;
  owner_profile?: Profile | null;
  renter_profile?: Profile | null;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type?: string;
  action_type: string | null;
  action_data: any;
  payload?: any;
  payload_response?: any;
  is_read: boolean;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface CallSession {
  id: string;
  booking_id: string;
  renter_id?: string;
  owner_id?: string;
  caller_id: string;
  callee_id?: string;
  status: 'calling' | 'ringing' | 'connected' | 'rejected' | 'ended' | 'failed';
  offer?: any;
  answer?: any;
  started_at?: string | null;
  ended_at?: string;
  created_at: string;
}

export interface CallSignal {
  id: string;
  session_id?: string;
  call_id?: string;
  sender_id: string;
  type?: string;
  signal_type?: 'offer' | 'answer' | 'ice-candidate' | 'candidate';
  payload?: any;
  signal_data?: any;
  created_at: string;
}

export interface ReportItem {
  id: string;
  reported_by: string;
  reported_user_id: string;
  cycle_id: string;
  booking_id: string;
  reporter_role: 'renter' | 'owner';
  reason: string;
  description: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
}