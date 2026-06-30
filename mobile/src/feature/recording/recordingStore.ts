import { create } from 'zustand';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Application from 'expo-application';
import type { Trip } from '@/core/domain/model/trip';
import type { Waypoint } from '@/core/domain/model/waypoint';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { randomUuid } from '@/core/common/uuid';
import * as tripDao from '@/core/data/local/tripDao';
import * as captureMetaDao from '@/core/data/local/captureMetaDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import * as rawDeviceDao from '@/core/data/local/rawDeviceDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import { sampleDeviceState } from '@/core/data/devicestate/deviceStateSampler';
import {
  setActiveRecordingTripId,
  clearActiveRecordingTripId,
  getActiveRecordingTripId,
} from '@/core/data/location/activeTripStore';
import {
  startLocationTask,
  stopLocationTask,
} from '@/core/data/location/locationTask';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { dbEvents } from '@/core/db/events';
import { process, CURRENT_PROCESSING_VERSION } from '@/core/domain/processing';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { uploadTrip } from '@/core/domain/usecase/UploadTripUseCase';
import { buildActivitySampleFromSpeed } from '@/core/data/activity/activitySampler';

const DEMO_TRIP_LIMIT = 3;
const DEVICE_SAMPLE_INTERVAL_MS = 60_000;

async function sampleDevice(tripId: string): Promise<void> {
  const deviceSample = await sampleDeviceState(tripId);
  await rawDeviceDao.insert(deviceSample);
}

function startDeviceSampleInterval(tripId: string) {
  if (deviceSampleInterval) {
    clearInterval(deviceSampleInterval);
  }
  deviceSampleInterval = setInterval(() => {
    sampleDevice(tripId).catch((error) => {
      console.error('[RecordingStore] device sample failed', error);
    });
  }, DEVICE_SAMPLE_INTERVAL_MS);
}

function stopDeviceSampleInterval() {
  if (!deviceSampleInterval) return;
  clearInterval(deviceSampleInterval);
  deviceSampleInterval = null;
}

async function requireRecordingLocationPermissions(): Promise<Result<void>> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    return err('Location permission denied.');
  }

  // Android keeps a user-initiated location foreground service running with
  // while-in-use permission. Only iOS requires Always permission for this flow.
  if (Platform.OS === 'android') {
    return ok(undefined);
  }

  const backgroundAvailable = await Location.isBackgroundLocationAvailableAsync();
  if (!backgroundAvailable) {
    return err('Background location is unavailable in this build.');
  }

  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    background = await Location.requestBackgroundPermissionsAsync();
  }
  if (!background.granted) {
    return err('Always allow location access is required for trip recording.');
  }

  return ok(undefined);
}

async function deleteIncompleteTrip(tripId: string) {
  await rawSessionEventDao.deleteForTrip(tripId);
  await rawDeviceDao.deleteForTrip(tripId);
  await rawLocationDao.deleteForTrip(tripId);
  await rawActivityDao.deleteForTrip(tripId);
  await displayRoutePointDao.deleteForTrip(tripId);
  await captureMetaDao.deleteForTrip(tripId);
  await tripDao.deleteByClientId(tripId);
}

function osApiLevel(): number {
  if (Platform.OS === 'android') {
    return typeof Platform.Version === 'number' ? Platform.Version : 0;
  }
  const v = typeof Platform.Version === 'string' ? Platform.Version : '0';
  return parseInt(v.split('.')[0] ?? '0', 10);
}

export interface LatLng { latitude: number; longitude: number }

export interface ActiveWaypoint extends Waypoint {
  firstImageUri: string | null;
}

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  activeTrip: Trip | null;
  locationCount: number;
  liveCoordinates: LatLng[];
  activeWaypoints: ActiveWaypoint[];
  error: string | null;
}

interface RecordingActions {
  init(): Promise<void>;
  startRecording(title: string, description: string | null): Promise<Result<void>>;
  pauseRecording(): Promise<Result<void>>;
  resumeRecording(): Promise<Result<void>>;
  stopRecording(): Promise<Result<void>>;
  refreshLiveData(tripId: string): Promise<void>;
  clearError(): void;
}

let deviceSampleInterval: ReturnType<typeof setInterval> | null = null;
let rawDataHandler: (() => void) | null = null;
let waypointsHandler: (() => void) | null = null;
let iosForegroundLocationSubscription: Location.LocationSubscription | null = null;

async function stopIosForegroundLocationWatch(tripId: string | null): Promise<void> {
  if (!iosForegroundLocationSubscription) {
    return;
  }

  iosForegroundLocationSubscription.remove();
  iosForegroundLocationSubscription = null;

  if (tripId) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'FOREGROUND_LOCATION_WATCH_STOPPED',
    });
  }
}

