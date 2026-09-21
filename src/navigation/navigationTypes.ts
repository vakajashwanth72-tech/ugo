import { Cycle } from '../types';

export type RootStackParamList = {
  Login: undefined;
  SignUp: undefined;
  EmailOtp: { verifyUrl: string; email: string; fullName?: string; isForgotPassword?: boolean };
  ForgotPassword: { email?: string } | undefined;
  ResetPassword: { resetUrl?: string; tempToken?: string; email?: string } | undefined;
  Choice: undefined;
  Home: undefined;
  BookingDetail: { cycle: Cycle };
  OngoingRentals: undefined;
  CycleOwner: { refresh?: number } | undefined;
  Landing: undefined;
  Listing: { editCycleId?: string; cycleId?: any; cycle?: Cycle } | undefined;
  Notifications: undefined;
  OtpVerification: { bookingId: string; actionType?: string };
  Return: { bookingId: string };
  Chat: { bookingId: string; otherUserId: string; otherUserName: string };
  CallModal: { targetUserId?: string; targetUserName?: string; bookingId?: string };
  Profile: undefined;
  BookingHistory: undefined;
  AdminDashboard: undefined;
  CycleVerification: { cycleId: string; cycle?: Cycle };
  OwnerDetails: { ownerId?: string; owner?: any };
};
