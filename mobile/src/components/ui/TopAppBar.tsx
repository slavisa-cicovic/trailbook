import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

interface TopAppBarProps {
  backTestID?: string;
  onBack?: () => void;
  rightActions?: ReactNode;
  title: string;
}

export function TopAppBar({ backTestID, onBack, rightActions, title }: TopAppBarProps) {
  const { theme } = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.leading}>
        {onBack && (
          <Pressable
            accessibilityLabel={t('nav.back')}
            hitSlop={10}
            onPress={onBack}
            testID={backTestID}
            style={[styles.backButton, { backgroundColor: theme.accentMuted }]}
          >
            <MaterialIcons color={theme.accent} name="arrow-back" size={20} />
          </Pressable>
        )}
        <Text numberOfLines={1} style={[styles.title, { color: theme.primaryText }]}>
          {title}
        </Text>
      </View>
      {rightActions ? <View style={styles.actions}>{rightActions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 20,
    elevation: 0.6,
    marginBottom: 2,
  },
  leading: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
