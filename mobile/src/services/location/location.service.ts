import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type { RecordingProfile } from "../../domain/trips";
import type { RecordingConfigAccuracy, TrackingProfileConfig } from "../../domain/recording-config";
import { getRuntimeTrackingProfileConfig } from "../recording/recording-config.service";
import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "./background-location.constants";

export interface CurrentLocationSnapshot {
  accuracy: number | null;
  altitude: number | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed: number | null;
}

export interface TrackingOptions {
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
  const lastKnownLocation = await Location.getLastKnownPositionAsync();

  if (lastKnownLocation) {
    return toSnapshot(lastKnownLocation);
  }

  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });

    return toSnapshot(location);
  } catch {
    return null;
  }
}

export function getTrackingOptionsForProfile(profile: RecordingProfile): TrackingOptions {
  const runtimeConfig = getRuntimeTrackingProfileConfig(profile);

  if (runtimeConfig) {
    return toTrackingOptions(runtimeConfig);
  }

  return getFallbackTrackingOptionsForProfile(profile);
}

function getFallbackTrackingOptionsForProfile(profile: RecordingProfile): TrackingOptions {
  switch (profile) {
    case "walk":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: Platform.OS === "android" ? 5 : 12,
        timeInterval: Platform.OS === "android" ? 5 * 1000 : 15 * 1000,
      };
    case "bike":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 15,
        timeInterval: 20 * 1000,
      };
    case "drive":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 50,
        timeInterval: 30 * 1000,
      };
    case "boat":
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 180,
        timeInterval: 4 * 60 * 1000,
      };
    case "plane":
      return {
        accuracy: Location.Accuracy.Low,
        distanceInterval: 1000,
        timeInterval: 10 * 60 * 1000,
      };
    default:
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 120,
        timeInterval: 3 * 60 * 1000,
      };
  }
}

function toTrackingOptions(config: TrackingProfileConfig): TrackingOptions {
  return {
    accuracy: toExpoAccuracy(config.accuracy),
    distanceInterval: config.distanceInterval,
    timeInterval: config.timeIntervalMs,
  };
}

function toExpoAccuracy(accuracy: RecordingConfigAccuracy): Location.Accuracy {
  switch (accuracy) {
    case "lowest":
      return Location.Accuracy.Lowest;
    case "low":
      return Location.Accuracy.Low;
    case "balanced":
      return Location.Accuracy.Balanced;
    case "high":
      return Location.Accuracy.High;
    case "highest":
      return Location.Accuracy.Highest;
    case "bestForNavigation":
      return Location.Accuracy.BestForNavigation;
    default:
      return Location.Accuracy.Balanced;
  }
}

function getBackgroundActivityTypeForProfile(profile: RecordingProfile): Location.LocationActivityType {
  switch (profile) {
    case "drive":
      return Location.LocationActivityType.AutomotiveNavigation;
    case "plane":
      return Location.LocationActivityType.Airborne;
    case "boat":
    case "bike":
      return Location.LocationActivityType.OtherNavigation;
    case "walk":
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

export async function watchImmediateForegroundLocation(
  onLocation: (snapshot: CurrentLocationSnapshot) => void,
): Promise<() => void> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 1,
      timeInterval: 1000,
    },
    (location: Location.LocationObject) => {
      onLocation(toSnapshot(location));
    },
  );

  return () => subscription.remove();
}
