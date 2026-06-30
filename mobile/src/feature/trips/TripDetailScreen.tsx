import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  ScrollView,
  Modal,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import MapView, {
  Polyline,
  Marker,
  type LongPressEvent,
  type Region,
} from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTripDetailStore } from '@/feature/trips/tripDetailStore';
import { useTripsStore } from '@/feature/trips/tripsStore';
import { SEGMENT_COLOR, SEGMENT_LABEL } from '@/constants/segmentColors';
import {
  reprocessTrip,
  undoReprocessing,
} from '@/core/domain/usecase/ReprocessTripUseCase';
import { BottomNav } from '@/components/ui/BottomNav';
import { TrailMap } from '@/components/ui/TrailMap';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { cleanLocations, splitLocationsOnRouteGaps } from '@/core/domain/processing/locationCleaner';
import type { GeoPoint } from '@/core/domain/processing/types';
import type { Segment } from '@/core/domain/model/segment';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import { CATEGORY_ICON } from '@/constants/waypointCategories';
import {
  WaypointPhotoPreview,
  WAYPOINT_PREVIEW_HEIGHT,
  WAYPOINT_PREVIEW_STEM_SIZE,
  WAYPOINT_PREVIEW_WIDTH,
} from './components/WaypointPhotoPreview';
import {
  TripPointInfoPreview,
  TRIP_POINT_PREVIEW_HEIGHT,
  TRIP_POINT_PREVIEW_STEM_SIZE,
  TRIP_POINT_PREVIEW_WIDTH,
  type TripPointInfo,
} from './components/TripPointInfoPreview';

const WAYPOINT_PREVIEW_MARGIN = 12;
const WAYPOINT_PREVIEW_GAP = 14;
const TRIP_POINT_PREVIEW_MIN_DISTANCE_METERS = 120;
const TRIP_POINT_PREVIEW_MAX_DISTANCE_METERS = 50_000;
const TRIP_POINT_PREVIEW_TOUCH_RADIUS_PX = 32;
const MAX_MAP_ROUTE_POINTS = 2_500;
const METERS_PER_DEGREE_LATITUDE = 111_320;

function pointGroupsForSegment(locations: GeoPoint[], seg: Segment) {
  const segmentLocations = locations
    .filter((l) => l.timestamp >= seg.startedAt && l.timestamp <= seg.endedAt);
  return splitLocationsOnRouteGaps(segmentLocations)
    .map((group) => group.map((l) => ({ latitude: l.latitude, longitude: l.longitude })))
    .filter((group) => group.length > 1);
}

function thinLocationsForMap(locations: GeoPoint[]) {
  if (locations.length <= MAX_MAP_ROUTE_POINTS) return locations;

  const step = Math.ceil(locations.length / MAX_MAP_ROUTE_POINTS);
  return locations.filter(
    (_location, index) => index === 0 || index === locations.length - 1 || index % step === 0,
  );
}

