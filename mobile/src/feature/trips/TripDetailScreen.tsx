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
  TextInput,
  Share,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import MapView, {
  Polyline,
  Marker,
  type LongPressEvent,
  type Region,
} from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTripDetailStore } from '@/feature/trips/tripDetailStore';
import { useTripsStore } from '@/feature/trips/tripsStore';
import { useTripGroupsStore } from '@/feature/trips/tripGroupsStore';
import { SEGMENT_COLOR, SEGMENT_LABEL } from '@/constants/segmentColors';
import {
  reprocessTrip,
  undoReprocessing,
} from '@/core/domain/usecase/ReprocessTripUseCase';
import { createTripShareLink } from '@/core/domain/usecase/ShareTripUseCase';
import { shareTripWithUser } from '@/core/domain/usecase/ShareTripWithUserUseCase';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { TrailMap } from '@/components/ui/TrailMap';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import { splitLocationsOnRouteGaps } from '@/core/domain/processing/locationCleaner';
import type { GeoPoint } from '@/core/domain/processing/types';
import type { Segment } from '@/core/domain/model/segment';
import type { Waypoint } from '@/core/domain/model/waypoint';
import { WaypointPin } from './components/WaypointPin';
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
import {
  groupTripHref,
  normalizeGroupTripSort,
  sortGroupTrips,
  waypointHref,
} from './groupNavigation';
import { saveTripNavigationContext } from './tripNavigationContext';
import { useTripFiltersStore } from './tripFiltersStore';

