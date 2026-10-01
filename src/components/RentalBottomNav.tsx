import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../lib/theme';
import { RootStackParamList } from '../navigation/navigationTypes';
import { useAuth } from '../hooks/useAuth';
import { getAccessToken } from '../lib/secureStorage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface RentalBottomNavProps {
  activeTab?: 'home' | 'rentals' | 'cycles' | 'notifications' | 'profile' | 'admin';
}

export default function RentalBottomNav({ activeTab }: RentalBottomNavProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const tabs: Array<{
    key: 'home' | 'rentals' | 'cycles' | 'profile';
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    badge?: number;
    route: keyof RootStackParamList;
  }> = [
    { key: 'home', label: 'Explore', icon: 'bicycle', route: 'Home' },
    { key: 'rentals', label: 'Rentals', icon: 'time', route: 'OngoingRentals' },
    { key: 'cycles', label: 'My Cycles', icon: 'storefront', route: 'CycleOwner' },
    { key: 'profile', label: 'Profile', icon: 'person', route: 'Profile' },
  ];

  const handleTabPress = async (tab: typeof tabs[0]) => {
    if (activeTab === tab.key) return;

    if (tab.key !== 'home') {
      const token = await getAccessToken();
      if (!token && !user) {
        const featureName =
          tab.key === 'rentals'
            ? 'ongoing rentals'
            : tab.key === 'cycles'
            ? 'your cycles'
            : 'your profile';

        Alert.alert(
          'Sign In Required',
          `Please sign in to view ${featureName}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign In', onPress: () => navigation.navigate('Login') },
          ]
        );
        return;
      }
    }
    // Navigate with a refresh param so screens re-fetch immediately on tap
    navigation.navigate(tab.route as any, { refresh: Date.now() });
  };

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabBtn}
            onPress={() => {
              handleTabPress(tab);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Ionicons
                name={isActive ? tab.icon : (`${tab.icon}-outline` as any)}
                size={22}
                color={isActive ? colors.accent : colors.textLight}
              />
              {!!tab.badge && tab.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    marginTop: 3,
    color: colors.textLight,
    fontWeight: '500',
  },
  labelActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