async function startIosForegroundLocationWatch(tripId: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  await stopIosForegroundLocationWatch(tripId);

  const options: Location.LocationOptions = {
    accuracy: Location.Accuracy.High,
    distanceInterval: 5,
    timeInterval: 3000,
  };

  await rawSessionEventDao.insert({
    tripId,
    timestamp: new Date(),
    type: 'FOREGROUND_LOCATION_WATCH_START_REQUESTED',
    payload: options,
  });

  try {
    iosForegroundLocationSubscription = await Location.watchPositionAsync(
      options,
      async (location) => {
        const timestamp = new Date(location.timestamp);

        await rawLocationDao.insert({
          tripId,
          timestamp,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyM: location.coords.accuracy != null && location.coords.accuracy >= 0 ? location.coords.accuracy : undefined,
          altitudeM: location.coords.altitude != null && location.coords.altitude > -999 ? location.coords.altitude : undefined,
          speedMps: location.coords.speed != null && location.coords.speed >= 0 ? location.coords.speed : undefined,
          bearingDeg: location.coords.heading != null && location.coords.heading >= 0 ? location.coords.heading : undefined,
          provider: 'foreground-watch',
        });

        const activitySample = buildActivitySampleFromSpeed(tripId, location.coords.speed, timestamp);
        await rawActivityDao.insert(activitySample);
        dbEvents.emit('rawData:changed');
      },
      (reason) => {
        rawSessionEventDao.insert({
          tripId,
          timestamp: new Date(),
          type: 'FOREGROUND_LOCATION_CALLBACK_FAILED',
          payload: { reason },
        }).catch((error) => {
          console.error('[RecordingStore] failed to persist foreground location error', error);
        });
      },
    );

    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'FOREGROUND_LOCATION_WATCH_START_SUCCEEDED',
      payload: options,
    });
  } catch (error) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'FOREGROUND_LOCATION_WATCH_START_FAILED',
      payload: {
        error: error instanceof Error ? error.message : String(error),
        options,
      },
    });
  }
}

async function startLocationCapture(tripId: string): Promise<void> {
  if (Platform.OS === 'ios') {
    await startIosForegroundLocationWatch(tripId);
    return;
  }

  await startLocationTask();
}

async function stopLocationCapture(tripId: string): Promise<void> {
  if (Platform.OS === 'ios') {
    await stopIosForegroundLocationWatch(tripId);
    return;
  }

  await stopLocationTask();
}

function subscribeToLiveUpdates(tripId: string) {
  rawDataHandler = () => {
    rawLocationDao.getAllForTrip(tripId).then((locs) => {
      useRecordingStore.setState({
        liveCoordinates: locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
        locationCount: locs.length,
      });
    });
  };
  waypointsHandler = () => {
    waypointDao.getForTrip(tripId).then(async (wps) => {
      const withImages: ActiveWaypoint[] = await Promise.all(
        wps.map(async (w) => {
          const imgs = await waypointImageDao.getForWaypoint(w.id);
          return { ...w, firstImageUri: imgs[0]?.localUri ?? null };
        }),
      );
      useRecordingStore.setState({ activeWaypoints: withImages });
    });
  };
  dbEvents.on('rawData:changed', rawDataHandler);
  dbEvents.on('waypoints:changed', waypointsHandler);
}

function unsubscribeFromLiveUpdates() {
  if (rawDataHandler) { dbEvents.off('rawData:changed', rawDataHandler); rawDataHandler = null; }
  if (waypointsHandler) { dbEvents.off('waypoints:changed', waypointsHandler); waypointsHandler = null; }
}

