import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, typography, spacing } from '../../lib/theme';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  isPassword?: boolean;
}

export default function Input({
  label,
  error,
  isPassword = false,
  style,
  ...rest
}: InputProps) {
  const [showPass, setShowPass] = useState(!isPassword);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrapper, !!error && styles.inputError]}>
        <TextInput
          style={[styles.input, style]}
          secureTextEntry={isPassword && !showPass}
          placeholderTextColor={colors.textLight}
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPass(!showPass)}
            style={styles.toggleBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name={showPass ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: typography.body2.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: typography.body1.fontSize,
    color: colors.textPrimary,
  },
  toggleBtn: {
    padding: 4,
  },
  errorText: {
    color: colors.danger,
    fontSize: typography.caption.fontSize,
    marginTop: 4,
  },
});
