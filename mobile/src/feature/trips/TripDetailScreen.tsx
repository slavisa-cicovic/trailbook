import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import MapView, { Callout, Polyline, Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTripDetailStore } from '@/feature/trips/tripDetailStore';
import { useTripsStore } from '@/feature/trips/tripsStore';
import { SEGMENT_COLOR, SEGMENT_LABEL } from '@/constants/segmentColors';
import { reprocessTrip } from '@/core/domain/usecase/ReprocessTripUseCase';
import { BottomNav } from '@/components/ui/BottomNav';
import { TrailMap } from '@/components/ui/TrailMap';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { Segment } from '@/core/domain/model/segment';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import { CATEGORY_ICON } from '@/constants/waypointCategories';

const BOTTOM_NAV_HEIGHT = 64;


function pointsForSegment(locations: RawLocationSample[], seg: Segment) {
  return locations
    .filter((l) => l.timestamp >= seg.startedAt && l.timestamp <= seg.endedAt)
    .map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
}

function formatDuration(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.floor(ms / 1000)}s`;
}

function formatDistance(m: number | null | undefined) {
  if (!m) return '—';
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function formatTimeRange(from: Date, to: Date) {
  return `${format(from, 'HH:mm')} - ${format(to, 'HH:mm')}`;
}

export default function TripDetailScreen() {
  const { clientTripId } = useLocalSearchParams<{ clientTripId: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const load = useTripDetailStore((s) => s.load);
  const reset = useTripDetailStore((s) => s.reset);
  const trip = useTripDetailStore((s) => s.trip);
  const segments = useTripDetailStore((s) => s.segments);
  const waypoints = useTripDetailStore((s) => s.waypoints);
  const imagesByWaypoint = useTripDetailStore((s) => s.imagesByWaypoint);
  const locationSamples = useTripDetailStore((s) => s.locationSamples);
  const deviceSamples = useTripDetailStore((s) => s.deviceSamples);
  const loading = useTripDetailStore((s) => s.loading);

  const allTrips = useTripsStore((s) => s.trips);
  const syncingTripIds = useTripsStore((s) => s.syncingTripIds);
  const syncTrip = useTripsStore((s) => s.syncTrip);
  const currentIndex = allTrips.findIndex((t) => t.trip.clientTripId === clientTripId);
  const prevTrip = currentIndex > 0 ? allTrips[currentIndex - 1] : null;
  const nextTrip = currentIndex < allTrips.length - 1 ? allTrips[currentIndex + 1] : null;

  const [expanded, setExpanded] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  useEffect(() => {
    if (clientTripId) load(clientTripId);
    return () => reset();
  }, [clientTripId]);

  // Reload waypoints/images when returning from waypoint screen
  useFocusEffect(
    useCallback(() => {
      if (clientTripId) load(clientTripId);
    }, [clientTripId]),
  );

  useEffect(() => {
    if (!locationSamples.length || !mapRef.current) return;
    const coords = locationSamples.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
    const bottomPad = 180;
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: insets.top + 120, right: 40, bottom: bottomPad, left: 40 },
        animated: true,
      });
    }, 300);
  }, [locationSamples, expanded]);

  async function onReprocess() {
    if (!clientTripId) return;
    setReprocessing(true);
    const result = await reprocessTrip(clientTripId);
    setReprocessing(false);
    if (!result.ok) Alert.alert('Reprocess failed', result.error);
    else load(clientTripId);
  }

  async function onSync() {
    if (!clientTripId) return;
    const error = await syncTrip(clientTripId);
    if (error) Alert.alert('Sync failed', error);
    else load(clientTripId);
  }

  function navigateToTrip(id: string) {
    setExpanded(false);
    router.replace(`/trips/${id}`);
  }

  const totalDistanceM = segments.reduce((a, s) => a + (s.distanceM ?? 0), 0);
  const totalPhotos = Object.values(imagesByWaypoint).reduce((a, imgs) => a + imgs.length, 0);

  const sortedDevice = [...deviceSamples].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const firstDevice = sortedDevice[0];
  const lastDevice = sortedDevice[sortedDevice.length - 1];
  const batteryDelta =
    firstDevice && lastDevice ? firstDevice.batteryPct - lastDevice.batteryPct : null;

  const isSyncing = syncingTripIds.includes(clientTripId ?? '');
  const isSynced = trip?.syncState === 'SYNCED';

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <TrailMap ref={mapRef} style={StyleSheet.absoluteFill} switcherPosition="top-right">
        {segments.map((seg, i) => {
          const pts = pointsForSegment(locationSamples, seg);
          return pts.length > 1 ? (
            <Polyline
              key={i}
              coordinates={pts}
              strokeColor={SEGMENT_COLOR[seg.segmentType]}
              strokeWidth={4}
            />
          ) : null;
        })}
        {waypoints.map((w) => (
          <Marker
            key={w.id}
            coordinate={{ latitude: w.latitude, longitude: w.longitude }}
          >
            <WaypointPin category={w.category} />
            <Callout tooltip>
              <Pressable
                style={calloutStyles.bubble}
                onPress={() => router.push(`/waypoint/${w.id}`)}
              >
                <View style={calloutStyles.row}>
                  <MaterialIcons
                    name={CATEGORY_ICON[w.category]}
                    size={14}
                    color="#5c3d1e"
                  />
                  <Text style={calloutStyles.title} numberOfLines={1}>
                    {w.title}
                  </Text>
                </View>
                <Text style={calloutStyles.hint}>Tap to open</Text>
              </Pressable>
            </Callout>
          </Marker>
        ))}
      </TrailMap>

      {/* Floating back button */}
      <Pressable
        style={[styles.backBtn, { backgroundColor: theme.card, top: insets.top + 12 }]}
        onPress={() => router.back()}
        hitSlop={10}
      >
        <MaterialIcons name="arrow-back" size={20} color={theme.primaryText} />
      </Pressable>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      )}

      {/* ── COLLAPSED PILL ── */}
      {trip && (
        <View
          pointerEvents="box-none"
          style={[styles.pillWrap, { bottom: BOTTOM_NAV_HEIGHT + insets.bottom + 16 }]}
        >
          <View style={styles.pill}>
            <Pressable
              style={[styles.navBtn, !prevTrip && styles.navBtnDisabled]}
              onPress={() => prevTrip && navigateToTrip(prevTrip.trip.clientTripId)}
              disabled={!prevTrip}
            >
              <MaterialIcons
                name="chevron-left"
                size={24}
                color={prevTrip ? '#243224' : '#9aa596'}
              />
            </Pressable>

            <Pressable style={styles.pillCenter} onPress={() => setExpanded(true)}>
              <Text style={styles.pillTitle} numberOfLines={1}>{trip.title}</Text>
              <View style={styles.pillMetaWrap}>
                <Text style={styles.pillMeta}>{formatDistance(totalDistanceM)}</Text>
                <MaterialIcons name="expand-less" size={20} color="#52624f" />
              </View>
            </Pressable>

            <Pressable
              style={[styles.navBtn, !nextTrip && styles.navBtnDisabled]}
              onPress={() => nextTrip && navigateToTrip(nextTrip.trip.clientTripId)}
              disabled={!nextTrip}
            >
              <MaterialIcons
                name="chevron-right"
                size={24}
                color={nextTrip ? '#243224' : '#9aa596'}
              />
            </Pressable>
          </View>
        </View>
      )}

      {/* ── DETAILS SHEET (Modal) ── */}
      <Modal
        animationType="slide"
        onRequestClose={() => setExpanded(false)}
        transparent
        visible={expanded}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel="Close trip details"
            onPress={() => setExpanded(false)}
            style={styles.sheetBackdrop}
          />
          <View style={[styles.sheet, { backgroundColor: theme.card }]}>
            <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
            <Text style={[styles.sheetTitle, { color: theme.primaryText }]} numberOfLines={1}>
              {trip?.title}
            </Text>
            <ScrollView
              contentContainerStyle={styles.sheetBody}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.actionRow}>
                <ActionBtn
                  icon="edit"
                  color={theme.mutedText}
                  bg={theme.accentMuted}
                  onPress={() => Alert.alert('Edit', 'Coming soon')}
                />
                <ActionBtn
                  icon="autorenew"
                  color={theme.accent}
                  bg={theme.accentMuted}
                  onPress={() => void onReprocess()}
                  loading={reprocessing}
                />
                <ActionBtn
                  icon="sync"
                  color={isSynced ? theme.mutedText : theme.accent}
                  bg={theme.accentMuted}
                  onPress={() => void onSync()}
                  loading={isSyncing}
                  disabled={isSynced}
                />
                <ActionBtn
                  icon="share"
                  color={theme.mutedText}
                  bg={theme.accentMuted}
                  onPress={() => Alert.alert('Share', 'Coming soon')}
                  disabled
                />
              </View>

              {!isSynced && (
                <View style={[styles.syncBanner, { backgroundColor: '#fffbe6' }]}>
                  <Text style={styles.syncBannerText}>
                    {trip?.syncState === 'FAILED'
                      ? 'Sync failed — tap Sync to retry.'
                      : 'Not yet synced to server.'}
                  </Text>
                </View>
              )}

              <View style={[styles.statsRow, { borderColor: theme.border }]}>
                <StatCell label="WAYPOINTS" value={String(waypoints.length)} theme={theme} />
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <StatCell label="PHOTOS" value={String(totalPhotos)} theme={theme} />
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <StatCell label="DISTANCE" value={formatDistance(totalDistanceM)} theme={theme} />
              </View>

              {batteryDelta !== null && batteryDelta > 0 && (
                <View style={[styles.batteryCard, { backgroundColor: '#f0f7f0' }]}>
                  <Text style={styles.batteryLabel}>BATTERY CONSUMPTION</Text>
                  <Text style={styles.batteryValue}>{batteryDelta}%</Text>
                  <Text style={styles.batteryDetail}>
                    {firstDevice.batteryPct}%{firstDevice.isCharging ? ' charging' : ' unplugged'} →{' '}
                    {lastDevice.batteryPct}%{lastDevice.isCharging ? ' charging' : ' unplugged'}
                  </Text>
                </View>
              )}

              {segments.length > 0 && (
                <View style={[styles.segmentsList, { borderColor: theme.border }]}>
                  <Text style={[styles.timelineHeader, { color: theme.primaryText }]}>Timeline</Text>
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator={segments.length > 3}
                    style={styles.segmentsScroll}
                  >
                    {segments.map((seg, i) => (
                      <View
                        key={i}
                        style={[
                          styles.timelineRow,
                          i < segments.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.border,
                          },
                        ]}
                      >
                        <View style={styles.timelineLeft}>
                          <View style={styles.timelineNameRow}>
                            <Text style={[styles.timelineName, { color: theme.primaryText }]}>
                              {SEGMENT_LABEL[seg.segmentType]}
                            </Text>
                            <Pressable
                              hitSlop={8}
                              onPress={() => Alert.alert('Edit segment', 'Coming soon')}
                            >
                              <MaterialIcons name="edit" size={14} color={theme.mutedText} />
                            </Pressable>
                          </View>
                          <Text style={[styles.timelineMeta, { color: theme.mutedText }]}>
                            {formatTimeRange(seg.startedAt, seg.endedAt)}
                            {' · '}
                            {formatDuration(seg.endedAt.getTime() - seg.startedAt.getTime())}
                          </Text>
                        </View>
                        <Text style={[styles.timelineDist, { color: theme.primaryText }]}>
                          {formatDistance(seg.distanceM)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Spacer pushes BottomNav to the bottom (all sibling elements are position:absolute) */}
      <View style={{ flex: 1 }} pointerEvents="none" />
      <BottomNav />
    </View>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

function ActionBtn({
  icon,
  color,
  bg,
  onPress,
  loading,
  disabled,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bg: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.actionBtn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <MaterialIcons name={icon} size={20} color={color} />
      )}
    </Pressable>
  );
}

function StatCell({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof import('@/hooks/useAppTheme').useAppTheme>['theme'];
}) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statLabel, { color: theme.mutedText }]}>{label}</Text>
      <Text style={[styles.statValue, { color: theme.primaryText }]}>{value}</Text>
    </View>
  );
}

// ── Waypoint marker helpers ────────────────────────────────────────────────


function WaypointPin({ category }: { category: WaypointCategory }) {
  return (
    <View style={pinStyles.circle}>
      <MaterialIcons name={CATEGORY_ICON[category]} size={18} color="#fff" />
    </View>
  );
}

const pinStyles = StyleSheet.create({
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5c3d1e',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
});

const calloutStyles = StyleSheet.create({
  bubble: {
    minWidth: 140,
    maxWidth: 220,
    backgroundColor: '#fffdf8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#243224' },
  hint: { fontSize: 12, color: '#76856f' },
});


// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Floating back button
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Collapsed pill
  pillWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  pill: {
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderWidth: 1,
    borderColor: 'rgba(235, 225, 207, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 7,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(230, 236, 225, 0.9)',
  },
  navBtnDisabled: { opacity: 0.42 },
  pillCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 10,
    gap: 8,
  },
  pillTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#243224' },
  pillMetaWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillMeta: { fontSize: 13, fontWeight: '700', color: '#52624f' },

  // Details sheet (Modal)
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(20, 28, 20, 0.28)',
  },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '100%',
    maxHeight: '82%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(235, 225, 207, 0.92)',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 22,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  dragHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    marginBottom: 12,
  },
  sheetBody: { gap: 14, paddingTop: 14, paddingBottom: 12 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#243224', marginBottom: 2 },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sync banner
  syncBanner: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  syncBannerText: { fontSize: 13, color: '#7a6200' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    marginBottom: 16,
  },
  statCell: { flex: 1, padding: 14 },
  statLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700' },
  statDivider: { width: StyleSheet.hairlineWidth },

  // Battery
  batteryCard: {
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  batteryLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, color: '#3a6b3a' },
  batteryValue: { fontSize: 22, fontWeight: '700', color: '#3a6b3a' },
  batteryDetail: { fontSize: 13, color: '#3a6b3a' },

  // Timeline
  segmentsList: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  segmentsScroll: { maxHeight: 205 },
  timelineHeader: { fontSize: 16, fontWeight: '700', color: '#243224' },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  timelineLeft: { flex: 1, gap: 3 },
  timelineNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timelineName: { fontSize: 14, fontWeight: '700' },
  timelineMeta: { fontSize: 13 },
  timelineDist: { fontSize: 13, fontWeight: '700', color: '#355035' },
});
