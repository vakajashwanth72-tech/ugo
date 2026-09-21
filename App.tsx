import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import RootNavigator from './src/navigation/RootNavigator';
import { RootStackParamList } from './src/navigation/navigationTypes';
import { supabase } from './src/lib/supabase';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  // Global listener for incoming WebRTC calls
  useEffect(() => {
    let channel: any = null;

    const setupCallListener = async () => {
      const { data } = await supabase.auth.getSession();
      const currentUserId = data.session?.user?.id;
      if (!currentUserId) return;

      channel = supabase
        .channel(`global-calls-${currentUserId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'call_sessions',
            filter: `callee_id=eq.${currentUserId}`,
          },
          async (payload: any) => {
            const session = payload.new;
            if (session.status === 'ringing' && navigationRef.isReady()) {
              // Fetch caller name
              const { data: callerProfile } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', session.caller_id)
                .single();

              const callerName =
                callerProfile?.full_name || callerProfile?.email?.split('@')[0] || 'Incoming Caller';

              navigationRef.navigate('CallModal', {
                targetUserId: session.caller_id,
                targetUserName: callerName,
                bookingId: session.booking_id,
              });
            }
          }
        )
        .subscribe();
    };

    setupCallListener();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <StatusBar style="light" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
