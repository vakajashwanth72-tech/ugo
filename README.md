# UgO NITK — Mobile App (React Native & TypeScript Expo)

UgO is the official peer-to-peer bicycle sharing platform for the National Institute of Technology Karnataka (NITK) Surathkal campus. This is the complete mobile application ported from the React web application, built with **React Native (Expo SDK 52)**, **TypeScript**, **Supabase**, **n8n Automation Workflows**, **Razorpay**, and **WebRTC Audio Calling**.

---

## 🚀 Key Improvements & Architecture Updates

1. **Pre-Payment Ride Visibility in Ongoing Rentals**:
   - In the previous web app, rides only appeared in Ongoing Rentals once they reached `active` or `return_pending`.
   - In this mobile app, as soon as the cycle owner accepts a rental request (`slot_booked` / `payment_pending`), the ride immediately appears on the **Ongoing Rentals** tab for both the renter and owner.

2. **Early Chat & Voice Call Access**:
   - Both **Real-time Chat** and **WebRTC Encrypted Audio Calls** are unlocked immediately upon owner acceptance (`slot_booked`, `payment_pending`, `active`, `return_pending`). This enables renters and owners to seamlessly coordinate campus pickup locations and timings before payment.

3. **Payment-Driven Duration Countdown**:
   - The rental timer countdown calculates and ticks **ONLY after payment is successfully completed** (`status === 'active'`).
   - Prior to payment, the card shows pickup OTP sharing or the "Pay Now" button, with clear notice that the timer starts only upon ride activation.
   - Includes **10-minute grace period** and automatic **extra charges calculation (₹2/minute)** if overtime.

4. **Real-Time Push & In-App Notifications**:
   - Direct Supabase Realtime websocket subscriptions (`notifications`, `booking_table`, `call_sessions`, `chat_messages`).
   - Unread badge counters and instant UI re-rendering without polling.

5. **In-App Razorpay Payments**:
   - Seamless checkout modal utilizing `react-native-webview` communicating via an event bridge to trigger Razorpay checkout and verify signatures.

---

## 📱 App Structure & Screens

```
src/
├── components/
│   ├── ui/                       # Reusable UI primitives (Button, Card, Input, Badge, Header)
│   ├── NotificationBell.tsx      # Real-time bell with unread badge counter
│   ├── RazorpayCheckoutModal.tsx # In-app WebView payment gateway modal
│   └── RentalBottomNav.tsx       # Bottom tab navigation bar
├── hooks/
│   ├── useAuth.ts                # Supabase auth session & profile hook
│   ├── useNotifications.ts       # Real-time notifications listener
│   └── useWebRTCCall.ts          # Peer-to-peer WebRTC voice call signaling & audio state
├── lib/
│   ├── api.ts                    # n8n webhook API client
│   ├── bookingStatus.ts          # Status helpers, gating rules, timer & overtime math
│   ├── supabase.ts               # Supabase client with AsyncStorage session persistence
│   └── theme.ts                  # NITK Navy (#0A192F) & Emerald theme tokens
├── navigation/
│   ├── navigationTypes.ts        # Type-safe navigation route params
│   └── RootNavigator.tsx         # Stack navigation with modal transitions
├── screens/
│   ├── auth/                     # Login, SignUp, ForgotPassword
│   ├── choice/                   # Role selection (Renter / Cycle Owner / Admin)
│   ├── home/                     # Cycle feed, search, filter chips, pricing
│   ├── booking/                  # Duration picker, fare calculator, booking request
│   ├── rentals/                  # Ongoing Rentals (pre-payment, active timer, return)
│   ├── owner/                    # Owner cycles inventory, availability toggle, Listing form
│   ├── notifications/            # Rental requests, accept/reject, OTP alerts
│   ├── otp/                      # 6-digit pickup & return verification
│   ├── return/                   # Return photo capture & upload
│   ├── chat/                     # Realtime messaging between renter & owner
│   ├── call/                     # WebRTC voice calling modal (Mute, Speaker, Timer)
│   ├── profile/                  # Profile edit, wallet balance, withdrawals
│   └── admin/                    # Admin metrics dashboard & cycle verification
└── types/                        # Full TypeScript data models
```

---

## ⚙️ Environment Variables (`.env`)

The project is pre-configured with the credentials from the existing web application:

```ini
EXPO_PUBLIC_SUPABASE_URL=https://pddkgrveqwmeohxszuxr.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkZGtndnJlcXdtZW9oeHN6dXhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5NzE4NzQsImV4cCI6MjA4NjU0Nzg3NH0.UjW9k0MvN532Wf5e-lYgM1k2b6hGqfP0dI2L9zN1r7o
EXPO_PUBLIC_RAZORPAY_KEY_ID=rzp_test_TSslW485AyMVnu
EXPO_PUBLIC_N8N_BASE_URL=https://ugonitk.app.n8n.cloud/webhook
```

---

## 🔗 n8n Webhook Mappings

| Action | Webhook Endpoint | Payload |
|---|---|---|
| Request Booking | `/webhook/booking` | `{ cycle_id, renter_id, owner_id, duration_hours, duration_days, total_price }` |
| Accept/Reject Ride | `/webhook/booking-acceptance` | `{ booking_id, status: 'accepted' \| 'rejected' }` |
| Verify Pickup OTP | `/webhook/otp-verification` | `{ booking_id, OTP }` |
| Return Request | `/webhook/return-request` | `{ booking_id, image_url }` |
| Verify Return OTP | `/webhook/return-otp-verification` | `{ booking_id, OTP }` |
| Submit New Cycle | `/webhook/cycle-listing` | `{ cycle_id }` |
| Admin Cycle Review | `/webhook/cycle-listing-verification` | `{ cycle_id, status, rejection_reason, admin_id }` |
| Cancel Booking | `/webhook/cancel-booking` | `{ booking_id, cancelled_by }` |
| Withdraw Balance | `/webhook/withdraw` | `{ user_id, amount, upi_id, account_holder_name }` |

---

## 🛠️ How to Run & Build

### 1. Install Dependencies
```bash
cd ugo-mobile
npm install
```

### 2. Start Expo Development Server
```bash
npx expo start
```
- Press `a` to open on an Android Emulator or connected physical device.
- Scan the QR code using the **Expo Go** app on your phone.

### 3. Build Standalone Android APK (EAS Build)
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build APK for testing
eas build -p android --profile preview
```
