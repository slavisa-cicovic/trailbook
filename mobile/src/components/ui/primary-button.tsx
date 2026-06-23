import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface PrimaryButtonProps extends PropsWithChildren {
  disabled?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export default function PrimaryButton({
  children,
  disabled = false,
  onPress,
  variant = 'primary',
}: PrimaryButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.text,
          variant === 'primary' && styles.primaryText,
          variant !== 'primary' && styles.secondaryText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primary: { backgroundColor: '#243224' },
  secondary: { backgroundColor: '#dde6d6' },
  ghost: { borderWidth: 1, borderColor: '#c5d0bc' },
  text: { fontSize: 16, fontWeight: '700' },
  primaryText: { color: '#f7f4ed' },
  secondaryText: { color: '#243224' },
  disabled: { opacity: 0.45 },
});