function segmentForTimestamp(segments: Segment[], timestamp: Date) {
  let match: Segment | undefined;

  for (const segment of segments) {
    if (
      timestamp >= segment.startedAt &&
      timestamp <= segment.endedAt &&
      (!match || segment.startedAt > match.startedAt)
    ) {
      match = segment;
    }
  }

  return match;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getMetersPerDegreeLongitude(latitude: number) {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
}

function getLocalMeters(
  coordinate: { latitude: number; longitude: number },
  origin: { latitude: number; longitude: number },
) {
  return {
    x: (coordinate.longitude - origin.longitude) * getMetersPerDegreeLongitude(origin.latitude),
    y: (coordinate.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  };
}

function getDistanceToSegmentMeters(
  target: { latitude: number; longitude: number },
  start: TripPointInfo,
  end: TripPointInfo,
) {
  const startMeters = getLocalMeters(start, target);
  const endMeters = getLocalMeters(end, target);
  const dx = endMeters.x - startMeters.x;
  const dy = endMeters.y - startMeters.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return {
      distanceMeters: Math.hypot(startMeters.x, startMeters.y),
      nearestPoint: start,
    };
  }

  const t = clamp(-(startMeters.x * dx + startMeters.y * dy) / segmentLengthSquared, 0, 1);
  const projection = {
    x: startMeters.x + t * dx,
    y: startMeters.y + t * dy,
  };

  return {
    distanceMeters: Math.hypot(projection.x, projection.y),
    nearestPoint: t < 0.5 ? start : end,
  };
}

function findNearestTripPoint(
  target: { latitude: number; longitude: number },
  tripPointInfos: TripPointInfo[],
  maxDistanceMeters: number,
) {
  if (tripPointInfos.length === 0) return null;

  if (tripPointInfos.length === 1) {
    const pointMeters = getLocalMeters(tripPointInfos[0], target);
    return Math.hypot(pointMeters.x, pointMeters.y) <= maxDistanceMeters
      ? tripPointInfos[0]
      : null;
  }

  let best: { distanceMeters: number; nearestPoint: TripPointInfo } | null = null;

  for (let index = 0; index < tripPointInfos.length - 1; index += 1) {
    const candidate = getDistanceToSegmentMeters(
      target,
      tripPointInfos[index],
      tripPointInfos[index + 1],
    );
    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
  }

  return best && best.distanceMeters <= maxDistanceMeters ? best.nearestPoint : null;
}

function getTripPointPreviewMaxDistanceMeters(
  region: Region | null,
  mapLayout: { width: number; height: number },
) {
  if (!region || mapLayout.width <= 0 || mapLayout.height <= 0) {
    return TRIP_POINT_PREVIEW_MIN_DISTANCE_METERS;
  }

  const horizontalMeters =
    region.longitudeDelta * getMetersPerDegreeLongitude(region.latitude);
  const verticalMeters = region.latitudeDelta * METERS_PER_DEGREE_LATITUDE;
  const metersPerPixel = Math.max(
    horizontalMeters / mapLayout.width,
    verticalMeters / mapLayout.height,
  );

  return clamp(
    metersPerPixel * TRIP_POINT_PREVIEW_TOUCH_RADIUS_PX,
    TRIP_POINT_PREVIEW_MIN_DISTANCE_METERS,
    TRIP_POINT_PREVIEW_MAX_DISTANCE_METERS,
  );
}

export default function TripDetailScreen() {
  const { clientTripId } = useLocalSearchParams<{ clientTripId: string }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const mapRef = useRef<MapView>(null);

  const load = useTripDetailStore((s) => s.load);
  const reset = useTripDetailStore((s) => s.reset);
  const trip = useTripDetailStore((s) => s.trip);
  const segments = useTripDetailStore((s) => s.segments);
  const waypoints = useTripDetailStore((s) => s.waypoints);
  const imagesByWaypoint = useTripDetailStore((s) => s.imagesByWaypoint);
  const locationSamples = useTripDetailStore((s) => s.locationSamples);
  const hasReprocessingSnapshot = useTripDetailStore((s) => s.hasReprocessingSnapshot);
  const loading = useTripDetailStore((s) => s.loading);

  const allTrips = useTripsStore((s) => s.trips);
  const syncingTripIds = useTripsStore((s) => s.syncingTripIds);
  const syncTrip = useTripsStore((s) => s.syncTrip);
  const currentIndex = allTrips.findIndex((t) => t.trip.clientTripId === clientTripId);
  const prevTrip = currentIndex > 0 ? allTrips[currentIndex - 1] : null;
  const nextTrip = currentIndex < allTrips.length - 1 ? allTrips[currentIndex + 1] : null;

  const [expanded, setExpanded] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);
  const [waypointPreview, setWaypointPreview] = useState<{
    waypointId: string;
    x: number;
    y: number;
  } | null>(null);
  const [tripPointPreview, setTripPointPreview] = useState<{
    point: TripPointInfo;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => () => reset(), [clientTripId, reset]);

  // Reload waypoints/images when returning from waypoint screen
  useFocusEffect(
    useCallback(() => {
      if (clientTripId) load(clientTripId);
    }, [clientTripId]),
  );

  const cleanedLocations = useMemo(() => cleanLocations(locationSamples), [locationSamples]);
  const mapLocations = useMemo(() => thinLocationsForMap(cleanedLocations), [cleanedLocations]);
  const segmentPointGroups = useMemo(
    () => segments.map((seg) => pointGroupsForSegment(mapLocations, seg)),
    [mapLocations, segments],
  );

  useEffect(() => {
    if (!mapLocations.length || !mapRef.current) return;
    const coords = mapLocations.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
    const bottomPad = 180;
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 40, bottom: bottomPad, left: 40 },
        animated: true,
      });
    }, 300);
  }, [mapLocations, expanded]);

  async function onReprocessToggle() {
    if (!clientTripId) return;
    setReprocessing(true);
    const result = hasReprocessingSnapshot
      ? await undoReprocessing(clientTripId)
      : await reprocessTrip(clientTripId);
    setReprocessing(false);
    if (!result.ok) {
      showAlert({
        title: hasReprocessingSnapshot ? 'Undo failed' : 'Reprocess failed',
        message: result.error,
      });
      return;
    }

    setExpanded(false);
    await load(clientTripId);
  }

  async function onSync() {
    if (!clientTripId) return;
    const error = await syncTrip(clientTripId);
    if (error) showAlert({ title: 'Sync failed', message: error });
    else load(clientTripId);
  }

  function navigateToTrip(id: string) {
    setExpanded(false);
    setWaypointPreview(null);
    setTripPointPreview(null);
    router.replace(`/trips/${id}`);
  }

  function navigateToWaypoint(waypointId: string) {
    setWaypointPreview(null);
    setTripPointPreview(null);
    router.push(`/waypoint/${waypointId}`);
  }

  async function handleWaypointPress(waypoint: Waypoint) {
    const firstImage = imagesByWaypoint[waypoint.id]?.[0];
    if (!firstImage) {
      navigateToWaypoint(waypoint.id);
      return;
    }

    let x = mapLayout.width / 2;
    let y = mapLayout.height / 2;

    try {
      const point = await mapRef.current?.pointForCoordinate({
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
      });
      if (point) {
        x = point.x;
        y = point.y;
      }
    } catch {
      // Keep the centered fallback when native map projection is temporarily unavailable.
    }

    setTripPointPreview(null);
    setWaypointPreview({ waypointId: waypoint.id, x, y });
  }

  async function handleMapLongPress(event: LongPressEvent) {
    const nearestPoint = findNearestTripPoint(
      event.nativeEvent.coordinate,
      tripPointInfos,
      getTripPointPreviewMaxDistanceMeters(currentRegion, mapLayout),
    );

    if (!nearestPoint) {
      setTripPointPreview(null);
      return;
    }

    let x = event.nativeEvent.position.x;
    let y = event.nativeEvent.position.y;

    try {
      const projectedPoint = await mapRef.current?.pointForCoordinate({
        latitude: nearestPoint.latitude,
        longitude: nearestPoint.longitude,
      });
      if (projectedPoint) {
        x = projectedPoint.x;
        y = projectedPoint.y;
      }
    } catch {
      // Keep the long-press position when native map projection is unavailable.
    }

    setWaypointPreview(null);
    setTripPointPreview({ point: nearestPoint, x, y });
  }

  function handleMapLayout(event: LayoutChangeEvent) {
    setMapLayout({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
  }

  const totalDistanceM = segments.reduce((a, s) => a + (s.distanceM ?? 0), 0);
  const totalPhotos = Object.values(imagesByWaypoint).reduce((a, imgs) => a + imgs.length, 0);

  const isSyncing = syncingTripIds.includes(clientTripId ?? '');
  const isSynced = trip?.syncState === 'SYNCED';
  const tripPointInfos = useMemo(
    () =>
      mapLocations.map((sample, index) => {
        const segment = segmentForTimestamp(segments, sample.timestamp);

        return {
          accuracyM: null,
          id: `${sample.timestamp.toISOString()}-${index}`,
          latitude: sample.latitude,
          longitude: sample.longitude,
          recordedAt: sample.timestamp,
          segmentType: segment?.segmentType ?? 'UNKNOWN',
          speedMps: sample.speedMps ?? null,
        };
      }),
    [mapLocations, segments],
  );
  const previewWaypoint = waypointPreview
    ? waypoints.find((waypoint) => waypoint.id === waypointPreview.waypointId)
    : undefined;
  const previewImage = previewWaypoint
    ? imagesByWaypoint[previewWaypoint.id]?.[0]
    : undefined;
  const previewPlacement = waypointPreview && mapLayout.width > 0 && mapLayout.height > 0
    ? (() => {
        const maxLeft = Math.max(
          WAYPOINT_PREVIEW_MARGIN,
          mapLayout.width - WAYPOINT_PREVIEW_WIDTH - WAYPOINT_PREVIEW_MARGIN,
        );
        const usableBottom = mapLayout.height - WAYPOINT_PREVIEW_MARGIN;
        const maxTop = Math.max(
          WAYPOINT_PREVIEW_MARGIN,
          usableBottom - WAYPOINT_PREVIEW_HEIGHT,
        );
        const left = clamp(
          waypointPreview.x - WAYPOINT_PREVIEW_WIDTH / 2,
          WAYPOINT_PREVIEW_MARGIN,
          maxLeft,
        );
        const hasSpaceAbove =
          waypointPreview.y >=
          WAYPOINT_PREVIEW_HEIGHT + WAYPOINT_PREVIEW_GAP + WAYPOINT_PREVIEW_STEM_SIZE;
        const preferredTop = hasSpaceAbove
          ? waypointPreview.y -
            WAYPOINT_PREVIEW_HEIGHT -
            WAYPOINT_PREVIEW_GAP -
            WAYPOINT_PREVIEW_STEM_SIZE / 2
          : waypointPreview.y + WAYPOINT_PREVIEW_GAP + WAYPOINT_PREVIEW_STEM_SIZE / 2;
        const top = clamp(preferredTop, WAYPOINT_PREVIEW_MARGIN, maxTop);
        const stemLeft = clamp(
          waypointPreview.x - left - WAYPOINT_PREVIEW_STEM_SIZE / 2,
          WAYPOINT_PREVIEW_STEM_SIZE,
          WAYPOINT_PREVIEW_WIDTH - WAYPOINT_PREVIEW_STEM_SIZE * 2,
        );

        return {
          card: { left, top },
          stem: { left: stemLeft },
          stemPosition: hasSpaceAbove ? 'bottom' : 'top',
        } as const;
      })()
    : null;
  const tripPointPreviewPlacement =
    tripPointPreview && mapLayout.width > 0 && mapLayout.height > 0
      ? (() => {
          const maxLeft = Math.max(
            WAYPOINT_PREVIEW_MARGIN,
            mapLayout.width - TRIP_POINT_PREVIEW_WIDTH - WAYPOINT_PREVIEW_MARGIN,
          );
          const maxTop = Math.max(
            WAYPOINT_PREVIEW_MARGIN,
            mapLayout.height - TRIP_POINT_PREVIEW_HEIGHT - WAYPOINT_PREVIEW_MARGIN,
          );
          const left = clamp(
            tripPointPreview.x - TRIP_POINT_PREVIEW_WIDTH / 2,
            WAYPOINT_PREVIEW_MARGIN,
            maxLeft,
          );
          const hasSpaceAbove =
            tripPointPreview.y >=
            TRIP_POINT_PREVIEW_HEIGHT +
              WAYPOINT_PREVIEW_GAP +
              TRIP_POINT_PREVIEW_STEM_SIZE;
          const preferredTop = hasSpaceAbove
            ? tripPointPreview.y -
              TRIP_POINT_PREVIEW_HEIGHT -
              WAYPOINT_PREVIEW_GAP -
              TRIP_POINT_PREVIEW_STEM_SIZE / 2
            : tripPointPreview.y +
              WAYPOINT_PREVIEW_GAP +
              TRIP_POINT_PREVIEW_STEM_SIZE / 2;
          const top = clamp(preferredTop, WAYPOINT_PREVIEW_MARGIN, maxTop);
          const stemLeft = clamp(
            tripPointPreview.x - left - TRIP_POINT_PREVIEW_STEM_SIZE / 2,
            TRIP_POINT_PREVIEW_STEM_SIZE,
            TRIP_POINT_PREVIEW_WIDTH - TRIP_POINT_PREVIEW_STEM_SIZE * 2,
          );

          return {
            card: { left, top },
            stem: { left: stemLeft },
            stemPosition: hasSpaceAbove ? 'bottom' : 'top',
          } as const;
        })()
      : null;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <TopAppBar onBack={() => router.back()} title="Trip details" />

      <View style={styles.mapArea} onLayout={handleMapLayout}>
        <TrailMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          switcherPosition="top-right"
          moveOnMarkerPress={false}
          onLongPress={(event) => void handleMapLongPress(event)}
          onRegionChangeComplete={setCurrentRegion}
        >
          {segments.map((seg, i) => {
            const pointGroups = segmentPointGroups[i] ?? [];
            return pointGroups.map((points, groupIndex) => (
              <Polyline
                key={`${i}-${groupIndex}`}
                coordinates={points}
                strokeColor={SEGMENT_COLOR[seg.segmentType]}
                strokeWidth={4}
              />
            ));
          })}
          {waypoints.map((w) => (
            <Marker
              key={w.id}
              coordinate={{ latitude: w.latitude, longitude: w.longitude }}
              onPress={() => void handleWaypointPress(w)}
            >
              <WaypointPin category={w.category} />
            </Marker>
          ))}
        </TrailMap>

        {previewWaypoint && previewImage && previewPlacement && (
          <WaypointPhotoPreview
            imageUri={previewImage.localUri}
            onClose={() => setWaypointPreview(null)}
            onOpen={() => navigateToWaypoint(previewWaypoint.id)}
            placement={previewPlacement}
            title={previewWaypoint.title}
          />
        )}

        {tripPointPreview && tripPointPreviewPlacement && (
          <TripPointInfoPreview
            onClose={() => setTripPointPreview(null)}
            placement={tripPointPreviewPlacement}
            point={tripPointPreview.point}
          />
        )}

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={theme.accent} size="large" />
          </View>
        )}

        {trip && (
          <View pointerEvents="box-none" style={styles.pillWrap}>
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
      </View>

      <BottomNav />

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
                  accessibilityLabel="Edit trip"
                  icon="edit"
                  color={theme.mutedText}
                  bg={theme.accentMuted}
                  onPress={() => showAlert({ title: 'Edit', message: 'Coming soon' })}
                />
                <ActionBtn
                  accessibilityLabel={
                    hasReprocessingSnapshot ? 'Undo reprocessing' : 'Reprocess trip'
                  }
                  icon={hasReprocessingSnapshot ? 'undo' : 'redo'}
                  color={hasReprocessingSnapshot ? theme.danger : theme.accent}
                  bg={hasReprocessingSnapshot ? theme.dangerMuted : theme.accentMuted}
                  onPress={() => void onReprocessToggle()}
                  loading={reprocessing}
                />
                <ActionBtn
                  accessibilityLabel={isSynced ? 'Trip synced' : 'Sync trip'}
                  icon="sync"
                  color={isSynced ? theme.mutedText : theme.danger}
                  bg={isSynced ? theme.accentMuted : theme.dangerMuted}
                  onPress={() => void onSync()}
                  loading={isSyncing}
                  spinWhenLoading
                  disabled={isSynced}
                />
                <ActionBtn
                  accessibilityLabel="Share trip"
                  icon="share"
                  color={theme.mutedText}
                  bg={theme.accentMuted}
                  onPress={() => showAlert({ title: 'Share', message: 'Coming soon' })}
                  disabled
                />
              </View>

              <View style={[styles.statsRow, { borderColor: theme.border }]}>
                <StatCell label="WAYPOINTS" value={String(waypoints.length)} theme={theme} />
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <StatCell label="PHOTOS" value={String(totalPhotos)} theme={theme} />
                <View style={[styles.statDivider, { backgroundColor: theme.border }]} />
                <StatCell label="DISTANCE" value={formatDistance(totalDistanceM)} theme={theme} />
              </View>

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
                              onPress={() =>
                                showAlert({ title: 'Edit segment', message: 'Coming soon' })
                              }
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

    </SafeAreaView>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────

function ActionBtn({
  accessibilityLabel,
  icon,
  color,
  bg,
  onPress,
  loading,
  spinWhenLoading,
  disabled,
}: {
  accessibilityLabel: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  bg: string;
  onPress: () => void;
  loading?: boolean;
  spinWhenLoading?: boolean;
  disabled?: boolean;
}) {
  const [rotation] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!loading || !spinWhenLoading) {
      rotation.stopAnimation();
      rotation.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [loading, rotation, spinWhenLoading]);

  const rotatingStyle = {
    transform: [
      {
        rotate: rotation.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  };

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={[styles.actionBtn, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading && spinWhenLoading ? (
        <Animated.View style={rotatingStyle}>
          <MaterialIcons name={icon} size={20} color={color} />
        </Animated.View>
      ) : loading ? (
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

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapArea: {
    flex: 1,
    position: 'relative',
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
    bottom: 16,
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
