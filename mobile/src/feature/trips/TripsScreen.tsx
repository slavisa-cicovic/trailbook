import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, ScrollView,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTripsStore, type TripWithMeta } from '@/feature/trips/tripsStore';
import { BottomNav } from '@/components/ui/BottomNav';
import { TripCard } from './components/TripCard';
import { FiltersPanel, FiltersToggle, DEFAULT_FILTERS, type Filters } from './components/FiltersPanel';
import { TotalCard } from './components/TotalCard';
import { useAppTheme } from '@/hooks/useAppTheme';

type Tab = 'my_trips' | 'groups' | 'shared';

const TABS: { key: Tab; label: string }[] = [
  { key: 'my_trips', label: 'My trips' },
  { key: 'groups', label: 'Groups' },
  { key: 'shared', label: 'Shared with me' },
];


function startOfDay(d: Date) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function applyFilters(trips: TripWithMeta[], f: Filters): TripWithMeta[] {
  let result = [...trips];

  if (f.search.trim()) {
    const q = f.search.toLowerCase();
    result = result.filter((t) => t.trip.title.toLowerCase().includes(q));
  }

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today); lastWeek.setDate(today.getDate() - 7);

  if (f.period === 'today') {
    result = result.filter((t) => t.trip.startedAt >= today);
  } else if (f.period === 'yesterday') {
    result = result.filter((t) => t.trip.startedAt >= yesterday && t.trip.startedAt < today);
  } else if (f.period === 'last_week') {
    result = result.filter((t) => t.trip.startedAt >= lastWeek);
  }

  if (f.activities.length > 0) {
    result = result.filter((t) =>
      t.segments.some((s) => f.activities.includes(s.segmentType)),
    );
  }

  if (f.sort === 'oldest') {
    result = result.sort((a, b) => a.trip.startedAt.getTime() - b.trip.startedAt.getTime());
  } else if (f.sort === 'distance') {
    result = result.sort((a, b) => b.totalDistanceM - a.totalDistanceM);
  } else if (f.sort === 'duration') {
    result = result.sort((a, b) => {
      const da = a.trip.endedAt ? a.trip.endedAt.getTime() - a.trip.startedAt.getTime() : 0;
      const db = b.trip.endedAt ? b.trip.endedAt.getTime() - b.trip.startedAt.getTime() : 0;
      return db - da;
    });
  } else {
    result = result.sort((a, b) => b.trip.startedAt.getTime() - a.trip.startedAt.getTime());
  }

  return result;
}

export default function TripsScreen() {
  const trips = useTripsStore((s) => s.trips);
  const loading = useTripsStore((s) => s.loading);
  const load = useTripsStore((s) => s.load);
  const deleteTrip = useTripsStore((s) => s.deleteTrip);
  const router = useRouter();
  const { theme } = useAppTheme();

  const [tab, setTab] = useState<Tab>('my_trips');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => { load(); }, []);

  const filteredTrips = useMemo(() => applyFilters(trips, filters), [trips, filters]);

  function ListHeader() {
    return (
      <View style={{ backgroundColor: theme.background }}>
        <Text style={[styles.title, { color: theme.primaryText }]}>Trips</Text>
        <Text style={[styles.subtitle, { color: theme.mutedText }]}>
          Your local recorded routes and saved trip content.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              style={[
                styles.tab,
                { backgroundColor: t.key === tab ? theme.accent : theme.accentMuted },
              ]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[
                styles.tabText,
                { color: t.key === tab ? theme.background : theme.mutedText },
              ]}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.filterRow}>
          <FiltersToggle open={showFilters} onToggle={() => setShowFilters((v) => !v)} filters={filters} />
        </View>
        {showFilters && (
          <FiltersPanel
            open={showFilters}
            filters={filters}
            onChange={setFilters}
            onToggle={() => setShowFilters((v) => !v)}
          />
        )}

        {tab === 'my_trips' && <TotalCard trips={filteredTrips} />}

        {tab !== 'my_trips' && (
          <View style={[styles.placeholder, { backgroundColor: theme.card }]}>
            <Text style={[styles.placeholderText, { color: theme.mutedText }]}>Coming soon</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
        {loading && trips.length === 0 ? (
          <View style={styles.loadingContainer}>
            <Text style={[styles.title, { color: theme.primaryText }]}>Trips</Text>
            <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
          </View>
        ) : tab !== 'my_trips' ? (
          <FlatList
            data={[]}
            keyExtractor={() => ''}
            renderItem={null}
            ListHeaderComponent={ListHeader}
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={filteredTrips}
            keyExtractor={(item) => item.trip.clientTripId}
            renderItem={({ item }) => (
              <TripCard
                item={item}
                onPress={() => router.push(`/trips/${item.trip.clientTripId}`)}
                onDelete={() => void deleteTrip(item.trip.clientTripId)}
              />
            )}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>No trips yet</Text>
                <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                  Start recording to create your first trip
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        )}

        <BottomNav />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },

  title: { fontSize: 32, fontWeight: '800', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingBottom: 16 },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  tab: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  tabText: { fontSize: 15, fontWeight: '700' },

  filterRow: { marginBottom: 2 },

  placeholder: { borderRadius: 20, padding: 40, margin: 20, alignItems: 'center' },
  placeholderText: { fontSize: 15, fontWeight: '600' },

  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
