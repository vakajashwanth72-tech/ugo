import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../lib/theme';
import { getPasswordValidation } from '../../lib/validation';

interface PasswordRequirementsProps {
  password: string;
  showAlways?: boolean;
}

export default function PasswordRequirements({
  password,
  showAlways = false,
}: PasswordRequirementsProps) {
  // If user hasn't typed anything and showAlways is false, keep UI clean
  if (!password && !showAlways) {
    return null;
  }

  const v = getPasswordValidation(password);

  const requirements = [
    { label: 'One capital letter (A-Z)', met: v.hasUppercase },
    { label: 'One small letter (a-z)', met: v.hasLowercase },
    { label: 'One digit (0-9)', met: v.hasDigit },
    { label: 'One special character (!@#$%^&*)', met: v.hasSpecialChar },
    { label: 'Minimum 6 characters', met: v.hasMinLength },
  ];

  // Strength calculation
  let strengthColor = colors.danger;
  let strengthLabel = 'Weak';
  if (v.score >= 5) {
    strengthColor = '#10B981'; // Success Green
    strengthLabel = 'Strong';
  } else if (v.score >= 3) {
    strengthColor = '#F59E0B'; // Amber
    strengthLabel = 'Moderate';
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Password Requirements</Text>
        {password.length > 0 && (
          <View style={styles.strengthBadge}>
            <View style={[styles.strengthDot, { backgroundColor: strengthColor }]} />
            <Text style={[styles.strengthText, { color: strengthColor }]}>{strengthLabel}</Text>
          </View>
        )}
      </View>

      {/* Strength progress bar */}
      {password.length > 0 && (
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${(v.score / 5) * 100}%`, backgroundColor: strengthColor },
            ]}
          />
        </View>
      )}

      {/* Checklist items */}
      <View style={styles.list}>
        {requirements.map((req, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Ionicons
              name={req.met ? 'checkmark-circle' : 'ellipse-outline'}
              size={15}
              color={req.met ? '#10B981' : colors.textLight}
              style={styles.itemIcon}
            />
            <Text style={[styles.itemText, req.met && styles.itemTextMet]}>
              {req.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: borderRadius.md,
    padding: spacing.sm + 4,
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  strengthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  strengthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  list: {
    gap: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    marginRight: 6,
  },
  itemText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  itemTextMet: {
    color: '#065F46',
    fontWeight: '500',
  },
});
