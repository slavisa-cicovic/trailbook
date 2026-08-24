import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, Text, Pressable, StyleSheet } from 'react-native';
import MapView, { Polyline, Marker, type MapType, type Region, type UserLocationChangeEvent } from 'react-native-maps';
import { TrailMap } from '@/components/ui/TrailMap';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRecordingStore } from '@/feature/recording/recordingStore';
import { useAuthStore } from '@/feature/auth/authStore';
import { StartTripSheet } from './components/StartTripSheet';
import { AddWaypointSheet } from './components/AddWaypointSheet';
import { deleteWaypoint } from '@/core/domain/usecase/DeleteWaypointUseCase';
import { addPhotoToWaypoint } from '@/core/domain/usecase/AddPhotoToWaypointUseCase';
import * as ImagePicker from 'expo-image-picker';
import BottomSheetModal from '@/components/ui/bottom-sheet-modal';
import { BottomNav } from '@/components/ui/BottomNav';
import { TopAppBar } from '@/components/ui/TopAppBar';
import { SessionCard } from './components/SessionCard';
import { WaypointCard } from './components/WaypointCard';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useCustomAlert } from '@/components/ui/custom-alert-dialog';
import {
  accessErrorMessage,
  authorizeTripPhotos,
  isPremiumAccessError,
} from '@/core/domain/access/mobileAccessPolicy';


