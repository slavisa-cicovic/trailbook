import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { SegmentType } from '@/core/domain/model/segment';
import { useAppTheme } from '@/hooks/useAppTheme';

export type Period = 'all' | 'today' | 'yesterday' | 'last_week';
export type SortKey = 'newest' | 'oldest' | 'distance' | 'duration';

export interface Filters {
  search: string;
  period: Period;
  activities: SegmentType[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  search: '', period: 'all', activities: [], sort: 'newest',
};

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_week', label: 'Last week' },
];

const ACTIVITIES: { key: SegmentType; label: string }[] = [
  { key: 'WALK', label: 'Walk' },
  { key: 'BIKE', label: 'Bike' },
  { key: 'DRIVE', label: 'Drive' },
  { key: 'BOAT', label: 'Boat' },
  { key: 'PLANE', label: 'Plane' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'distance', label: 'Distance' },
  { key: 'duration', label: 'Duration' },
];

interface Props {
  open: boolean;
  filters: Filters;
  onChange(f: Filters): void;
  onToggle(): void;
}

export function FiltersToggle({ open, onToggle, filters }: { open: boolean; onToggle(): void; filters: Filters }) {
  const { theme } = useAppTheme();
  const active = !isDefault(filters);
  return (
    <Pressable style={[styles.toggleBtn, { backgroundColor: theme.card }]} onPress={onToggle}>
      <MaterialIcons name="tune" size={18} color={active ? theme.accent : theme.primaryText} />
      <Text style={[styles.toggleText, { color: active ? theme.accent : theme.primaryText }]}>Filters</Text>
      {active && <View style={[styles.activeDot, { backgroundColor: theme.accent }]} />}
      <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={18} color={active ? theme.accent : theme.primaryText} />
    </Pressable>
  );
}

function isDefault(f: Filters) {
  return (
    f.search === '' &&
    f.period === 'all' &&
    f.activities.length === 0 &&
    f.sort === 'newest'
  );
}

export function FiltersPanel({ filters, onChange }: Props) {
  const { theme } = useAppTheme();

  function toggleActivity(key: SegmentType) {
    const next = filters.activities.includes(key)
      ? filters.activities.filter((a) => a !== key)
      : [...filters.activities, key];
    onChange({ ...filters, activities: next });
  }

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface }]}>
      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>SEARCH</Text>
      <View style={[styles.searchRow, { backgroundColor: theme.card }]}>
        <MaterialIcons name="search" size={18} color={theme.mutedText} />
        <TextInput
          style={[styles.searchInput, { color: theme.primaryText }]}
          value={filters.search}
          onChangeText={(v) => onChange({ ...filters, search: v })}
          placeholder="Search trips..."
          placeholderTextColor={theme.mutedText}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>PERIOD</Text>
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
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>ACTIVITY</Text>
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
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.sectionLabel, { color: theme.mutedText }]}>SORT</Text>
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
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {!isDefault(filters) && (
        <Pressable
          style={[styles.resetBtn, { backgroundColor: theme.dangerMuted }]}
          onPress={() => onChange(DEFAULT_FILTERS)}
        >
          <MaterialIcons name="close" size={15} color={theme.danger} />
          <Text style={[styles.resetText, { color: theme.danger }]}>Reset filters</Text>
        </Pressable>
      )}
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
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  resetText: { fontSize: 14, fontWeight: '600' },
  activeDot: { width: 7, height: 7, borderRadius: 4 },
});
