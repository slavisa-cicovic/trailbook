import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type { RecordingMode, RecordingProfile } from "../../domain/trips";
import type { RecordingConfigAccuracy, TrackingProfileConfig } from "../../domain/recording-config";
import { getRuntimeTrackingProfileConfig } from "../recording/recording-config.service";
import { recordRecordingNativeEvent } from "../recording/recording-native-events.service";
import { BACKGROUND_RECORDING_LOCATION_TASK_NAME } from "./background-location.constants";

export function getBackgroundTrackingProfile(
  recordingMode: RecordingMode,
  recordingProfile: RecordingProfile,
): RecordingProfile {
  if (recordingMode === "auto") {
    return DEFAULT_RECORDING_PROFILE;
  }

  return recordingProfile;
}

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

type DiagnosticTrackingOptions = Pick<
  Location.LocationTaskOptions,
  | "accuracy"
  | "activityType"
  | "distanceInterval"
  | "pausesUpdatesAutomatically"
  | "showsBackgroundLocationIndicator"
  | "timeInterval"
>;

export interface BackgroundLocationTrackingDiagnosticState {
  error: string | null;
  expectedOptions: DiagnosticTrackingOptions | null;
  optionsMatchExpected: boolean | null;
  started: boolean | null;
  supported: boolean;
  taskName: string;
  taskOptions: DiagnosticTrackingOptions | null;
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
        distanceInterval: 30,
        timeInterval: 15 * 1000,
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

function pickDiagnosticTrackingOptions(
  options: Location.LocationTaskOptions | null,
): DiagnosticTrackingOptions | null {
  if (!options) {
    return null;
  }

  return {
    accuracy: options.accuracy,
    activityType: options.activityType,
    distanceInterval: options.distanceInterval,
    pausesUpdatesAutomatically: options.pausesUpdatesAutomatically,
    showsBackgroundLocationIndicator: options.showsBackgroundLocationIndicator,
    timeInterval: options.timeInterval,
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export async function startBackgroundLocationTracking(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  tripLocalId: string | null = null,
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  await Location.startLocationUpdatesAsync(
    BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    buildBackgroundTrackingOptions(profile),
  );
  void recordRecordingNativeEvent({
    eventType: "native_service_started",
    payload: { profile },
    tripLocalId,
  });
}

export async function getBackgroundLocationTrackingDiagnosticState(
  expectedProfile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
): Promise<BackgroundLocationTrackingDiagnosticState> {
  const expectedOptions = buildBackgroundTrackingOptions(expectedProfile);
  const supported = await isBackgroundLocationTrackingSupported();

  if (!supported) {
    return {
      error: null,
      expectedOptions: pickDiagnosticTrackingOptions(expectedOptions),
      optionsMatchExpected: null,
      started: null,
      supported,
      taskName: BACKGROUND_RECORDING_LOCATION_TASK_NAME,
      taskOptions: null,
    };
  }

  try {
    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
    const taskOptions =
      await TaskManager.getTaskOptionsAsync<Location.LocationTaskOptions>(
        BACKGROUND_RECORDING_LOCATION_TASK_NAME,
      ).catch(() => null);

    return {
      error: null,
      expectedOptions: pickDiagnosticTrackingOptions(expectedOptions),
      optionsMatchExpected: backgroundTrackingOptionsMatch(taskOptions, expectedOptions),
      started,
      supported,
      taskName: BACKGROUND_RECORDING_LOCATION_TASK_NAME,
      taskOptions: pickDiagnosticTrackingOptions(taskOptions),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      expectedOptions: pickDiagnosticTrackingOptions(expectedOptions),
      optionsMatchExpected: null,
      started: null,
      supported,
      taskName: BACKGROUND_RECORDING_LOCATION_TASK_NAME,
      taskOptions: null,
    };
  }
}

export async function startBackgroundLocationTrackingWithRetry(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  onAttemptFailure?: (attempt: number, error: unknown) => void,
  tripLocalId: string | null = null,
): Promise<void> {
  const retryDelaysMs = [0, 750, 1500, 3000, 5000, 8000];
  let lastError: unknown = null;

  for (let index = 0; index < retryDelaysMs.length; index += 1) {
    const delayMs = retryDelaysMs[index];

    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      await startBackgroundLocationTracking(profile, tripLocalId);
      return;
    } catch (error) {
      lastError = error;
      onAttemptFailure?.(index + 1, error);
      void recordRecordingNativeEvent({
        eventType: "background_tracking_restart_failed",
        payload: {
          attempt: index + 1,
          error: error instanceof Error ? error.message : String(error),
          profile,
          reason: "start-retry-failed",
        },
        tripLocalId,
      });
    }
  }

  throw lastError;
}

export async function stopBackgroundLocationTracking(tripLocalId: string | null = null): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  if (!started) {
    return;
  }

  await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
  void recordRecordingNativeEvent({
    eventType: "native_service_stopped",
    tripLocalId,
  });
}

export async function restartBackgroundLocationTracking(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  tripLocalId: string | null = null,
  reason = "manual",
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  try {
    void recordRecordingNativeEvent({
      eventType: "native_location_restart_requested",
      payload: { profile, reason, started },
      tripLocalId,
    });
    // Stop before starting so the OS registers the new config (distanceInterval, activityType, etc.).
    // Both operations are inside one try so that a failed start doesn't leave GPS stopped.
    if (started) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
    }
    await Location.startLocationUpdatesAsync(
      BACKGROUND_RECORDING_LOCATION_TASK_NAME,
      buildBackgroundTrackingOptions(profile),
    );
    void recordRecordingNativeEvent({
      eventType: "native_location_restart_succeeded",
      payload: { profile, previouslyStarted: started, reason },
      tripLocalId,
    });
  } catch (error) {
    // Restart failed (e.g. Expo Go, permission lost, OS background restriction).
    // GPS may have been stopped above — attempt to restart so recording doesn't go silent.
    console.warn("[Trailbook][location] restartBackgroundLocationTracking failed, attempting restore", error);
    void recordRecordingNativeEvent({
      eventType: "native_location_restart_failed",
      payload: {
        error: error instanceof Error ? error.message : String(error),
        profile,
        previouslyStarted: started,
        reason,
      },
      tripLocalId,
    });
    try {
      await Location.startLocationUpdatesAsync(
        BACKGROUND_RECORDING_LOCATION_TASK_NAME,
        buildBackgroundTrackingOptions(profile),
      );
    } catch {
      // Restore also failed — GPS is unavailable, recording continues without position updates.
    }
  }
}

