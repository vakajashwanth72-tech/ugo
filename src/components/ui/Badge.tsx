import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { colors, borderRadius } from '../../lib/theme';
import { getStatusMeta } from '../../lib/bookingStatus';

export interface BadgeProps {
  label?: string;
  status?: string;
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export default function Badge({
  label,
  status,
  variant = 'neutral',
  size = 'md',
  style,
}: BadgeProps) {
  let displayLabel = label;
  let bg = 'rgba(100, 116, 139, 0.1)';
  let textColor = colors.textSecondary;
  let borderColor = colors.border;

  if (status) {
    const meta = getStatusMeta(status);
    displayLabel = meta.label;
    bg = meta.bgColor;
    textColor = meta.color;
    borderColor = meta.color;
  } else {
    switch (variant) {
      case 'primary':
        bg = 'rgba(37, 99, 235, 0.1)';
        textColor = colors.accentBlue;
        borderColor = 'rgba(37, 99, 235, 0.3)';
        break;
      case 'success':
        bg = 'rgba(16, 185, 129, 0.1)';
        textColor = colors.accent;
        borderColor = 'rgba(16, 185, 129, 0.3)';
        break;
      case 'warning':
        bg = 'rgba(245, 158, 11, 0.1)';
        textColor = colors.warning;
        borderColor = 'rgba(245, 158, 11, 0.3)';
        break;
      case 'danger':
        bg = 'rgba(239, 68, 68, 0.1)';
        textColor = colors.danger;
        borderColor = 'rgba(239, 68, 68, 0.3)';
        break;
      case 'neutral':
      default:
        bg = 'rgba(100, 116, 139, 0.1)';
        textColor = colors.textSecondary;
        borderColor = colors.border;
        break;
    }
  }

  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderColor,
          paddingHorizontal: isSmall ? 6 : 10,
          paddingVertical: isSmall ? 2 : 4,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: textColor,
            fontSize: isSmall ? 10 : 12,
          },
        ]}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
  },
});
