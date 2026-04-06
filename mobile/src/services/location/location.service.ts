import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";

import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type { RecordingProfile } from "../../domain/trips";
import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "./background-location.constants";

export interface CurrentLocationSnapshot {
  accuracy: number | null;
  altitude: number | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed: number | null;
}

interface TrackingOptions {
  accuracy: Location.Accuracy;
  distanceInterval: number;
  timeInterval: number;
}

export function toSnapshot(location: Location.LocationObject): CurrentLocationSnapshot {
  return {
    accuracy: location.coords.accuracy ?? null,
    altitude: location.coords.altitude ?? null,
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    recordedAt: new Date(location.timestamp).toISOString(),
    speed: location.coords.speed ?? null,
  };
}

export async function requestForegroundLocationAccess(): Promise<boolean> {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.granted;
}

export async function requestBackgroundLocationAccess(): Promise<boolean> {
  const permission = await Location.requestBackgroundPermissionsAsync();
  return permission.granted;
}

export async function getBackgroundLocationAccess(): Promise<boolean> {
  const permission = await Location.getBackgroundPermissionsAsync();
  return permission.granted;
}

export async function isBackgroundLocationTrackingSupported(): Promise<boolean> {
  return TaskManager.isAvailableAsync();
}

export async function getCurrentForegroundLocation(): Promise<CurrentLocationSnapshot | null> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return toSnapshot(location);
}

export function getTrackingOptionsForProfile(profile: RecordingProfile): TrackingOptions {
  switch (profile) {
    case "walk_relaxed":
      return {
        accuracy: Location.Accuracy.Low,
        distanceInterval: 50,
        timeInterval: 10 * 60 * 1000,
      };
    case "city_walk":
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 5 * 60 * 1000,
      };
    case "drive_city":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 35,
        timeInterval: 2 * 60 * 1000,
      };
    case "drive_highway":
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 150,
        timeInterval: 3 * 60 * 1000,
      };
    case "frequent":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 60 * 1000,
      };
    case "auto":
    default:
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 25,
        timeInterval: 3 * 60 * 1000,
      };
  }
}

function getBackgroundActivityTypeForProfile(profile: RecordingProfile): Location.LocationActivityType {
  switch (profile) {
    case "drive_city":
    case "drive_highway":
      return Location.LocationActivityType.AutomotiveNavigation;
    case "walk_relaxed":
    case "city_walk":
    case "frequent":
    case "auto":
    default:
      return Location.LocationActivityType.Fitness;
  }
}

function buildBackgroundTrackingOptions(profile: RecordingProfile): Location.LocationTaskOptions {
  const trackingOptions = getTrackingOptionsForProfile(profile);

  return {
    ...trackingOptions,
    activityType: getBackgroundActivityTypeForProfile(profile),
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: "Trailbook recording",
      notificationBody: "Trailbook is recording your trip in the background.",
      notificationColor: "#243224",
      killServiceOnDestroy: false,
    },
  };
}

function backgroundTrackingOptionsMatch(
  currentOptions: Location.LocationTaskOptions | null,
  nextOptions: Location.LocationTaskOptions,
): boolean {
  if (!currentOptions) {
    return false;
  }

  return (
    currentOptions.accuracy === nextOptions.accuracy &&
    currentOptions.distanceInterval === nextOptions.distanceInterval &&
    currentOptions.timeInterval === nextOptions.timeInterval &&
    currentOptions.activityType === nextOptions.activityType &&
    currentOptions.pausesUpdatesAutomatically === nextOptions.pausesUpdatesAutomatically &&
    currentOptions.showsBackgroundLocationIndicator === nextOptions.showsBackgroundLocationIndicator
  );
}

export async function startBackgroundLocationTracking(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  await Location.startLocationUpdatesAsync(
    BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    buildBackgroundTrackingOptions(profile),
  );
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  if (!started) {
    return;
  }

  await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
}

export async function restartBackgroundLocationTracking(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  if (started) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(
    BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    buildBackgroundTrackingOptions(profile),
  );
}

export async function syncBackgroundLocationTracking(
  status: "idle" | "recording" | "interrupted",
  activeTripId: string | null,
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  if (status !== "recording" || !activeTripId) {
    if (started) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
    }
    return;
  }

  const nextOptions = buildBackgroundTrackingOptions(profile);

  if (!started) {
    await Location.startLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME, nextOptions);
    return;
  }

  const currentOptions =
    await TaskManager.getTaskOptionsAsync<Location.LocationTaskOptions>(
      BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    );

  if (!backgroundTrackingOptionsMatch(currentOptions, nextOptions)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
    await Location.startLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME, nextOptions);
  }
}

export async function watchForegroundLocation(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  onLocation: (snapshot: CurrentLocationSnapshot) => void,
): Promise<() => void> {
  const trackingOptions = getTrackingOptionsForProfile(profile);
  const subscription = await Location.watchPositionAsync(
    trackingOptions,
    (location: Location.LocationObject) => {
      onLocation(toSnapshot(location));
    },
  );

  return () => subscription.remove();
}
