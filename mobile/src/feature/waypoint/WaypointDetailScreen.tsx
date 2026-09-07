import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, Image, Pressable, StyleSheet,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useWaypointDetailStore } from '@/feature/waypoint/waypointDetailStore';
import { EditWaypointSheet } from './components/EditWaypointSheet';
import { addPhotoToWaypoint } from '@/core/domain/usecase/AddPhotoToWaypointUseCase';
import { TrailMap } from '@/components/ui/TrailMap';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { useAppTheme } from '@/hooks/useAppTheme';
import { CATEGORY_ICON } from '@/constants/waypointCategories';
import * as waypointDao from '@/core/data/local/waypointDao';
import { useTripsStore } from '@/feature/trips/tripsStore';
import { useTripGroupsStore } from '@/feature/trips/tripGroupsStore';
import {
  normalizeGroupTripSort,
  sortGroupTrips,
  type GroupTripSort,
} from '@/feature/trips/groupNavigation';
import { savePhotoNavigationContext, type PhotoViewerItem } from './photoNavigationContext';
import { getTripNavigationContext } from '@/feature/trips/tripNavigationContext';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import {
  accessErrorMessage,
  authorizeTripPhotos,
  isPremiumAccessError,
} from '@/core/domain/access/mobileAccessPolicy';
import { buildDisplayRouteCoordinateGroups } from '@/core/domain/processing/displayRouteBuilder';
import { useTripDetailStore } from '@/feature/trips/tripDetailStore';
import { useI18n } from '@/i18n/i18nStore';
import { capturedAtFromImageAsset, coordinatesFromImageAsset } from '@/core/domain/photo/photoLocation';
import { PhotoVerificationIndicator } from './components/PhotoVerificationIndicator';

const SCREEN_WIDTH = Dimensions.get('window').width;
const PHOTO_HEIGHT = Math.round(SCREEN_WIDTH * 0.65);

