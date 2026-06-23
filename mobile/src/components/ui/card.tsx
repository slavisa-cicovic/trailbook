import type { PropsWithChildren } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  subtitle?: string;
  subtitleStyle?: StyleProp<TextStyle>;
  title?: string;
  titleStyle?: StyleProp<TextStyle>;
}

export default function Card({ children, style, subtitle, subtitleStyle, title, titleStyle }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={[styles.title, titleStyle]}>{title}</Text> : null}
      {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: '#fffdf8',
    padding: 20,
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2a1f' },
  subtitle: { fontSize: 14, color: '#52624f', marginBottom: 4 },
});
