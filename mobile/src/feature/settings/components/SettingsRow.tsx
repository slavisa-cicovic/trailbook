import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';

type SettingsIconName = keyof typeof MaterialIcons.glyphMap;

type SettingsRowProps = {
  description?: string;
  disabled?: boolean;
  iconName: SettingsIconName;
  loading?: boolean;
  onPress?: () => void;
  title: string;
  tone?: 'default' | 'danger';
  value?: string;
};

export default function SettingsRow({
  description,
  disabled,
  iconName,
  loading,
  onPress,
  title,
  tone = 'default',
  value,
}: SettingsRowProps) {
  const { theme } = useAppTheme();
  const interactive = Boolean(onPress) && !disabled;
  const iconColor = tone === 'danger' ? theme.danger : theme.accent;
  const iconBackground = tone === 'danger' ? theme.dangerMuted : theme.accentMuted;

  return (
    <Pressable
      disabled={!interactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: iconBackground }]}>
        <MaterialIcons color={iconColor} name={iconName} size={20} />
      </View>
      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            { color: tone === 'danger' ? theme.danger : theme.primaryText },
          ]}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.description, { color: theme.mutedText }]}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        {loading ? (
          <ActivityIndicator color={theme.accent} size="small" />
        ) : value ? (
          <Text style={[styles.value, { color: theme.mutedText }]}>{value}</Text>
        ) : null}
        {interactive && !loading ? (
          <MaterialIcons color={theme.mutedText} name="chevron-right" size={22} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowDisabled: {
    opacity: 0.62,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  value: {
    flexShrink: 1,
    maxWidth: 110,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
});