export default function WaypointDetailScreen({ source = 'local' }: { source?: 'local' | 'shared' }) {
  const readOnly = source === 'shared';
  const { waypointId, clientTripId, groupId, groupSort: groupSortParam, tripContextId } = useLocalSearchParams<{
    waypointId: string;
    clientTripId?: string;
    groupId?: string;
    groupSort?: GroupTripSort;
    tripContextId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const { locale, t } = useI18n();
  const mapRef = useRef<MapView>(null);
  const fittedRouteTripIdRef = useRef<string | null>(null);

  function showAccessAlert(error: string) {
    showAlert({
      title: 'Trailbook Premium',
      message: accessErrorMessage(error),
      buttons: isPremiumAccessError(error)
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'View Premium', onPress: () => router.push('/premium') },
          ]
        : undefined,
    });
  }

  const load = useWaypointDetailStore((s) => s.load);
  const reload = useWaypointDetailStore((s) => s.reload);
  const reset = useWaypointDetailStore((s) => s.reset);
  const [currentWaypointId, setCurrentWaypointId] = useState(waypointId);
  const localWaypoint = useWaypointDetailStore((s) => s.waypoint);
  const localImages = useWaypointDetailStore((s) => s.images);
  const localRoutePoints = useWaypointDetailStore((s) => s.routePoints);
  const localLoading = useWaypointDetailStore((s) => s.loading);
  const localError = useWaypointDetailStore((s) => s.error);
  const sharedTrip = useTripDetailStore((s) => s.trip);
  const sharedWaypoints = useTripDetailStore((s) => s.waypoints);
  const sharedImagesByWaypoint = useTripDetailStore((s) => s.imagesByWaypoint);
  const sharedRoutePoints = useTripDetailStore((s) => s.routePoints);
  const sharedLoading = useTripDetailStore((s) => s.loading);
  const sharedError = useTripDetailStore((s) => s.error);
  const loadShared = useTripDetailStore((s) => s.loadShared);
  const waypoint = readOnly
    ? sharedWaypoints.find((item) => item.id === currentWaypointId)
    : localWaypoint;
  const images = readOnly && waypoint
    ? sharedImagesByWaypoint[waypoint.id] ?? []
    : localImages;
  const routePoints = readOnly ? sharedRoutePoints : localRoutePoints;
  const loading = readOnly ? sharedLoading : localLoading;
  const error = readOnly ? sharedError : localError;
  const trips = useTripsStore((s) => s.trips);
  const loadTrips = useTripsStore((s) => s.load);
  const groups = useTripGroupsStore((s) => s.groups);
  const loadGroups = useTripGroupsStore((s) => s.load);

  const [showEditSheet, setShowEditSheet] = useState(false);
  const [tripTitle, setTripTitle] = useState<string | null>(null);
  const groupSort = normalizeGroupTripSort(groupSortParam);
  const activeGroupId = Array.isArray(groupId) ? groupId[0] : groupId;
  const tripsById = useMemo(
    () => new Map(trips.map((item) => [item.trip.clientTripId, item])),
    [trips],
  );
  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((item) => item.group.id === activeGroupId) : undefined),
    [activeGroupId, groups],
  );
  const groupTrips = useMemo(
    () => (activeGroup ? sortGroupTrips(activeGroup, tripsById, groupSort) : []),
    [activeGroup, groupSort, tripsById],
  );
  const activeTripContextId = Array.isArray(tripContextId) ? tripContextId[0] : tripContextId;
  const contextTripIds = useMemo(() => {
    if (!activeGroupId) return waypoint ? [waypoint.tripId] : [];
    if (activeGroup) return groupTrips.map((item) => item.trip.clientTripId);
    const saved = getTripNavigationContext(activeTripContextId);
    if (saved) return saved;
    return waypoint ? [waypoint.tripId] : [];
  }, [activeGroup, activeGroupId, activeTripContextId, groupTrips, waypoint]);
  const [contextWaypoints, setContextWaypoints] = useState<Array<{ id: string; tripId: string }>>([]);

  useEffect(() => {
    setCurrentWaypointId(waypointId);
  }, [waypointId]);

  useEffect(() => {
    if (readOnly) {
      if (clientTripId && sharedTrip?.clientTripId !== clientTripId) loadShared(clientTripId);
      return;
    }
    if (currentWaypointId) void load(currentWaypointId);
    if (activeGroupId) {
      loadTrips();
      loadGroups();
    }
  }, [activeGroupId, clientTripId, currentWaypointId, load, loadGroups, loadShared, loadTrips, readOnly, sharedTrip?.clientTripId]);

  useEffect(() => {
    if (readOnly) return;
    return () => reset();
  }, [readOnly, reset]);

  const routeCoordinateGroups = useMemo(
    () => buildDisplayRouteCoordinateGroups(routePoints),
    [routePoints],
  );
  const routeCoordinates = useMemo(() => routeCoordinateGroups.flat(), [routeCoordinateGroups]);

  useEffect(() => {
    let cancelled = false;
    async function loadTripTitle() {
      if (readOnly) {
        setTripTitle(sharedTrip?.title ?? null);
        return;
      }
      if (!waypoint) {
        setTripTitle(null);
        return;
      }
      const trip = await tripDao.getTripByClientId(waypoint.tripId);
      if (!cancelled) setTripTitle(trip?.title ?? null);
    }
    void loadTripTitle();
    return () => {
      cancelled = true;
    };
  }, [readOnly, sharedTrip?.title, waypoint]);

  useEffect(() => {
    let cancelled = false;
    async function loadContextWaypoints() {
      if (readOnly) {
        setContextWaypoints(
          [...sharedWaypoints]
            .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
            .map((item) => ({ id: item.id, tripId: item.tripId })),
        );
        return;
      }
      if (contextTripIds.length === 0) {
        setContextWaypoints([]);
        return;
      }
      const waypointGroups = await Promise.all(contextTripIds.map((tripId) => waypointDao.getForTrip(tripId)));
      if (cancelled) return;
      setContextWaypoints(
        waypointGroups
          .flat()
          .sort((left, right) => {
            const tripDelta = contextTripIds.indexOf(left.tripId) - contextTripIds.indexOf(right.tripId);
            if (tripDelta !== 0) return tripDelta;
            return left.createdAt.getTime() - right.createdAt.getTime();
          })
          .map((item) => ({ id: item.id, tripId: item.tripId })),
      );
    }

    void loadContextWaypoints();
    return () => {
      cancelled = true;
    };
  }, [contextTripIds, readOnly, sharedWaypoints]);

  useEffect(() => {
    if (!waypoint || !mapRef.current) return;
    if (fittedRouteTripIdRef.current === waypoint.tripId) return;

    const coordinates = routeCoordinates.length > 1
      ? routeCoordinates
      : [{ latitude: waypoint.latitude, longitude: waypoint.longitude }];

    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 28, right: 28, bottom: 28, left: 28 },
        animated: false,
      });
      fittedRouteTripIdRef.current = waypoint.tripId;
    }, 300);
  }, [routeCoordinates, waypoint]);

  function navigateTo(id: string) {
    setCurrentWaypointId(id);
  }

  async function buildPhotoContext(): Promise<PhotoViewerItem[]> {
    if (!waypoint) return [];
    if (readOnly && sharedTrip) {
      return sharedWaypoints.flatMap((sharedWaypoint) =>
        (sharedImagesByWaypoint[sharedWaypoint.id] ?? []).map((image) => ({
          ...image,
          readOnly: true,
          routeCoordinateGroups,
          tripTitle: sharedTrip.title,
          waypointCoordinate: {
            latitude: sharedWaypoint.latitude,
            longitude: sharedWaypoint.longitude,
          },
          waypointCreatedAt: sharedWaypoint.createdAt,
          waypointTitle: sharedWaypoint.title,
        })),
      );
    }
    const photoTripIds = contextTripIds.length > 0 ? contextTripIds : [waypoint.tripId];
    const items: PhotoViewerItem[] = [];

    for (const tripId of photoTripIds) {
      const [trip, tripWaypoints, routePoints] = await Promise.all([
        tripDao.getTripByClientId(tripId),
        waypointDao.getForTrip(tripId),
        displayRoutePointDao.getForTrip(tripId),
      ]);
      if (!trip) continue;

      const routeCoordinateGroups = buildDisplayRouteCoordinateGroups(routePoints);
      const sortedWaypoints = tripWaypoints.sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );

      for (const tripWaypoint of sortedWaypoints) {
        const waypointImages = await waypointImageDao.getForWaypoint(tripWaypoint.id);
        for (const image of waypointImages) {
          items.push({
            ...image,
            routeCoordinateGroups,
            tripTitle: trip.title,
            waypointCoordinate: {
              latitude: tripWaypoint.latitude,
              longitude: tripWaypoint.longitude,
            },
            waypointCreatedAt: tripWaypoint.createdAt,
            waypointTitle: tripWaypoint.title,
          });
        }
      }
    }

    return items;
  }

  async function openPhoto(imageId: string) {
    const contextItems = await buildPhotoContext();
    const contextId = savePhotoNavigationContext(contextItems);
    router.push(`/waypoint/${waypoint!.id}/photo/${imageId}?photoContextId=${contextId}`);
  }

  async function onAddPhoto() {
    if (!waypoint) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 1,
      exif: true,
    });
    if (result.canceled) return;
    const access = await authorizeTripPhotos(waypoint.tripId, result.assets.length);
    if (!access.ok) {
      showAccessAlert(access.error);
      return;
    }
    for (const asset of result.assets) {
      const saved = await addPhotoToWaypoint(
        waypoint.id,
        asset.uri,
        'GALLERY',
        capturedAtFromImageAsset(asset),
        coordinatesFromImageAsset(asset),
      );
      if (!saved.ok) {
        showAccessAlert(saved.error);
        return;
      }
    }
    reload();
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!waypoint) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.mutedText }}>{error ?? 'Waypoint not found'}</Text>
        <Pressable onPress={() => router.back()} style={styles.notFoundBack}>
          <Text style={{ color: theme.accent }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const pillBottom = insets.bottom + 12;
  const currentWaypointIndex = waypoint
    ? contextWaypoints.findIndex((item) => item.id === waypoint.id)
    : -1;
  const contextPrevId = currentWaypointIndex > 0 ? contextWaypoints[currentWaypointIndex - 1].id : null;
  const contextNextId =
    currentWaypointIndex >= 0 && currentWaypointIndex < contextWaypoints.length - 1
      ? contextWaypoints[currentWaypointIndex + 1].id
      : null;
  const waypointCounterLabel =
    currentWaypointIndex >= 0 && contextWaypoints.length > 0
      ? `${waypoint.title} (${currentWaypointIndex + 1}/${contextWaypoints.length})`
      : waypoint.title;

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <TopAppBar onBack={() => router.back()} title="Waypoint" />
      {tripTitle ? (
        <View style={styles.tripHeading}>
          <Text style={[styles.tripTitle, { color: theme.primaryText }]} numberOfLines={1}>
            {tripTitle}
          </Text>
          <Text style={[styles.createdAt, { color: theme.mutedText }]}>
            {t('waypoint.createdAt')} {waypoint?.createdAt.toLocaleString(locale)}
          </Text>
        </View>
      ) : null}

      {/* Scrollable content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: pillBottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Photos section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: theme.primaryText }]}>Photos</Text>
          {!readOnly ? (
            <Pressable
              style={[styles.addPhotoBtn, { backgroundColor: theme.accentMuted }]}
              onPress={() => void onAddPhoto()}
            >
              <Text style={[styles.addPhotoBtnText, { color: theme.primaryText }]}>Add photo(s)</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.photoHint, { color: theme.mutedText }]}>
          Tap a photo to open full screen.
        </Text>

        {images.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoRail}
            style={styles.photoRailWrap}
            decelerationRate="fast"
            snapToInterval={SCREEN_WIDTH - 48}
            snapToAlignment="start"
          >
            {images.map((img) => (
              <Pressable
                key={img.id}
                onPress={() => void openPhoto(img.id)}
                style={styles.photoCard}
              >
                <Image
                  source={{ uri: img.localUri }}
                  style={[
                    styles.photo,
                    { backgroundColor: theme.accentMuted, height: PHOTO_HEIGHT },
                  ]}
                  resizeMode="cover"
                />
                <View style={styles.photoMetadata}>
                  <Text style={styles.photoCapturedAt} numberOfLines={1}>
                    {t('waypoint.photoTakenAt')} {img.capturedAt
                      ? img.capturedAt.toLocaleString(locale)
                      : t('waypoint.photoTimeUnknown')}
                  </Text>
                  <PhotoVerificationIndicator
                    capturedAt={img.capturedAt}
                    photoCoordinates={img.photoLatitude === null || img.photoLongitude === null ? null : {
                      latitude: img.photoLatitude,
                      longitude: img.photoLongitude,
                    }}
                    waypointCoordinates={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
                    waypointCreatedAt={waypoint.createdAt}
                  />
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.emptyPhotos, { backgroundColor: theme.accentMuted }]}>
            <MaterialIcons name="photo-camera" size={32} color={theme.mutedText} />
            <Text style={[styles.emptyPhotosText, { color: theme.mutedText }]}>No photos yet</Text>
          </View>
        )}

        <View style={[styles.miniMapCard, { backgroundColor: theme.card }]}>
          <TrailMap
            ref={mapRef}
            style={styles.miniMap}
            switcherPosition="none"
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            initialRegion={{
              latitude: waypoint.latitude,
              longitude: waypoint.longitude,
              latitudeDelta: 0.012,
              longitudeDelta: 0.012,
            }}
          >
            {routeCoordinateGroups.map((coordinates, index) => (
              <Polyline
                key={index}
                coordinates={coordinates}
                strokeColor={theme.accent}
                strokeWidth={4}
              />
            ))}
            <Marker
              coordinate={{ latitude: waypoint.latitude, longitude: waypoint.longitude }}
              pinColor={theme.accent}
            />
          </TrailMap>
        </View>
      </ScrollView>

      {/* Bottom pill */}
      <View
        pointerEvents="box-none"
        style={[styles.pillWrap, { bottom: pillBottom }]}
      >
        <View style={styles.pill}>
          <Pressable
            style={[styles.navBtn, !contextPrevId && styles.navBtnDisabled]}
            onPress={() => contextPrevId && navigateTo(contextPrevId)}
            disabled={!contextPrevId}
          >
            <MaterialIcons
              name="chevron-left"
              size={24}
              color={contextPrevId ? '#243224' : '#9aa596'}
            />
          </Pressable>

          <Pressable
            disabled={readOnly}
            style={styles.pillCenter}
            onPress={() => setShowEditSheet(true)}
          >
            <MaterialIcons name={CATEGORY_ICON[waypoint.category]} size={18} color={theme.accent} />
            <Text style={styles.pillTitle} numberOfLines={1}>{waypointCounterLabel}</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, !contextNextId && styles.navBtnDisabled]}
            onPress={() => contextNextId && navigateTo(contextNextId)}
            disabled={!contextNextId}
          >
            <MaterialIcons
              name="chevron-right"
              size={24}
              color={contextNextId ? '#243224' : '#9aa596'}
            />
          </Pressable>
        </View>
      </View>

      {!readOnly ? (
        <EditWaypointSheet
          waypoint={waypoint}
          visible={showEditSheet}
          onDismiss={() => setShowEditSheet(false)}
          onSaved={() => reload()}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundBack: { marginTop: 16, padding: 12 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tripTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  tripHeading: { paddingBottom: 14 },
  createdAt: { fontSize: 12, marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  addPhotoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addPhotoBtnText: { fontSize: 14, fontWeight: '600' },

  photoHint: { fontSize: 14, lineHeight: 20, marginBottom: 12 },

  photoRailWrap: { marginHorizontal: -20 },
  photoRail: { paddingHorizontal: 20, gap: 12 },
  photo: {
    width: SCREEN_WIDTH - 72,
    borderRadius: 24,
  },
  photoCard: { position: 'relative' },
  photoMetadata: { alignItems: 'center', bottom: 12, flexDirection: 'row', gap: 8, justifyContent: 'space-between', left: 12, position: 'absolute', right: 12 },
  photoCapturedAt: { backgroundColor: 'rgba(20,32,20,0.76)', borderRadius: 10, color: '#fffdf8', flexShrink: 1, fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },

  emptyPhotos: {
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  emptyPhotosText: { fontSize: 14 },

  miniMapCard: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 260,
    marginTop: 22,
  },
  miniMap: { flex: 1 },

  // Pill
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
  pillCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 10 },
  pillTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#243224' },
});
