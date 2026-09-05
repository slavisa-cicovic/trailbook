import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SegmentType } from '@/core/domain/model/segment';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useI18n } from '@/i18n/i18nStore';
import type { TranslationKey } from '@/i18n/translations';
import {
  DEFAULT_FILTERS,
  isDefaultTripFilters,
  type Filters,
  type Period,
  type SortKey,
} from '../tripFilters';

const PERIODS: { key: Period; label: TranslationKey }[] = [
  { key: 'all', label: 'trips.period.all' }, { key: 'today', label: 'trips.period.today' },
  { key: 'yesterday', label: 'trips.period.yesterday' }, { key: 'last_week', label: 'trips.period.lastWeek' },
];

const ACTIVITIES: { key: SegmentType; label: TranslationKey }[] = [
  { key: 'WALK', label: 'activity.walk' }, { key: 'BIKE', label: 'activity.bike' },
  { key: 'DRIVE', label: 'activity.drive' }, { key: 'BOAT', label: 'activity.boat' },
  { key: 'PLANE', label: 'activity.plane' },
];

const SORTS: { key: SortKey; label: TranslationKey }[] = [
  { key: 'newest', label: 'trips.sort.newest' }, { key: 'oldest', label: 'trips.sort.oldest' },
  { key: 'distance', label: 'trips.sort.distance' }, { key: 'duration', label: 'trips.sort.duration' },
];

interface Props {
  open: boolean;
  filters: Filters;
  onChange(f: Filters): void;
  onToggle(): void;
}

export function FiltersToggle({
  filters,
  onReset,
  onToggle,
  open,
}: {
  filters: Filters;
  onReset(): void;
  onToggle(): void;
  open: boolean;
}) {
  const { theme } = useAppTheme();
  const { t } = useI18n();
  const active = !isDefaultTripFilters(filters);
  const color = active ? theme.danger : theme.primaryText;
  return (
    <Pressable style={[styles.toggleBtn, { backgroundColor: theme.card }]} onPress={onToggle}>
      <MaterialIcons name="tune" size={18} color={color} />
      <Text style={[styles.toggleText, { color }]}>{t('trips.filters')}</Text>
      {active ? (
        <Pressable
          accessibilityLabel={t('trips.resetFilters')}
          hitSlop={10}
          onPress={(event) => {
            event.stopPropagation();
            onReset();
          }}
          style={[styles.resetInlineBtn, { backgroundColor: theme.dangerMuted }]}
        >
          <MaterialIcons name="close" size={14} color={theme.danger} />
        </Pressable>
      ) : null}
      <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={18} color={color} />
    </Pressable>
  );
}

export function FiltersPanel({ filters, onChange }: Props) {
  const { theme } = useAppTheme();
  const { t } = useI18n();

  function toggleActivity(key: SegmentType) {
    const next = filters.activities.includes(key)
      ? filters.activities.filter((a) => a !== key)
      : [...filters.activities, key];
    onChange({ ...filters, activities: next });
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface }]}>
      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('trips.search').toUpperCase()}</Text>
      <View style={[styles.searchRow, { backgroundColor: theme.card }]}>
        <MaterialIcons name="search" size={18} color={theme.mutedText} />
        <TextInput
          style={[styles.searchInput, { color: theme.primaryText }]}
          value={filters.search}
          onChangeText={(v) => onChange({ ...filters, search: v })}
          placeholder={t('trips.searchPlaceholder')}
          placeholderTextColor={theme.mutedText}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('trips.period').toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {PERIODS.map((p) => {
            const active = filters.period === p.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.chip, { backgroundColor: active ? theme.accent : theme.card }]}
                onPress={() => onChange({ ...filters, period: p.key })}
              >
                <Text style={[styles.chipText, { color: active ? theme.background : theme.primaryText }]}>
                  {t(p.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('trips.activity').toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {ACTIVITIES.map((a) => {
            const active = filters.activities.includes(a.key);
            return (
              <Pressable
                key={a.key}
                style={[styles.chip, { backgroundColor: active ? theme.accent : theme.card }]}
                onPress={() => toggleActivity(a.key)}
              >
                <Text style={[styles.chipText, { color: active ? theme.background : theme.primaryText }]}>
                  {t(a.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>{t('trips.sort').toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {SORTS.map((s) => {
            const active = filters.sort === s.key;
            return (
              <Pressable
                key={s.key}
                style={[styles.chip, { backgroundColor: active ? theme.accent : theme.card }]}
                onPress={() => onChange({ ...filters, sort: s.key })}
              >
                <Text style={[styles.chipText, { color: active ? theme.background : theme.primaryText }]}>
                  {t(s.label)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    marginBottom: 12,
  },
  toggleText: { fontSize: 14, fontWeight: '700' },
  resetInlineBtn: {
    alignItems: 'center',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },

  panel: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },

  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
});
