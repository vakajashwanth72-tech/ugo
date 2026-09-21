import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../lib/theme';
import { RootStackParamList } from './navigationTypes';

// Auth Screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import EmailOtpScreen from '../screens/auth/EmailOtpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';

// Landing Screen
import LandingScreen from '../screens/landing/LandingScreen';

// Choice Screen
import ChoiceScreen from '../screens/choice/ChoiceScreen';

// Main Screens
import HomeScreen from '../screens/home/HomeScreen';
import BookingDetailScreen from '../screens/booking/BookingDetailScreen';
import OngoingRentalsScreen from '../screens/rentals/OngoingRentalsScreen';
import CycleOwnerScreen from '../screens/owner/CycleOwnerScreen';
import ListingScreen from '../screens/owner/ListingScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import OtpVerificationScreen from '../screens/otp/OtpVerificationScreen';
import ReturnScreen from '../screens/return/ReturnScreen';
import ChatScreen from '../screens/chat/ChatScreen';
import CallModal from '../screens/call/CallModal';
import ProfileScreen from '../screens/profile/ProfileScreen';
import BookingHistoryScreen from '../screens/profile/BookingHistoryScreen';

// Admin Screens
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import CycleVerificationScreen from '../screens/admin/CycleVerificationScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const initialRoute = user ? (isAdmin ? 'AdminDashboard' : 'Home') : 'Landing';

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Landing */}
      <Stack.Screen name="Landing" component={LandingScreen} />

      {/* Auth */}
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="EmailOtp" component={EmailOtpScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />

      {/* Role Choice */}
      <Stack.Screen name="Choice" component={ChoiceScreen} />

      {/* Main App */}
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="BookingDetail" component={BookingDetailScreen} />
      <Stack.Screen name="OngoingRentals" component={OngoingRentalsScreen} />
      <Stack.Screen name="CycleOwner" component={CycleOwnerScreen} />
      <Stack.Screen name="Listing" component={ListingScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
      <Stack.Screen name="Return" component={ReturnScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen
        name="CallModal"
        component={CallModal}
        options={{
          presentation: 'fullScreenModal',
          animation: 'fade_from_bottom',
        }}
      />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="BookingHistory" component={BookingHistoryScreen} />

      {/* Admin */}
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
      <Stack.Screen name="CycleVerification" component={CycleVerificationScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
});
