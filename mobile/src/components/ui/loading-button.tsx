import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface LoadingButtonProps extends PropsWithChildren {
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export default function LoadingButton({
  children,
  disabled = false,
  loading = false,
  loadingLabel,
  onPress,
  style,
  variant = 'primary',
}: LoadingButtonProps) {
  const buttonDisabled = disabled || loading;
  const indicatorColor = variant === 'primary' ? '#f7f4ed' : '#243224';

  return (
    <Pressable
      disabled={buttonDisabled}
      onPress={onPress}
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        buttonDisabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={indicatorColor} size="small" /> : null}
        <Text
          style={[
            styles.text,
            variant === 'primary' && styles.primaryText,
            variant !== 'primary' && styles.secondaryText,
          ]}
        >
          {loading && loadingLabel ? loadingLabel : children}
        </Text>
      </View>
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
  content: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: { fontSize: 16, fontWeight: '700' },
  primaryText: { color: '#f7f4ed' },
  secondaryText: { color: '#243224' },
  disabled: { opacity: 0.45 },
});
