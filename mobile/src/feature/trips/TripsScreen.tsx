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
import { FiltersPanel, FiltersToggle } from './components/FiltersPanel';
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
import { DEFAULT_FILTERS } from './tripFilters';
import { useTripFiltersStore } from './tripFiltersStore';
import {
  accessErrorMessage,
  isPremiumAccessError,
} from '@/core/domain/access/mobileAccessPolicy';
import { useRecordingStore } from '@/feature/recording/recordingStore';
import { useI18n } from '@/i18n/i18nStore';
import type { TranslationKey } from '@/i18n/translations';

type Tab = 'my_trips' | 'groups' | 'shared';

const TABS: { key: Tab; label: TranslationKey }[] = [
  { key: 'my_trips', label: 'trips.myTrips' },
  { key: 'groups', label: 'trips.groups' },
  { key: 'shared', label: 'trips.sharedWithMe' },
];


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
  const filters = useTripFiltersStore((s) => s.filters);
  const loadFilters = useTripFiltersStore((s) => s.loadFilters);
  const setFilters = useTripFiltersStore((s) => s.setFilters);
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const isRecording = useRecordingStore((s) => s.isRecording);
  const { localizeError, t } = useI18n();

  const [tab, setTab] = useState<Tab>('my_trips');
  const [showFilters, setShowFilters] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [addToGroupVisible, setAddToGroupVisible] = useState(false);
  const [groupSort, setGroupSort] = useState<GroupTripSort>('newest');

  useEffect(() => {
    loadGroups();
    loadSharedTrips();
    loadFilters();
    authRepository.isDemo().then(setIsDemo);
  }, [loadFilters, loadGroups, loadSharedTrips]);

  useEffect(() => {
    load(filters);
  }, [filters, load]);

  useEffect(() => {
    if (isDemo && tab === 'groups') setTab('my_trips');
  }, [isDemo, tab]);

  const filteredTrips = trips;
  const visibleTabs = useMemo(
    () => TABS.filter((item) => item.key !== 'groups' || !isDemo),
    [isDemo],
  );
  const tripsById = useMemo(
    () => new Map(trips.map((item) => [item.trip.clientTripId, item])),
    [trips],
  );
  const selectionMode = selectedTripIds.length > 0;

  function showActionError(title: string, error: string) {
    showAlert({
      title,
      message: localizeError(accessErrorMessage(error)),
      buttons: isPremiumAccessError(error)
        ? [
            { text: t('settings.notNow'), style: 'cancel' },
            { text: t('settings.viewPremium'), onPress: () => router.push('/premium') },
          ]
        : undefined,
    });
  }

  async function handleSyncTrip(clientTripId: string) {
    if (!allowTripMutation()) return;
    const error = await syncTrip(clientTripId);
    if (error) {
      showActionError(t('trips.syncFailed'), error);
    }
  }

  function toggleTripSelection(item: TripWithMeta) {
    if (item.trip.syncState !== 'SYNCED') {
      showAlert({ title: t('trips.syncRequired'), message: t('trips.syncBeforeGroup') });
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
      showActionError(t('trips.createGroupFailed'), error);
      return;
    }
    setAddToGroupVisible(false);
    setSelectedTripIds([]);
  }

  async function handleAddToExisting(groupId: string) {
    const error = await addTripsToGroup(groupId, selectedTripIds);
    if (error) {
      showActionError(t('trips.updateGroupFailed'), error);
      return;
    }
    setAddToGroupVisible(false);
    setSelectedTripIds([]);
  }

  async function handleSyncGroup(groupId: string) {
    if (!allowTripMutation()) return;
    const error = await syncGroup(groupId);
    if (error) showActionError(t('trips.groupSyncFailed'), error);
  }

  function allowTripMutation(): boolean {
    if (!isRecording) return true;
    showAlert({ title: t('trips.recordingInProgress'), message: t('trips.recordingMutationBlocked') });
    return false;
  }

  async function handleDeleteTrip(clientTripId: string) {
    if (!allowTripMutation()) return;
    const error = await deleteTrip(clientTripId);
    if (error) showActionError(t('trips.deleteFailed'), error);
  }

  function openGroup(groupId: string) {
    const group = groups.find((item) => item.group.id === groupId);
    const firstTrip = sortGroupTrips(group, tripsById, groupSort)[0];
    if (!firstTrip) {
      showAlert({ title: t('trips.emptyGroup'), message: t('trips.emptyGroupMessage') });
      return;
    }
    router.push(groupTripHref(firstTrip.trip.clientTripId, groupId, groupSort));
  }

  function confirmDeleteGroup(groupId: string) {
    showAlert({
      title: t('trips.deleteGroupQuestion'),
      message: t('trips.tripsWillRemain'),
      buttons: [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const error = await deleteGroup(groupId);
            if (error) showAlert({ title: t('trips.deleteFailed'), message: error });
          },
        },
      ],
    });
  }

  function ListHeader() {
    return (
      <View style={{ backgroundColor: theme.background }}>
        <Text style={[styles.subtitle, { color: theme.mutedText }]}>
          {t('trips.subtitle')}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {visibleTabs.map((item) => (
            <Pressable
              key={item.key}
              style={[
                styles.tab,
                { backgroundColor: item.key === tab ? theme.accent : theme.accentMuted },
              ]}
              onPress={() => setTab(item.key)}
            >
              <Text style={[
                styles.tabText,
                { color: item.key === tab ? theme.background : theme.mutedText },
              ]}>
                {t(item.label)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'my_trips' && (
          <>
            {selectionMode && (
              <View style={[styles.selectionBar, { backgroundColor: theme.card }]}>
                <Text style={[styles.selectionText, { color: theme.primaryText }]}>
                  {selectedTripIds.length} {t(selectedTripIds.length === 1 ? 'trips.selectedOne' : 'trips.selectedMany')}
                </Text>
                <Pressable
                  style={[styles.selectionAction, { backgroundColor: theme.accentMuted }]}
                  onPress={() => setSelectedTripIds([])}
                >
                  <Text style={[styles.selectionActionText, { color: theme.mutedText }]}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.selectionAction, { backgroundColor: theme.accent }]}
                  onPress={() => setAddToGroupVisible(true)}
                >
                  <Text style={[styles.selectionActionText, { color: theme.background }]}>{t('trips.addToGroup')}</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.filterRow}>
              <FiltersToggle
                open={showFilters}
                onToggle={() => setShowFilters((value) => !value)}
                onReset={() => setFilters(DEFAULT_FILTERS)}
                filters={filters}
              />
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
                  {localizeError(accessErrorMessage(sharedTripsError))}
                </Text>
                {isPremiumAccessError(sharedTripsError) ? (
                  <Pressable
                    onPress={() => router.push('/premium')}
                    style={[styles.placeholderAction, { backgroundColor: theme.accent }]}
                  >
                    <Text style={[styles.placeholderActionText, { color: theme.background }]}>{t('settings.viewPremium')}</Text>
                  </Pressable>
                ) : null}
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
                  {t(`trips.sort.${option.key}` as TranslationKey)}
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
        <TopAppBar title={t('trips.title')} />
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
                    <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>{t('trips.noGroups')}</Text>
                    <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                      {t('trips.noGroupsHint')}
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
                      {t('trips.noSharedTrips')}
                    </Text>
                    <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                      {t('trips.noSharedTripsHint')}
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
                onDelete={() => void handleDeleteTrip(item.trip.clientTripId)}
                onSync={() => void handleSyncTrip(item.trip.clientTripId)}
                syncing={syncingTripIds.includes(item.trip.clientTripId)}
                selected={selectedTripIds.includes(item.trip.clientTripId)}
                selectionMode={selectionMode}
              />
            )}
            ListHeaderComponent={ListHeader}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[styles.emptyTitle, { color: theme.primaryText }]}>{t('trips.noTrips')}</Text>
                <Text style={[styles.emptySub, { color: theme.mutedText }]}>
                  {t('trips.noTripsHint')}
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
  placeholderAction: { borderRadius: 14, marginTop: 16, paddingHorizontal: 18, paddingVertical: 12 },
  placeholderActionText: { fontSize: 14, fontWeight: '800' },

  groupSortRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  groupSortChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  groupSortText: { fontSize: 13, fontWeight: '800' },

  listContent: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
