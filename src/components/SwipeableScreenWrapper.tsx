import React, { useRef, useCallback } from 'react';
import {
  Animated,
  PanResponder,
  Dimensions,
  StyleSheet,
  Alert,
  View,
  ViewStyle,
  StyleProp,
  Easing,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/navigationTypes';
import { useAuth } from '../hooks/useAuth';
import { getAccessToken } from '../lib/secureStorage';
import { colors } from '../lib/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export type TabKey = 'home' | 'rentals' | 'cycles' | 'profile';

interface SwipeableScreenWrapperProps {
  currentTab: TabKey;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disableSwipe?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Main navigation tab order from left to right:
// 0: Explore (Home)
// 1: Rentals (OngoingRentals)
// 2: My Cycles (CycleOwner)
// 3: Profile (Profile)
const TAB_ORDER: TabKey[] = ['home', 'rentals', 'cycles', 'profile'];

const TAB_ROUTES: Record<TabKey, keyof RootStackParamList> = {
  home: 'Home',
  rentals: 'OngoingRentals',
  cycles: 'CycleOwner',
  profile: 'Profile',
};

const TAB_LABELS: Record<TabKey, string> = {
  home: 'explore',
  rentals: 'ongoing rentals',
  cycles: 'your listed cycles',
  profile: 'your profile',
};

// Module-level tracker for the previously active tab
let previousTabKey: TabKey | null = null;

export default function SwipeableScreenWrapper({
  currentTab,
  children,
  style,
  disableSwipe = false,
}: SwipeableScreenWrapperProps) {
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const translateX = useRef(new Animated.Value(0)).current;
  const isNavigatingRef = useRef(false);

  const currentIndex = TAB_ORDER.indexOf(currentTab);
  const nextTab: TabKey | null =
    currentIndex < TAB_ORDER.length - 1 ? TAB_ORDER[currentIndex + 1] : null;
  const prevTab: TabKey | null = currentIndex > 0 ? TAB_ORDER[currentIndex - 1] : null;

  // Gentle opacity fade as the screen slides
  const opacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH * 0.45, 0, SCREEN_WIDTH * 0.45],
    outputRange: [0.75, 1, 0.75],
    extrapolate: 'clamp',
  });

  // Smoothly transition screen content on tab change, leaving bottom navbar completely static
  useFocusEffect(
    useCallback(() => {
      isNavigatingRef.current = false;

      if (previousTabKey && previousTabKey !== currentTab) {
        const prevIndex = TAB_ORDER.indexOf(previousTabKey);
        // If moving forward in tab order (e.g. 0 -> 1), content slides in from the right.
        // If moving backward (e.g. 2 -> 1), content slides in from the left.
        const enterFromRight = prevIndex < currentIndex;
        const startOffset = enterFromRight ? SCREEN_WIDTH * 0.28 : -SCREEN_WIDTH * 0.28;

        translateX.setValue(startOffset);

        Animated.timing(translateX, {
          toValue: 0,
          duration: 210,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        translateX.setValue(0);
      }

      previousTabKey = currentTab;
    }, [currentTab, currentIndex, translateX])
  );

  const handleNavigateToTab = useCallback(
    async (targetTab: TabKey, direction: 'left' | 'right') => {
      // Protected tabs check (Rentals, My Cycles, Profile require authentication)
      if (targetTab !== 'home') {
        const token = await getAccessToken();
        if (!token && !user) {
          isNavigatingRef.current = false;
          Animated.spring(translateX, {
            toValue: 0,
            tension: 80,
            friction: 9,
            useNativeDriver: true,
          }).start();

          Alert.alert(
            'Sign In Required',
            `Please sign in to view ${TAB_LABELS[targetTab]}.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign In', onPress: () => navigation.navigate('Login') },
            ]
          );
          return;
        }
      }

      previousTabKey = currentTab;

      // 1. Smoothly glide the exiting screen content
      const targetOffset = direction === 'left' ? -SCREEN_WIDTH * 0.35 : SCREEN_WIDTH * 0.35;
      Animated.timing(translateX, {
        toValue: targetOffset,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      // 2. Navigate to target tab route
      const targetRoute = TAB_ROUTES[targetTab];
      const routesInStack = navigation.getState?.()?.routes || [];
      const prevRouteInStack = routesInStack[routesInStack.length - 2]?.name;

      if (direction === 'right' && prevRouteInStack === targetRoute) {
        navigation.goBack();
      } else {
        navigation.navigate(targetRoute as any, { refresh: Date.now() });
      }
    },
    [navigation, user, translateX, currentTab]
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (disableSwipe || isNavigatingRef.current) return false;
        const dx = Math.abs(gestureState.dx);
        const dy = Math.abs(gestureState.dy);
        // Fast, responsive trigger: horizontal movement > 12px and > 1.4x vertical movement
        return dx > 12 && dx > dy * 1.4;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        if (disableSwipe || isNavigatingRef.current) return false;
        const dx = Math.abs(gestureState.dx);
        const dy = Math.abs(gestureState.dy);
        return dx > 20 && dx > dy * 1.8;
      },
      onPanResponderMove: (_, gestureState) => {
        if (isNavigatingRef.current) return;
        const dx = gestureState.dx;

        // Apply slight resistance when dragging against boundary edges with no screen
        if (dx < 0 && !nextTab) {
          translateX.setValue(dx * 0.2);
        } else if (dx > 0 && !prevTab && currentTab !== 'home') {
          translateX.setValue(dx * 0.2);
        } else {
          translateX.setValue(dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isNavigatingRef.current) return;

        const dx = gestureState.dx;
        const vx = gestureState.vx;
        const SWIPE_DIST = 35; // Sensitive, responsive swipe threshold
        const SWIPE_VEL = 0.25;

        // 1. Swiping to the right page (dragging finger leftwards: Explore -> Rentals -> My Cycles -> Profile)
        if (dx < -SWIPE_DIST || (dx < -12 && vx < -SWIPE_VEL)) {
          if (nextTab) {
            isNavigatingRef.current = true;
            handleNavigateToTab(nextTab, 'left');
            return;
          }
        }

        // 2. Swiping to the left page (dragging finger rightwards: Profile -> My Cycles -> Rentals -> Explore)
        if (dx > SWIPE_DIST || (dx > 12 && vx > SWIPE_VEL)) {
          if (prevTab) {
            isNavigatingRef.current = true;
            handleNavigateToTab(prevTab, 'right');
            return;
          } else if (currentTab === 'home' && nextTab) {
            // Friendly allowance on Home: swiping rightwards smoothly navigates to Rentals
            isNavigatingRef.current = true;
            handleNavigateToTab(nextTab, 'left');
            return;
          }
        }

        // Threshold not met or no target: spring smoothly back into position
        Animated.spring(translateX, {
          toValue: 0,
          velocity: vx,
          tension: 80,
          friction: 9,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, {
          toValue: 0,
          tension: 80,
          friction: 9,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.animatedContent,
          {
            transform: [{ translateX }],
            opacity,
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.backgroundDark,
  },
  animatedContent: {
    flex: 1,
  },
});
