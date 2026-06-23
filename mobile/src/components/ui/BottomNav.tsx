import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/useAppTheme';

const NAV_ITEMS = [
  { href: '/recording', label: 'Record' },
  { href: '/trips', label: 'Trips' },
  { href: '/settings', label: 'Settings' },
] as const;

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme, resolvedMode } = useAppTheme();

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
            >
              <Text
                style={[
                  styles.navText,
                  { color: active ? (resolvedMode === 'night' ? theme.background : '#f7f4ed') : theme.navText },
                ]}
              >
                {item.label}
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 14,
  },
  navText: { fontSize: 14, fontWeight: '700' },
});
