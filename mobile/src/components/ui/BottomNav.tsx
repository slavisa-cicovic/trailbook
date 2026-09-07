import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';

const NAV_ITEMS = [
  { href: '/recording', labelKey: 'nav.record' },
  { href: '/trips', labelKey: 'nav.trips' },
  { href: '/settings', labelKey: 'nav.settings' },
] as const;

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme, resolvedMode } = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.wrapper, { backgroundColor: theme.background, paddingBottom: insets.bottom }]}>
      <View style={styles.navRow}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Pressable
              key={item.href}
              style={[
                styles.navItem,
                { backgroundColor: active ? theme.navActiveBackground : theme.accentMuted },
              ]}
              onPress={() => router.replace(item.href)}
              testID={`bottom-nav-${item.href.slice(1)}`}
            >
              <Text
                style={[
                  styles.navText,
                  { color: active ? (resolvedMode === 'night' ? theme.background : '#f7f4ed') : theme.navText },
                ]}
              >
                {t(item.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  navRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 10,
  },
  navText: { fontSize: 14, fontWeight: '700' },
});
