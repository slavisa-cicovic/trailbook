import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import type { LocationObject } from 'expo-location';
import { getActiveRecordingTripId } from './activeTripStore';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import { buildActivitySampleFromSpeed } from '@/core/data/activity/activitySampler';
import { dbEvents } from '@/core/db/events';

export const LOCATION_TASK = 'vellora-location-task';

// Defined at module level — must be imported before any component mounts
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }: TaskManager.TaskManagerTaskBody<{ locations: LocationObject[] }>) => {
  if (error) {
    console.error('[LocationTask] error:', error.message);
    return;
  }
  if (!data?.locations?.length) return;

  const tripId = await getActiveRecordingTripId();
  if (!tripId) return;

  for (const loc of data.locations) {
    const timestamp = new Date(loc.timestamp);

    await rawLocationDao.insert({
      tripId,
      timestamp,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracyM: loc.coords.accuracy ?? undefined,
      altitudeM: loc.coords.altitude ?? undefined,
      speedMps: loc.coords.speed ?? undefined,
      bearingDeg: loc.coords.heading ?? undefined,
      provider: 'fused',
    });

    const activitySample = buildActivitySampleFromSpeed(tripId, loc.coords.speed, timestamp);
    await rawActivityDao.insert(activitySample);
  }

  dbEvents.emit('rawData:changed');
});

export async function startLocationTask(): Promise<void> {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Vellora',
      notificationBody: 'Recording trip in progress...',
      notificationColor: '#1a1a1a',
    },
  });
}

export async function stopLocationTask(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (isRunning) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export async function isLocationTaskRunning(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
}
