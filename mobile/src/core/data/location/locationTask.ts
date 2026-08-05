import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import type { LocationObject } from 'expo-location';
import { Platform } from 'react-native';
import { getActiveRecordingTripId } from './activeTripStore';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import { buildActivitySampleFromSpeed } from '@/core/data/activity/activitySampler';
import { getMotionActivitySample } from '@/core/data/activity/motionActivity';
import { dbEvents } from '@/core/db/events';
import type { RawSessionEvent, SessionEventType } from '@/core/domain/model/rawSamples';

export const LOCATION_TASK = 'trailbook-location-task';

const START_RETRY_DELAYS_MS = [0, 750, 1500, 3000];

type LocationTaskPayload = Record<string, unknown>;

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function nowEvent(
  tripId: string,
  type: SessionEventType,
  payload?: LocationTaskPayload,
): RawSessionEvent {
  return {
    tripId,
    timestamp: new Date(),
    type,
    payload,
  };
}

async function recordLocationTaskEvent(
  tripId: string | null,
  type: SessionEventType,
  payload?: LocationTaskPayload,
): Promise<void> {
  if (!tripId) return;

  try {
    await rawSessionEventDao.insert(nowEvent(tripId, type, payload));
  } catch (error) {
    console.error('[LocationTask] failed to record session event:', error);
  }
}

function compactTaskOptions(options: Location.LocationTaskOptions): LocationTaskPayload {
  return {
    accuracy: options.accuracy,
    activityType: options.activityType,
    deferredUpdatesDistance: options.deferredUpdatesDistance,
    deferredUpdatesInterval: options.deferredUpdatesInterval,
    deferredUpdatesTimeout: options.deferredUpdatesTimeout,
    distanceInterval: options.distanceInterval,
    pausesUpdatesAutomatically: options.pausesUpdatesAutomatically,
    platform: Platform.OS,
    showsBackgroundLocationIndicator: options.showsBackgroundLocationIndicator,
    timeInterval: options.timeInterval,
  };
}

function buildLocationTaskOptions(): Location.LocationTaskOptions {
  const common: Location.LocationTaskOptions = {
    timeInterval: 3000,
    distanceInterval: 5,
    pausesUpdatesAutomatically: false,
  };

  if (Platform.OS === 'ios') {
    return {
      ...common,
      // iOS ignores timeInterval; only distanceInterval triggers updates.
      // The app records user-initiated routes and is currently auto-only, so
      // prefer navigation semantics over fitness. Fitness/High can stop
      // delivering after initial stationary samples on iOS.
      distanceInterval: 5,
      accuracy: Location.Accuracy.BestForNavigation,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
    };
  }

  return {
    ...common,
    accuracy: Location.Accuracy.High,
    foregroundService: {
      notificationTitle: 'Trailbook',
      notificationBody: 'Recording trip in progress...',
      notificationColor: '#1a1a1a',
    },
  };
}

async function recordTaskOptionsSnapshot(tripId: string, expectedOptions: Location.LocationTaskOptions): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    const actualOptions = await TaskManager.getTaskOptionsAsync<Location.LocationTaskOptions>(LOCATION_TASK)
      .catch(() => null);

    await recordLocationTaskEvent(tripId, 'LOCATION_TASK_OPTIONS_SNAPSHOT', {
      actualOptions: actualOptions ? compactTaskOptions(actualOptions) : null,
      expectedOptions: compactTaskOptions(expectedOptions),
      started,
      taskName: LOCATION_TASK,
    });
  } catch (error) {
    await recordLocationTaskEvent(tripId, 'LOCATION_TASK_OPTIONS_SNAPSHOT', {
      error: error instanceof Error ? error.message : String(error),
      expectedOptions: compactTaskOptions(expectedOptions),
      taskName: LOCATION_TASK,
    });
  }
}

