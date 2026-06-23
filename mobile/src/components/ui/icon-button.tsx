import type { ReactNode } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type IconButtonSize = 'sm' | 'md' | 'lg';
type IconButtonVariant = 'danger' | 'ghost' | 'overlay' | 'solid';
type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children?: ReactNode;
  disabledIconColor?: string;
  icon?: MaterialIconName;
  iconColor?: string;
  iconSize?: number;
  size?: IconButtonSize;
  style?: StyleProp<ViewStyle>;
  variant?: IconButtonVariant;
}

const ICON_SIZE_BY_BUTTON_SIZE: Record<IconButtonSize, number> = { sm: 18, md: 18, lg: 24 };

const ICON_COLOR_BY_VARIANT: Record<IconButtonVariant, string> = {
  danger: '#9f3f31',
  ghost: '#243224',
  overlay: '#fffdf8',
  solid: '#fffdf8',
};

export default function IconButton({
  children,
  disabled = false,
  disabledIconColor = '#9da894',
  icon,
  iconColor,
  iconSize,
  size = 'md',
  style,
  variant = 'ghost',
  ...pressableProps
}: IconButtonProps) {
  const resolvedIconColor = disabled ? disabledIconColor : iconColor ?? ICON_COLOR_BY_VARIANT[variant];
  const resolvedIconSize = iconSize ?? ICON_SIZE_BY_BUTTON_SIZE[size];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      {...pressableProps}
    >
      {children ??
        (icon ? <MaterialIcons color={resolvedIconColor} name={icon} size={resolvedIconSize} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  sm: { width: 34, height: 34 },
  md: { width: 38, height: 38 },
  lg: { width: 44, height: 44 },
  danger: { backgroundColor: '#f7e0db' },
  ghost: { backgroundColor: '#e6ece1' },
  overlay: { backgroundColor: 'rgba(16, 20, 16, 0.42)' },
  solid: { backgroundColor: '#243224' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});
