import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, typography, spacing } from '../../lib/theme';

export interface HeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  showLogo?: boolean;
  rightAction?: {
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  rightComponent?: React.ReactNode;
}

export default function Header({
  title,
  showBack = false,
  onBack,
  showLogo = false,
  rightAction,
  rightComponent,
}: HeaderProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.left}>
        {showBack && (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}

        {showLogo ? (
          <TouchableOpacity
            style={styles.logoRow}
            activeOpacity={0.7}
            onPress={() => (navigation as any).navigate('Landing')}
          >
            <Image
              source={require('../../../assets/UGO_logo.jpeg')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.logoTitle}>UgO NITK</Text>
          </TouchableOpacity>
        ) : (
          title && <Text style={styles.title} numberOfLines={1}>{title}</Text>
        )}
      </View>

      <View style={styles.right}>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} style={styles.actionBtn} activeOpacity={0.7}>
            <Ionicons name={rightAction.icon} size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        )}
        {rightComponent}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    marginRight: spacing.sm,
    padding: 4,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  logoTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 6,
  },
});