// Defined at module level - must be imported before any component mounts.
// Guard against duplicate definition during fast refresh / JS reloads.
if (!TaskManager.isTaskDefined(LOCATION_TASK)) {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: LocationObject[] }>) => {
    const tripId = await getActiveRecordingTripId();

    if (error) {
      console.error('[LocationTask] error:', error.message);
      await recordLocationTaskEvent(tripId, 'LOCATION_TASK_CALLBACK_WRITE_FAILED', {
        error: error.message,
        taskName: LOCATION_TASK,
      });
      return;
    }

    const locations = data?.locations ?? [];
    if (!tripId) {
      console.error('[LocationTask] callback ignored because active trip is missing');
      return;
    }

    if (!locations.length) {
      await recordLocationTaskEvent(tripId, 'LOCATION_TASK_CALLBACK_RECEIVED', {
        locationsCount: 0,
        taskName: LOCATION_TASK,
      });
      return;
    }

    await recordLocationTaskEvent(tripId, 'LOCATION_TASK_CALLBACK_RECEIVED', {
      firstTimestamp: new Date(locations[0].timestamp).toISOString(),
      lastTimestamp: new Date(locations[locations.length - 1].timestamp).toISOString(),
      locationsCount: locations.length,
      taskName: LOCATION_TASK,
    });

    try {
      for (const loc of locations) {
        const timestamp = new Date(loc.timestamp);

        await rawLocationDao.insert({
          tripId,
          timestamp,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          // iOS returns -1 for unavailable values; treat negative as undefined
          accuracyM: loc.coords.accuracy != null && loc.coords.accuracy >= 0 ? loc.coords.accuracy : undefined,
          altitudeM: loc.coords.altitude != null && loc.coords.altitude > -999 ? loc.coords.altitude : undefined,
          speedMps: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : undefined,
          bearingDeg: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : undefined,
          provider: 'fused',
        });

        const activitySample =
          (await getMotionActivitySample(tripId, timestamp)) ??
          buildActivitySampleFromSpeed(tripId, loc.coords.speed, timestamp);
        await rawActivityDao.insert(activitySample);
      }
    } catch (writeError) {
      await recordLocationTaskEvent(tripId, 'LOCATION_TASK_CALLBACK_WRITE_FAILED', {
        error: writeError instanceof Error ? writeError.message : String(writeError),
        locationsCount: locations.length,
        taskName: LOCATION_TASK,
      });
      throw writeError;
    }

    dbEvents.emit('rawData:changed');
  });
}

export async function startLocationTask(): Promise<void> {
  const tripId = await getActiveRecordingTripId();
  const options = buildLocationTaskOptions();
  let lastError: unknown = null;

  await recordLocationTaskEvent(tripId, 'LOCATION_TASK_START_REQUESTED', {
    options: compactTaskOptions(options),
    taskName: LOCATION_TASK,
  });

  for (let attemptIndex = 0; attemptIndex < START_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    const delayMs = START_RETRY_DELAYS_MS[attemptIndex];
    if (delayMs > 0) {
      await wait(delayMs);
    }

    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
      if (isRunning) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      }

      await Location.startLocationUpdatesAsync(LOCATION_TASK, options);

      await recordLocationTaskEvent(tripId, 'LOCATION_TASK_START_SUCCEEDED', {
        attempt: attemptIndex + 1,
        options: compactTaskOptions(options),
        previouslyRunning: isRunning,
        taskName: LOCATION_TASK,
      });
      if (tripId) {
        await recordTaskOptionsSnapshot(tripId, options);
      }
      return;
    } catch (error) {
      lastError = error;
      await recordLocationTaskEvent(tripId, 'LOCATION_TASK_START_FAILED', {
        attempt: attemptIndex + 1,
        error: error instanceof Error ? error.message : String(error),
        options: compactTaskOptions(options),
        taskName: LOCATION_TASK,
      });
    }
  }

  throw lastError;
}

export async function stopLocationTask(): Promise<void> {
  const tripId = await getActiveRecordingTripId();
  await recordLocationTaskEvent(tripId, 'LOCATION_TASK_STOP_REQUESTED', {
    taskName: LOCATION_TASK,
  });

  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    await recordLocationTaskEvent(tripId, 'LOCATION_TASK_STOP_SUCCEEDED', {
      previouslyRunning: isRunning,
      taskName: LOCATION_TASK,
    });
  } catch (error) {
    await recordLocationTaskEvent(tripId, 'LOCATION_TASK_STOP_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      taskName: LOCATION_TASK,
    });
    throw error;
  }
}