const WAYPOINT_PREVIEW_MARGIN = 12;
const WAYPOINT_PREVIEW_GAP = 14;
const TRIP_POINT_PREVIEW_MIN_DISTANCE_METERS = 120;
const TRIP_POINT_PREVIEW_MAX_DISTANCE_METERS = 50_000;
const TRIP_POINT_PREVIEW_TOUCH_RADIUS_PX = 32;
const METERS_PER_DEGREE_LATITUDE = 111_320;

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function pointGroupsForSegment(locations: GeoPoint[], seg: Segment) {
  const segmentLocations = locations
    .filter((l) => l.timestamp >= seg.startedAt && l.timestamp <= seg.endedAt);
  return splitLocationsOnRouteGaps(segmentLocations)
    .map((group) => group.map((l) => ({ latitude: l.latitude, longitude: l.longitude })))
    .filter((group) => group.length > 1);
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

export default function TripDetailScreen({ source = 'local' }: { source?: 'local' | 'shared' }) {
  const readOnly = source === 'shared';
  const { clientTripId, groupId, groupSort: groupSortParam } = useLocalSearchParams<{
    clientTripId: string;
    groupId?: string;
    groupSort?: string;
  }>();
  const router = useRouter();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const load = useTripDetailStore((s) => s.load);
  const loadShared = useTripDetailStore((s) => s.loadShared);
  const reset = useTripDetailStore((s) => s.reset);
  const trip = useTripDetailStore((s) => s.trip);
  const segments = useTripDetailStore((s) => s.segments);
  const waypoints = useTripDetailStore((s) => s.waypoints);
  const imagesByWaypoint = useTripDetailStore((s) => s.imagesByWaypoint);
  const routePoints = useTripDetailStore((s) => s.routePoints);
  const hasReprocessingSnapshot = useTripDetailStore((s) => s.hasReprocessingSnapshot);
  const sharedBy = useTripDetailStore((s) => s.sharedBy);
  const loading = useTripDetailStore((s) => s.loading);

  const allTrips = useTripsStore((s) => s.trips);
  const syncingTripIds = useTripsStore((s) => s.syncingTripIds);
  const syncTrip = useTripsStore((s) => s.syncTrip);
  const reloadTrips = useTripsStore((s) => s.load);
  const groups = useTripGroupsStore((s) => s.groups);
  const loadGroups = useTripGroupsStore((s) => s.load);
  const filters = useTripFiltersStore((s) => s.filters);
  const loadFilters = useTripFiltersStore((s) => s.loadFilters);
  const groupSort = normalizeGroupTripSort(groupSortParam);
  const activeGroupId = Array.isArray(groupId) ? groupId[0] : groupId;
  const tripsById = useMemo(
    () => new Map(allTrips.map((item) => [item.trip.clientTripId, item])),
    [allTrips],
  );
  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((item) => item.group.id === activeGroupId) : undefined),
    [activeGroupId, groups],
  );
  const navigationTrips = useMemo(
    () =>
      readOnly
        ? []
        : activeGroup
          ? sortGroupTrips(activeGroup, tripsById, groupSort)
          : allTrips,
    [activeGroup, allTrips, groupSort, readOnly, tripsById],
  );
  const currentIndex = navigationTrips.findIndex((t) => t.trip.clientTripId === clientTripId);
  const isNewestFirstNavigation =
    activeGroup ? groupSort === 'newest' : filters.sort === 'newest';
  const prevTrip = isNewestFirstNavigation
    ? currentIndex >= 0 && currentIndex < navigationTrips.length - 1
      ? navigationTrips[currentIndex + 1]
      : null
    : currentIndex > 0
      ? navigationTrips[currentIndex - 1]
      : null;
  const nextTrip = isNewestFirstNavigation
    ? currentIndex > 0
      ? navigationTrips[currentIndex - 1]
      : null
    : currentIndex >= 0 && currentIndex < navigationTrips.length - 1
      ? navigationTrips[currentIndex + 1]
      : null;

  const [expanded, setExpanded] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUserVisible, setShareUserVisible] = useState(false);
  const [shareUserEmail, setShareUserEmail] = useState('');
  const [sharingWithUser, setSharingWithUser] = useState(false);
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

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    if (!readOnly && !activeGroup) {
      reloadTrips(filters);
    }
  }, [activeGroup, filters, readOnly, reloadTrips]);

  // Reload waypoints/images when returning from waypoint screen
  useFocusEffect(
    useCallback(() => {
      if (!clientTripId) return;
      if (readOnly) {
        loadShared(clientTripId);
        return;
      }

      load(clientTripId);
      if (activeGroupId) loadGroups();
    }, [activeGroupId, clientTripId, load, loadGroups, loadShared, readOnly]),
  );

  const mapLocations = useMemo<GeoPoint[]>(
    () =>
      routePoints.map((point) => ({
        timestamp: point.timestamp,
        latitude: point.latitude,
        longitude: point.longitude,
        speedMps: point.speedMps,
        altitudeM: undefined,
      })),
    [routePoints],
  );
  const segmentPointGroups = useMemo(
    () => segments.map((seg) => pointGroupsForSegment(mapLocations, seg)),
    [mapLocations, segments],
  );

  useEffect(() => {
    if (!mapLocations.length || !mapRef.current) return;
    const coords = mapLocations.map((l) => ({ latitude: l.latitude, longitude: l.longitude }));
    const bottomPad = 120;
    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 40, bottom: bottomPad, left: 40 },
        animated: false,
      });
    }, 300);
  }, [mapLocations, expanded]);

  function openEditSheet() {
    if (readOnly) return;
    if (!trip) return;
    setEditTitle(trip.title);
    setEditDescription(trip.description ?? '');
    setExpanded(false);
    setTimeout(() => setEditVisible(true), 250);
  }

  async function saveTripDetails() {
    if (readOnly) return;
    if (!trip || savingEdit) return;

    const title = editTitle.trim();
    const description = editDescription.trim();
    if (!title) {
      showAlert({ title: 'Title is required' });
      return;
    }

    setSavingEdit(true);
    const result = await tripRepository.updateDetails(
      trip.clientTripId,
      title,
      description.length > 0 ? description : null,
    );
    setSavingEdit(false);

    if (!result.ok) {
      showAlert({ title: 'Save failed', message: result.error });
      return;
    }

    setEditVisible(false);
    await Promise.all([load(trip.clientTripId), reloadTrips()]);
  }

  async function onReprocessToggle() {
    if (readOnly) return;
    if (!clientTripId) return;
    setReprocessing(true);
    setExpanded(false);
    await waitForNextFrame();

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

    await load(clientTripId);
  }

  async function onSync() {
    if (readOnly) return;
    if (!clientTripId) return;
    const error = await syncTrip(clientTripId);
    if (error) showAlert({ title: 'Sync failed', message: error });
    else load(clientTripId);
  }

  async function onShare() {
    if (readOnly) return;
    if (!clientTripId || sharing) return;

    setSharing(true);
    const result = await createTripShareLink(clientTripId);
    setSharing(false);

    if (!result.ok) {
      showAlert({ title: 'Share failed', message: result.error });
      return;
    }

    try {
      await Share.share({
        message: `${result.value.shareUrl}\nPIN: ${result.value.pin}`,
        title: trip?.title ?? 'Trailbook trip',
      });
    } catch (error) {
      showAlert({
        title: 'Share failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function openShareUserSheet() {
    if (readOnly) return;
    setShareUserEmail('');
    setExpanded(false);
    setTimeout(() => setShareUserVisible(true), 250);
  }

  async function onShareWithUser() {
    if (readOnly) return;
    if (!clientTripId || sharingWithUser) return;

    setSharingWithUser(true);
    const result = await shareTripWithUser(clientTripId, shareUserEmail);
    setSharingWithUser(false);

    if (!result.ok) {
      showAlert({ title: 'Share failed', message: result.error });
      return;
    }

    setShareUserVisible(false);
    showAlert({
      title: 'Trip shared',
      message: `Shared with ${result.value.recipientEmail}.`,
    });
  }

  function navigateToTrip(id: string) {
    if (readOnly) return;
    setExpanded(false);
    setWaypointPreview(null);
    setTripPointPreview(null);
    router.replace(groupTripHref(id, activeGroupId, activeGroup ? groupSort : null));
  }

  function navigateToWaypoint(waypointId: string) {
    setWaypointPreview(null);
    setTripPointPreview(null);
    const tripContextId = saveTripNavigationContext(
      activeGroup && navigationTrips.length > 0
        ? navigationTrips.map((item) => item.trip.clientTripId)
        : clientTripId
          ? [clientTripId]
          : [],
    );
    router.push(waypointHref(waypointId, activeGroupId, activeGroup ? groupSort : null, tripContextId));
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
          <View pointerEvents="box-none" style={[styles.pillWrap, { bottom: insets.bottom + 12 }]}>
            <View style={styles.pill}>
              {!readOnly ? (
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
              ) : null}

              <Pressable style={styles.pillCenter} onPress={() => setExpanded(true)}>
                <Text style={styles.pillTitle} numberOfLines={1}>{trip.title}</Text>
                <View style={styles.pillMetaWrap}>
                  <Text style={styles.pillMeta}>{formatDistance(totalDistanceM)}</Text>
                  <MaterialIcons name="expand-less" size={20} color="#52624f" />
                </View>
              </Pressable>

              {!readOnly ? (
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
              ) : null}
            </View>
          </View>
        )}
      </View>

      {reprocessing && (
        <View style={styles.processingOverlay}>
          <View style={[styles.processingCard, { backgroundColor: theme.card }]}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={[styles.processingTitle, { color: theme.primaryText }]}>
              Processing route...
            </Text>
            <Text style={[styles.processingText, { color: theme.mutedText }]}>
              Please wait while Trailbook rebuilds segments.
            </Text>
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
            {readOnly && sharedBy ? (
              <Text style={[styles.sharedByText, { color: theme.accent }]}>
                Shared by {sharedBy}
              </Text>
            ) : null}
            {trip?.description ? (
              <Text style={[styles.sheetDescription, { color: theme.mutedText }]}>
                {trip.description}
              </Text>
            ) : null}
            <ScrollView
              contentContainerStyle={styles.sheetBody}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {!readOnly ? (
                <View style={styles.actionRow}>
                  <ActionBtn
                    accessibilityLabel="Edit trip"
                    icon="edit"
                    color={theme.mutedText}
                    bg={theme.accentMuted}
                    onPress={openEditSheet}
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
                    spinWhenLoading
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
                    accessibilityLabel="Share trip link"
                    icon="share"
                    color={isSynced ? theme.accent : theme.mutedText}
                    bg={theme.accentMuted}
                    onPress={() => void onShare()}
                    loading={sharing}
                    disabled={!isSynced || sharing}
                  />
                  <ActionBtn
                    accessibilityLabel="Share with Trailbook user"
                    icon="person-add"
                    color={isSynced ? theme.accent : theme.mutedText}
                    bg={theme.accentMuted}
                    onPress={openShareUserSheet}
                    loading={sharingWithUser}
                    disabled={!isSynced || sharingWithUser}
                  />
                </View>
              ) : null}

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
                            {!readOnly ? (
                              <Pressable
                                hitSlop={8}
                                onPress={() =>
                                  showAlert({ title: 'Edit segment', message: 'Coming soon' })
                                }
                              >
                                <MaterialIcons name="edit" size={14} color={theme.mutedText} />
                              </Pressable>
                            ) : null}
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

      <Modal
        animationType="fade"
        onRequestClose={() => setEditVisible(false)}
        transparent
        visible={editVisible}
      >
        <View style={styles.editOverlay}>
          <Pressable
            accessibilityLabel="Close edit trip"
            onPress={() => setEditVisible(false)}
            style={styles.editBackdrop}
          />
          <View style={[styles.editCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.editTitle, { color: theme.primaryText }]}>Edit trip</Text>
            <TextInput
              autoCapitalize="sentences"
              editable={!savingEdit}
              onChangeText={setEditTitle}
              placeholder="Trip title"
              placeholderTextColor={theme.mutedText}
              style={[
                styles.editInput,
                { borderColor: theme.border, color: theme.primaryText },
              ]}
              value={editTitle}
            />
            <TextInput
              editable={!savingEdit}
              multiline
              onChangeText={setEditDescription}
              placeholder="Description"
              placeholderTextColor={theme.mutedText}
              style={[
                styles.editInput,
                styles.editDescriptionInput,
                { borderColor: theme.border, color: theme.primaryText },
              ]}
              textAlignVertical="top"
              value={editDescription}
            />
            <View style={styles.editActions}>
              <Pressable
                disabled={savingEdit}
                onPress={() => setEditVisible(false)}
                style={[styles.editButton, { backgroundColor: theme.accentMuted }]}
              >
                <Text style={[styles.editCancelText, { color: theme.primaryText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={savingEdit}
                onPress={() => void saveTripDetails()}
                style={[
                  styles.editButton,
                  { backgroundColor: theme.accent, opacity: savingEdit ? 0.65 : 1 },
                ]}
              >
                {savingEdit ? (
                  <ActivityIndicator color={theme.card} size="small" />
                ) : (
                  <Text style={[styles.editSaveText, { color: theme.card }]}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setShareUserVisible(false)}
        transparent
        visible={shareUserVisible}
      >
        <View style={styles.editOverlay}>
          <Pressable
            accessibilityLabel="Close share trip"
            onPress={() => setShareUserVisible(false)}
            style={styles.editBackdrop}
          />
          <View style={[styles.editCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.editTitle, { color: theme.primaryText }]}>
              Share with Trailbook user
            </Text>
            <Text style={[styles.shareUserHint, { color: theme.mutedText }]}>
              Enter the email of an existing Trailbook user. Shared trips are read-only for them.
            </Text>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!sharingWithUser}
              keyboardType="email-address"
              onChangeText={setShareUserEmail}
              placeholder="user@example.com"
              placeholderTextColor={theme.mutedText}
              style={[
                styles.editInput,
                { borderColor: theme.border, color: theme.primaryText },
              ]}
              value={shareUserEmail}
            />
            <View style={styles.editActions}>
              <Pressable
                disabled={sharingWithUser}
                onPress={() => setShareUserVisible(false)}
                style={[styles.editButton, { backgroundColor: theme.accentMuted }]}
              >
                <Text style={[styles.editCancelText, { color: theme.primaryText }]}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={sharingWithUser}
                onPress={() => void onShareWithUser()}
                style={[
                  styles.editButton,
                  { backgroundColor: theme.accent, opacity: sharingWithUser ? 0.65 : 1 },
                ]}
              >
                {sharingWithUser ? (
                  <ActivityIndicator color={theme.card} size="small" />
                ) : (
                  <Text style={[styles.editSaveText, { color: theme.card }]}>Share</Text>
                )}
              </Pressable>
            </View>
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(20, 28, 20, 0.34)',
  },
  processingCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
  },
  processingTitle: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  processingText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },

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
  sheetDescription: { fontSize: 14, lineHeight: 20, marginBottom: 2 },
  sharedByText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 2,
    textTransform: 'uppercase',
  },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Edit dialog
  editOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(20, 28, 20, 0.36)',
  },
  editBackdrop: { ...StyleSheet.absoluteFillObject },
  editCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(235, 225, 207, 0.92)',
    padding: 18,
    gap: 12,
    shadowColor: '#142014',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  editTitle: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  shareUserHint: { fontSize: 14, lineHeight: 20, marginBottom: 2 },
  editInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  editDescriptionInput: {
    minHeight: 104,
    fontWeight: '500',
    lineHeight: 20,
  },
  editActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  editButton: {
    minWidth: 96,
    minHeight: 46,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  editCancelText: { fontSize: 14, fontWeight: '800' },
  editSaveText: { fontSize: 14, fontWeight: '800' },

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