export const useRecordingStore = create<RecordingState & RecordingActions>((set, get) => ({
  isRecording: false,
  isPaused: false,
  activeTrip: null,
  locationCount: 0,
  liveCoordinates: [],
  activeWaypoints: [],
  error: null,

  async init() {
    const tripId = await getActiveRecordingTripId();
    if (!tripId) return;

    const trip = await tripDao.getTripByClientId(tripId);
    if (!trip) {
      // Process death
      await rawSessionEventDao.insert({ tripId, timestamp: new Date(), type: 'PROCESS_DEATH_RECOVERED' });
      await tripDao.updateEndedAt(tripId, new Date());
      await clearActiveRecordingTripId();
      set({ isRecording: false, activeTrip: null });
      dbEvents.emit('trips:changed');
      return;
    }

    const [locs, wps] = await Promise.all([
      rawLocationDao.getAllForTrip(tripId),
      waypointDao.getForTrip(tripId),
    ]);
    const activeWaypoints: ActiveWaypoint[] = await Promise.all(
      wps.map(async (w) => {
        const imgs = await waypointImageDao.getForWaypoint(w.id);
        return { ...w, firstImageUri: imgs[0]?.localUri ?? null };
      }),
    );
    set({
      isRecording: true,
      activeTrip: trip,
      locationCount: locs.length,
      liveCoordinates: locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
      activeWaypoints,
    });
    subscribeToLiveUpdates(tripId);
    await startLocationCapture(tripId);
    startDeviceSampleInterval(tripId);
  },

  async startRecording(title, description) {
    try {
      const isDemo = await authRepository.isDemo();
      if (isDemo) {
        const ids = await tripDao.getAllCompletedClientIds();
        if (ids.length >= DEMO_TRIP_LIMIT) return err('DEMO_LIMIT_REACHED');
      }

      const permissionResult = await requireRecordingLocationPermissions();
      if (!permissionResult.ok) return permissionResult;

      const clientTripId = randomUuid();
      const now = new Date();

      await tripDao.insertTrip({
        clientTripId, title, description,
        startedAt: now, endedAt: null, status: 'RECORDING',
        processingVersion: 0, syncState: 'PENDING',
      });

      await captureMetaDao.insert({
        tripId: clientTripId,
        captureSchemaVersion: 1,
        appVersion: Application.nativeApplicationVersion ?? '1.0.0',
        osApiLevel: osApiLevel(),
        deviceModel: (Platform.constants as Record<string, unknown>)['Model'] as string ?? Platform.OS,
        captureTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      await rawSessionEventDao.insert({ tripId: clientTripId, timestamp: now, type: 'RECORDING_STARTED' });
      await setActiveRecordingTripId(clientTripId);
      await rawDeviceDao.insert(await sampleDeviceState(clientTripId));
      try {
        await startLocationCapture(clientTripId);
        await sampleDevice(clientTripId);
      } catch (locErr) {
        await stopLocationCapture(clientTripId).catch(() => {});
        await clearActiveRecordingTripId();
        await deleteIncompleteTrip(clientTripId);
        throw new Error(
          `Unable to start location capture: ${
            locErr instanceof Error ? locErr.message : String(locErr)
          }`,
        );
      }

      subscribeToLiveUpdates(clientTripId);

      startDeviceSampleInterval(clientTripId);

      const fullTrip = await tripDao.getTripByClientId(clientTripId);
      set({ isRecording: true, activeTrip: fullTrip, locationCount: 0, liveCoordinates: [], activeWaypoints: [], error: null });
      dbEvents.emit('trips:changed');

      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      return err(message);
    }
  },

  async pauseRecording() {
    const { activeTrip, isPaused } = get();
    if (!activeTrip || isPaused) return err('Nothing to pause');

    try {
      await stopLocationCapture(activeTrip.clientTripId);
      stopDeviceSampleInterval();
      await rawSessionEventDao.insert({ tripId: activeTrip.clientTripId, timestamp: new Date(), type: 'RECORDING_PAUSED' });
      await tripDao.updateStatus(activeTrip.clientTripId, 'PAUSED');
      set({ isPaused: true });
      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      return err(message);
    }
  },

  async resumeRecording() {
    const { activeTrip, isPaused } = get();
    if (!activeTrip || !isPaused) return err('Nothing to resume');

    try {
      const permissionResult = await requireRecordingLocationPermissions();
      if (!permissionResult.ok) return permissionResult;
      await startLocationCapture(activeTrip.clientTripId);
      await rawSessionEventDao.insert({ tripId: activeTrip.clientTripId, timestamp: new Date(), type: 'RECORDING_RESUMED' });
      await tripDao.updateStatus(activeTrip.clientTripId, 'RECORDING');
      startDeviceSampleInterval(activeTrip.clientTripId);
      set({ isPaused: false });
      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      return err(message);
    }
  },

  async stopRecording() {
    const { activeTrip } = get();
    if (!activeTrip) return err('No active trip');

    try {
      await stopLocationCapture(activeTrip.clientTripId);
      unsubscribeFromLiveUpdates();

      stopDeviceSampleInterval();

      const endedAt = new Date();
      await rawSessionEventDao.insert({ tripId: activeTrip.clientTripId, timestamp: endedAt, type: 'RECORDING_STOPPED' });
      await tripDao.updateEndedAt(activeTrip.clientTripId, endedAt);
      await clearActiveRecordingTripId();

      set({ isRecording: false, isPaused: false, activeTrip: null, locationCount: 0, liveCoordinates: [], activeWaypoints: [] });
      dbEvents.emit('trips:changed');

      const bundleResult = await rawCaptureRepository.getTripBundle(activeTrip.clientTripId);
      if (bundleResult.ok && bundleResult.value) {
        const segments = process(bundleResult.value, CURRENT_PROCESSING_VERSION);
        await tripRepository.replaceSegments(activeTrip.clientTripId, segments);
        await tripRepository.updateProcessingVersion(activeTrip.clientTripId, CURRENT_PROCESSING_VERSION);
      }

      // fire-and-forget: upload runs in foreground, failures retried by background task
      uploadTrip(activeTrip.clientTripId).catch(() => {});

      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      set({ error: message });
      return err(message);
    }
  },

  async refreshLiveData(tripId: string) {
    const [locs, wps] = await Promise.all([
      rawLocationDao.getAllForTrip(tripId),
      waypointDao.getForTrip(tripId),
    ]);
    const activeWaypoints: ActiveWaypoint[] = await Promise.all(
      wps.map(async (w) => {
        const imgs = await waypointImageDao.getForWaypoint(w.id);
        return { ...w, firstImageUri: imgs[0]?.localUri ?? null };
      }),
    );
    set({
      liveCoordinates: locs.map((l) => ({ latitude: l.latitude, longitude: l.longitude })),
      locationCount: locs.length,
      activeWaypoints,
    });
  },

  clearError() { set({ error: null }); },
}));
