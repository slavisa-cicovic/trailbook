import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';

type SettingsSectionProps = {
  children: ReactNode;
  title: string;
};

export default function SettingsSection({ children, title }: SettingsSectionProps) {
  const { theme } = useAppTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.mutedText }]}>{title}</Text>
      <View
        style={[
          styles.group,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  group: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
