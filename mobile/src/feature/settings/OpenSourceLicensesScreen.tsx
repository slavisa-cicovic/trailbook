import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import licenses from '@/generated/openSourceLicenses.json';

export default function OpenSourceLicensesScreen() {
  const router = useRouter();
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return licenses;
    return licenses.filter((item) =>
      `${item.name} ${item.version} ${item.license}`.toLowerCase().includes(normalized),
    );
  }, [query]);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <TopAppBar onBack={() => router.back()} title={t('licenses.title')} />
      <View style={[styles.search, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <MaterialIcons color={theme.mutedText} name="search" size={20} />
        <TextInput
          autoCapitalize="none"
          onChangeText={setQuery}
          placeholder={t('licenses.search')}
          placeholderTextColor={theme.mutedText}
          style={[styles.searchInput, { color: theme.primaryText }]}
          value={query}
        />
      </View>
      <Text style={[styles.summary, { color: theme.mutedText }]}>
        {filtered.length} {t('licenses.packages')}
      </Text>
      <FlatList
        contentContainerStyle={styles.list}
        data={filtered}
        keyExtractor={(item) => `${item.name}@${item.version}`}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const key = `${item.name}@${item.version}`;
          const expanded = expandedKey === key;
          return (
            <Pressable
              onPress={() => setExpandedKey(expanded ? null : key)}
              style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <View style={styles.header}>
                <View style={styles.packageInfo}>
                  <Text selectable style={[styles.name, { color: theme.primaryText }]}>{item.name}</Text>
                  <Text style={[styles.meta, { color: theme.mutedText }]}>
                    {item.version} · {item.license}
                  </Text>
                </View>
                <MaterialIcons
                  color={theme.mutedText}
                  name={expanded ? 'expand-less' : 'expand-more'}
                  size={22}
                />
              </View>
              {expanded ? (
                <Text selectable style={[styles.licenseText, { color: theme.primaryText, borderTopColor: theme.border }]}>
                  {item.licenseText ?? t('licenses.textUnavailable')}
                </Text>
              ) : null}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  search: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, marginHorizontal: 16, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 12 },
  summary: { fontSize: 13, marginHorizontal: 18, marginTop: 10 },
  list: { padding: 16, paddingTop: 10 },
  card: { borderRadius: 16, borderWidth: 1, marginBottom: 10, padding: 15 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  packageInfo: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, marginTop: 3 },
  licenseText: { borderTopWidth: StyleSheet.hairlineWidth, fontFamily: 'monospace', fontSize: 11, lineHeight: 16, marginTop: 12, paddingTop: 12 },
});