export default function RecordingScreen() {
  const [showStartSheet, setShowStartSheet] = useState(false);
  const [showWaypointSheet, setShowWaypointSheet] = useState(false);
  const [showSessionSheet, setShowSessionSheet] = useState(false);
  const [stoppingTrip, setStoppingTrip] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [mapType, setMapType] = useState<MapType>('standard');
  const [lastPointTime, setLastPointTime] = useState<Date | null>(null);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);
  const mapRef = useRef<MapView>(null);

  const isRecording = useRecordingStore((s) => s.isRecording);
  const isPaused = useRecordingStore((s) => s.isPaused);
  const activeTrip = useRecordingStore((s) => s.activeTrip);
  const locationCount = useRecordingStore((s) => s.locationCount);
  const liveCoordinates = useRecordingStore((s) => s.liveCoordinates);
  const activeWaypoints = useRecordingStore((s) => s.activeWaypoints);
  const stopRecording = useRecordingStore((s) => s.stopRecording);
  const pauseRecording = useRecordingStore((s) => s.pauseRecording);
  const resumeRecording = useRecordingStore((s) => s.resumeRecording);
  const captureHealth = useRecordingStore((s) => s.captureHealth);
  const lastLocationAt = useRecordingStore((s) => s.lastLocationAt);
  const recoverLocationCapture = useRecordingStore((s) => s.recoverLocationCapture);

  const displayName = useAuthStore((s) => s.displayName);
  const { theme } = useAppTheme();
  const { showAlert } = useCustomAlert();
  const router = useRouter();

  function showAccessAlert(error: string) {
    const message = accessErrorMessage(error);
    showAlert({
      title: 'Trailbook Premium',
      message,
      buttons: isPremiumAccessError(error)
        ? [
            { text: 'Not now', style: 'cancel' },
            { text: 'View Premium', onPress: () => router.push('/premium') },
          ]
        : undefined,
    });
  }

  const focusMapOnRegion = useCallback((region: Region, animated = true) => {
    setInitialRegion(region);
    if (animated) {
      mapRef.current?.animateToRegion(region, 350);
    }
  }, []);

  useEffect(() => {
    Location.getLastKnownPositionAsync().then((pos) => {
      if (pos) {
        focusMapOnRegion({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        }, false);
      }
    }).catch(() => {});
  }, [focusMapOnRegion]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') {
        return;
      }

      let cancelled = false;

      async function refreshAndroidMapRegion() {
        const lastRoutePoint = liveCoordinates.at(-1);
        if (lastRoutePoint) {
          focusMapOnRegion({
            latitude: lastRoutePoint.latitude,
            longitude: lastRoutePoint.longitude,
            latitudeDelta: 0.012,
            longitudeDelta: 0.012,
          });
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
        if (cancelled || !lastKnown) {
          return;
        }

        focusMapOnRegion({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        });
      }

      void refreshAndroidMapRegion();

      return () => {
        cancelled = true;
      };
    }, [focusMapOnRegion, liveCoordinates]),
  );

  function handleUserLocationChange(event: UserLocationChangeEvent) {
    const coordinate = event.nativeEvent.coordinate;
    if (!coordinate) {
      return;
    }

    if (!initialRegion) {
      const nextRegion = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
      focusMapOnRegion(nextRegion);
    }
  }

  useEffect(() => {
    setLastPointTime(lastLocationAt);
  }, [lastLocationAt]);

  async function onStopPress() {
    setShowSessionSheet(false);
    setStoppingTrip(true);
    await stopRecording();
    setStoppingTrip(false);
  }

  async function onAddPhotoToWaypoint(waypointId: string) {
    if (!activeTrip) return;
    const access = await authorizeTripPhotos(activeTrip.clientTripId, 1);
    if (!access.ok) {
      showAccessAlert(access.error);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (!result.canceled && result.assets[0]) {
      const saved = await addPhotoToWaypoint(
        waypointId,
        result.assets[0].uri,
        'GALLERY',
        null,
      );
      if (!saved.ok) {
        showAccessAlert(saved.error);
      }
    }
  }

  async function onRemoveWaypoint(waypointId: string) {
    await deleteWaypoint(waypointId);
  }

  async function onPauseResumePress() {
    setTogglingPause(true);
    if (isPaused) await resumeRecording();
    else await pauseRecording();
    setTogglingPause(false);
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} edges={['top', 'left', 'right']}>
      <TopAppBar title="Trailbook" />

      <View style={[styles.mapCard, { backgroundColor: theme.accentMuted }]}>
        <TrailMap
          ref={mapRef}
          mapType={mapType}
          onMapTypeChange={setMapType}
          switcherPosition="top-left"
          initialRegion={initialRegion}
          showsUserLocation
          followsUserLocation={isRecording}
          showsMyLocationButton={false}
          showsCompass={false}
          onUserLocationChange={handleUserLocationChange}
        >
          {liveCoordinates.length > 1 && (
            <Polyline coordinates={liveCoordinates} strokeColor={theme.accent} strokeWidth={4} />
          )}
          {activeWaypoints.map((w) => (
            <Marker
              key={w.id}
              coordinate={{ latitude: w.latitude, longitude: w.longitude }}
              title={w.title}
              pinColor={theme.accent}
            />
          ))}
        </TrailMap>

        <SessionCard
          isRecording={isRecording}
          isPaused={isPaused}
          trip={activeTrip}
          stoppingTrip={stoppingTrip}
          onStartPress={() => setShowStartSheet(true)}
          onStopPress={onStopPress}
          onResumePress={() => void onPauseResumePress()}
          onDetailsPress={() => setShowSessionSheet(true)}
        />
        {isRecording && !isPaused && captureHealth !== 'healthy' ? (
          <View style={[styles.healthBanner, { backgroundColor: theme.card }]}>
            <Text style={[styles.healthText, { color: theme.primaryText }]}>
              {captureHealthMessage(captureHealth)}
            </Text>
            {(captureHealth === 'delayed' || captureHealth === 'stopped') ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void recoverLocationCapture()}
                style={[styles.healthAction, { backgroundColor: theme.accent }]}
              >
                <Text style={{ color: theme.background, fontWeight: '700' }}>Restart capture</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <BottomNav />

      <StartTripSheet visible={showStartSheet} onDismiss={() => setShowStartSheet(false)} />

      {activeTrip && (
        <AddWaypointSheet
          tripId={activeTrip.clientTripId}
          visible={showWaypointSheet}
          onDismiss={() => setShowWaypointSheet(false)}
        />
      )}

      <BottomSheetModal
        visible={showSessionSheet}
        onClose={() => setShowSessionSheet(false)}
        title="Current session"
      >
        <View style={[styles.infoCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.infoRow, { color: theme.primaryText }]}>
            <Text style={{ color: theme.mutedText }}>Active user: </Text>
            <Text style={{ fontWeight: '500' }}>{displayName ?? '—'}</Text>
          </Text>
          <Text style={[styles.infoRow, { color: theme.primaryText }]}>
            <Text style={{ color: theme.mutedText }}>Capture health: </Text>
            <Text style={{ fontWeight: '500' }}>{captureHealth}</Text>
          </Text>
          <Text style={[styles.infoRow, { color: theme.primaryText }]}>
            <Text style={{ color: theme.mutedText }}>Route: </Text>
            <Text style={{ fontWeight: '500' }}>{activeTrip?.title ?? '—'}</Text>
          </Text>
          <Text style={[styles.infoRow, { color: theme.primaryText }]}>
            <Text style={{ color: theme.mutedText }}>Last point: </Text>
            <Text style={{ fontWeight: '500' }}>
              {lastPointTime ? lastPointTime.toISOString() : '—'}
            </Text>
          </Text>
          <Text style={[styles.infoRow, { color: theme.primaryText }]}>
            <Text style={{ color: theme.mutedText }}>GPS points: </Text>
            <Text style={{ fontWeight: '500' }}>{locationCount}</Text>
          </Text>

          <View style={styles.sessionActions}>
            <Pressable
              style={[styles.pauseBtn, { backgroundColor: theme.dangerMuted }]}
              onPress={() => void onPauseResumePress()}
              disabled={togglingPause}
            >
              <Text style={[styles.pauseBtnText, { color: theme.danger }]}>{isPaused ? 'Resume' : 'Pause'}</Text>
            </Pressable>
            <Pressable
              style={[styles.addWaypointBtn, { backgroundColor: theme.accent }]}
              onPress={() => { setShowSessionSheet(false); setShowWaypointSheet(true); }}
            >
              <Text style={[styles.addWaypointText, { color: theme.background }]}>Add waypoint</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.recentCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.recentTitle, { color: theme.primaryText }]}>Recent waypoints</Text>
          {activeWaypoints.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.mutedText }]}>No waypoints on this route yet.</Text>
          ) : (
            activeWaypoints.slice().reverse().map((w) => (
              <WaypointCard
                key={w.id}
                waypoint={w}
                onAddPhoto={() => void onAddPhotoToWaypoint(w.id)}
                onRemove={() => void onRemoveWaypoint(w.id)}
              />
            ))
          )}
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  mapCard: { flex: 1, marginHorizontal: 12, borderRadius: 28, overflow: 'hidden' },
  healthBanner: { position: 'absolute', left: 12, right: 12, top: 58, borderRadius: 14, padding: 12, gap: 8 },
  healthText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  healthAction: { alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },

  infoCard: { borderRadius: 18, padding: 16, gap: 8 },
  infoRow: { fontSize: 14, lineHeight: 20 },
  sessionActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  pauseBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  pauseBtnText: { fontWeight: '700', fontSize: 14 },
  addWaypointBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24 },
  addWaypointText: { fontWeight: '700', fontSize: 14 },

  recentCard: { borderRadius: 18, padding: 16, marginTop: 12 },
  recentTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  emptyText: { fontSize: 14 },
});

function captureHealthMessage(health: string): string {
  if (health === 'starting') return 'Location capture is starting. Waiting for the first GPS point.';
  if (health === 'inaccurate') return 'Location updates are arriving, but GPS quality is too low or inconsistent to build a route. Move to open sky and check precise location settings.';
  if (health === 'delayed') return 'No recent GPS point. The phone may be stationary or Android may be delaying capture.';
  if (health === 'stopped') return 'Location capture appears to have stopped. Restart it before continuing.';
  return 'Location capture status is unavailable.';
}