export async function syncBackgroundLocationTracking(
  status: "idle" | "recording" | "interrupted",
  activeTripId: string | null,
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  recordingMode: RecordingMode = profile,
): Promise<void> {
  if (!(await isBackgroundLocationTrackingSupported())) {
    return;
  }

  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);

  if (status !== "recording" || !activeTripId) {
    if (started) {
      console.warn("[Trailbook][background-sync] stopping", { status, activeTripId });
      await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
      void recordRecordingNativeEvent({
        eventType: "native_service_stopped",
        payload: { reason: "sync-status", status },
        tripLocalId: activeTripId,
      });
    }
    return;
  }

  const backgroundTrackingProfile = getBackgroundTrackingProfile(recordingMode, profile);
  const nextOptions = buildBackgroundTrackingOptions(backgroundTrackingProfile);

  if (!started) {
    console.warn("[Trailbook][background-sync] starting", { activeTripId, profile: backgroundTrackingProfile });
    await startBackgroundLocationTrackingWithRetry(backgroundTrackingProfile, undefined, activeTripId);
    return;
  }

  const currentOptions =
    await TaskManager.getTaskOptionsAsync<Location.LocationTaskOptions>(
      BACKGROUND_RECORDING_LOCATION_TASK_NAME,
    );

  if (!backgroundTrackingOptionsMatch(currentOptions, nextOptions)) {
    console.warn("[Trailbook][background-sync] restarting-options", { activeTripId, profile: backgroundTrackingProfile });
    await Location.stopLocationUpdatesAsync(BACKGROUND_RECORDING_LOCATION_TASK_NAME);
    void recordRecordingNativeEvent({
      eventType: "background_tracking_restart_requested",
      payload: { profile: backgroundTrackingProfile, reason: "options-changed" },
      tripLocalId: activeTripId,
    });
    await startBackgroundLocationTrackingWithRetry(backgroundTrackingProfile, undefined, activeTripId);
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
