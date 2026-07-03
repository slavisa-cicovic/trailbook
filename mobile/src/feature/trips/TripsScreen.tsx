import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, ScrollView,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTripsStore, type TripWithMeta } from '@/feature/trips/tripsStore';
import { BottomNav } from '@/components/ui/BottomNav';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { TripCard } from './components/TripCard';
import { FiltersPanel, FiltersToggle, DEFAULT_FILTERS, type Filters } from './components/FiltersPanel';
import { TotalCard } from './components/TotalCard';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { useTripGroupsStore } from './tripGroupsStore';
import { AddToGroupModal } from './components/AddToGroupModal';
import { GroupCard } from './components/GroupCard';
import { SharedTripCard } from './components/SharedTripCard';
import { useSharedTripsStore } from './sharedTripsStore';
import {
  GROUP_TRIP_SORTS,
  groupTripHref,
  sortGroupTrips,
  type GroupTripSort,
} from './groupNavigation';

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
  const syncingTripIds = useTripsStore((s) => s.syncingTripIds);
  const load = useTripsStore((s) => s.load);
  const deleteTrip = useTripsStore((s) => s.deleteTrip);
  const syncTrip = useTripsStore((s) => s.syncTrip);
  const groups = useTripGroupsStore((s) => s.groups);
  const groupsLoading = useTripGroupsStore((s) => s.loading);
  const syncingGroupIds = useTripGroupsStore((s) => s.syncingGroupIds);
  const loadGroups = useTripGroupsStore((s) => s.load);
  const createGroup = useTripGroupsStore((s) => s.createGroup);
  const addTripsToGroup = useTripGroupsStore((s) => s.addTripsToGroup);
  const deleteGroup = useTripGroupsStore((s) => s.deleteGroup);
  const syncGroup = useTripGroupsStore((s) => s.syncGroup);
  const sharedTrips = useSharedTripsStore((s) => s.sharedTrips);
  const sharedTripsLoading = useSharedTripsStore((s) => s.loading);
  const sharedTripsError = useSharedTripsStore((s) => s.error);
  const loadSharedTrips = useSharedTripsStore((s) => s.loadSharedTrips);
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();

  const [tab, setTab] = useState<Tab>('my_trips');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [isDemo, setIsDemo] = useState(true);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [addToGroupVisible, setAddToGroupVisible] = useState(false);
  const [groupSort, setGroupSort] = useState<GroupTripSort>('newest');

  useEffect(() => {
    load();
    loadGroups();
    loadSharedTrips();
    authRepository.isDemo().then(setIsDemo);
  }, [load, loadGroups, loadSharedTrips]);

  useEffect(() => {
    if (isDemo && tab === 'groups') setTab('my_trips');
  }, [isDemo, tab]);

  const filteredTrips = useMemo(() => applyFilters(trips, filters), [trips, filters]);
  const visibleTabs = useMemo(
    () => TABS.filter((item) => item.key !== 'groups' || !isDemo),
    [isDemo],
  );
  const tripsById = useMemo(
    () => new Map(trips.map((item) => [item.trip.clientTripId, item])),
    [trips],
  );
  const selectionMode = selectedTripIds.length > 0;

  async function handleSyncTrip(clientTripId: string) {
    const error = await syncTrip(clientTripId);
    if (error) {
      showAlert({ title: 'Sync failed', message: error });
    }
  }

  function toggleTripSelection(item: TripWithMeta) {
    if (item.trip.syncState !== 'SYNCED') {
      showAlert({ title: 'Sync required', message: 'Sync trip before adding it to a group.' });
      return;
    }
    setSelectedTripIds((current) =>
      current.includes(item.trip.clientTripId)
        ? current.filter((id) => id !== item.trip.clientTripId)
        : [...current, item.trip.clientTripId],
    );
  }

  function handleTripPress(item: TripWithMeta) {
    if (selectionMode) {
      toggleTripSelection(item);
      return;
    }
    router.push(`/trips/${item.trip.clientTripId}`);
  }

  async function handleCreateGroup(title: string, description: string | null) {
    const error = await createGroup(title, description, selectedTripIds);
    if (error) {
      showAlert({ title: 'Could not create group', message: error });
      return;
    }
    setAddToGroupVisible(false);
    setSelectedTripIds([]);
  }

  async function handleAddToExisting(groupId: string) {
    const error = await addTripsToGroup(groupId, selectedTripIds);
    if (error) {
      showAlert({ title: 'Could not update group', message: error });
      return;
    }
    setAddToGroupVisible(false);
    setSelectedTripIds([]);
  }

  async function handleSyncGroup(groupId: string) {
    const error = await syncGroup(groupId);
    if (error) showAlert({ title: 'Group sync failed', message: error });
  }

  function openGroup(groupId: string) {
    const group = groups.find((item) => item.group.id === groupId);
    const firstTrip = sortGroupTrips(group, tripsById, groupSort)[0];
    if (!firstTrip) {
      showAlert({ title: 'Empty group', message: 'This group has no locally available trips.' });
      return;
    }
    router.push(groupTripHref(firstTrip.trip.clientTripId, groupId, groupSort));
  }

  function confirmDeleteGroup(groupId: string) {
    showAlert({
      title: 'Delete group?',
      message: 'Trips will not be deleted.',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const error = await deleteGroup(groupId);
            if (error) showAlert({ title: 'Delete failed', message: error });
          },
        },
      ],
    });
  }

  function ListHeader() {
    return (
      <View style={{ backgroundColor: theme.background }}>
        <Text style={[styles.subtitle, { color: theme.mutedText }]}>
          Your local recorded routes and saved trip content.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {visibleTabs.map((t) => (
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

        {tab === 'my_trips' && (
          <>
            {selectionMode && (
              <View style={[styles.selectionBar, { backgroundColor: theme.card }]}>
                <Text style={[styles.selectionText, { color: theme.primaryText }]}>
                  {selectedTripIds.length} selected
                </Text>
                <Pressable
                  style={[styles.selectionAction, { backgroundColor: theme.accentMuted }]}
                  onPress={() => setSelectedTripIds([])}
                >
                  <Text style={[styles.selectionActionText, { color: theme.mutedText }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.selectionAction, { backgroundColor: theme.accent }]}
                  onPress={() => setAddToGroupVisible(true)}
                >
                  <Text style={[styles.selectionActionText, { color: theme.background }]}>Add to group</Text>
                </Pressable>
              </View>
            )}

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
            <TotalCard trips={filteredTrips} />
          </>
        )}

        {tab === 'shared' && (
          <>
            {sharedTripsError ? (
              <View style={[styles.placeholder, { backgroundColor: theme.card }]}>
                <Text style={[styles.placeholderText, { color: theme.mutedText }]}>
                  {sharedTripsError}
                </Text>
              </View>
            ) : null}
          </>
        )}

        {tab === 'groups' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.groupSortRow}
          >
            {GROUP_TRIP_SORTS.map((option) => (
              <Pressable
                key={option.key}
                style={[
                  styles.groupSortChip,
                  { backgroundColor: option.key === groupSort ? theme.accent : theme.accentMuted },
                ]}
                onPress={() => setGroupSort(option.key)}
              >
                <Text
                  style={[
                    styles.groupSortText,
                    { color: option.key === groupSort ? theme.background : theme.mutedText },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
        <TopAppBar title="Trips" />
        {loading && trips.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
          </View>
        ) : tab === 'groups' ? (
          <FlatList
            data={groups}
            keyExtractor={(item) => item.group.id}
            renderItem={({ item }) => (
              <GroupCard
                item={item}
                tripsById={tripsById}
                syncing={syncingGroupIds.includes(item.group.id)}
                onDelete={() => confirmDeleteGroup(item.group.id)}
                onOpen={() => openGroup(item.group.id)}
                onSync={() => void handleSyncGroup(item.group.id)}
              />
            )}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <View style={styles.empty}>
                {groupsLoading ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>No groups yet</Text>
                    <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                      Long press synced trips to create a group.
                    </Text>
                  </>
                )}
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        ) : tab === 'shared' ? (
          <FlatList
            data={sharedTrips}
            keyExtractor={(item) => item.clientTripId}
            renderItem={({ item }) => (
              <SharedTripCard
                item={item}
                onPress={() => router.push(`/trips/shared/${item.clientTripId}`)}
              />
            )}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <View style={styles.empty}>
                {sharedTripsLoading ? (
                  <ActivityIndicator color={theme.accent} />
                ) : (
                  <>
                    <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>
                      No shared trips
                    </Text>
                    <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                      Trips shared by other Trailbook users will appear here.
                    </Text>
                  </>
                )}
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={filteredTrips}
            keyExtractor={(item) => item.trip.clientTripId}
            renderItem={({ item }) => (
              <TripCard
                item={item}
                onPress={() => handleTripPress(item)}
                onLongPress={() => toggleTripSelection(item)}
                onDelete={() => void deleteTrip(item.trip.clientTripId)}
                onSync={() => void handleSyncTrip(item.trip.clientTripId)}
                syncing={syncingTripIds.includes(item.trip.clientTripId)}
                selected={selectedTripIds.includes(item.trip.clientTripId)}
                selectionMode={selectionMode}
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

        <AddToGroupModal
          visible={addToGroupVisible}
          selectedCount={selectedTripIds.length}
          groups={groups}
          onClose={() => setAddToGroupVisible(false)}
          onCreate={(title, description) => void handleCreateGroup(title, description)}
          onAddToExisting={(groupId) => void handleAddToExisting(groupId)}
        />
        <BottomNav />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingContainer: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },

  subtitle: { fontSize: 14, lineHeight: 20, paddingHorizontal: 20, paddingBottom: 16 },

  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  tab: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 22 },
  tabText: { fontSize: 15, fontWeight: '700' },

  filterRow: { marginBottom: 2 },

  selectionBar: {
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionText: { flex: 1, fontSize: 15, fontWeight: '800' },
  selectionAction: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  selectionActionText: { fontSize: 13, fontWeight: '800' },

  placeholder: { borderRadius: 20, padding: 40, margin: 20, alignItems: 'center' },
  placeholderText: { fontSize: 15, fontWeight: '600' },

  groupSortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  groupSortChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  groupSortText: { fontSize: 13, fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
