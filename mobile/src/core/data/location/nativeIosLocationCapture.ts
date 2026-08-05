import { Platform } from 'react-native';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import { buildActivitySampleFromSpeed } from '@/core/data/activity/activitySampler';
import { getMotionActivitySample } from '@/core/data/activity/motionActivity';
import { dbEvents } from '@/core/db/events';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';

declare const require: (name: string) => any;

type NativeLocationEvent = {
  tripId?: string;
  timestamp?: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  altitudeM?: number;
  speedMps?: number;
  bearingDeg?: number;
  provider?: string;
};

type NativeLocationModule = {
  start(tripId: string): Promise<void>;
  stop(): Promise<void>;
  drainEvents(): Promise<NativeLocationEvent[]>;
  isRunning(): Promise<boolean>;
};

type NativeModuleRuntime = {
  module: NativeLocationModule;
  emitter: {
    addListener(
      eventName: string,
      listener: (event: Record<string, unknown>) => void,
    ): { remove(): void };
  };
};

let runtime: NativeModuleRuntime | null | undefined;
let activeTripId: string | null = null;
let eventSubscription: { remove(): void } | null = null;
let drainInProgress = false;
let drainInterval: ReturnType<typeof setInterval> | null = null;

function loadRuntime(): NativeModuleRuntime | null {
  if (runtime !== undefined) return runtime;

  if (Platform.OS !== 'ios') {
    runtime = null;
    return runtime;
  }

  try {
    const { EventEmitter, requireNativeModule } = require('expo-modules-core');
    const module = requireNativeModule('TrailbookNativeLocation') as NativeLocationModule;
    runtime = {
      module,
      emitter: new EventEmitter(module),
    };
  } catch {
    runtime = null;
  }

  return runtime;
}

function toRawLocation(event: NativeLocationEvent): RawLocationSample | null {
  if (!event.tripId || !event.timestamp) return null;
  if (typeof event.latitude !== 'number' || typeof event.longitude !== 'number') return null;

  return {
    tripId: event.tripId,
    timestamp: new Date(event.timestamp),
    latitude: event.latitude,
    longitude: event.longitude,
    accuracyM: event.accuracyM,
    altitudeM: event.altitudeM,
    speedMps: event.speedMps,
    bearingDeg: event.bearingDeg,
    provider: event.provider ?? 'native-ios',
  };
}

async function persistNativeEvents(events: NativeLocationEvent[]): Promise<number> {
  const locations = events
    .map(toRawLocation)
    .filter((location): location is RawLocationSample => Boolean(location));

  if (!locations.length) {
    return 0;
  }

  await rawLocationDao.insertAll(locations);
  const activitySamples = await Promise.all(
    locations.map(async (location) =>
      (await getMotionActivitySample(location.tripId, location.timestamp)) ??
      buildActivitySampleFromSpeed(location.tripId, location.speedMps, location.timestamp),
    ),
  );
  await rawActivityDao.insertAll(activitySamples);
  dbEvents.emit('rawData:changed');
  return locations.length;
}

export function isNativeIosLocationCaptureAvailable(): boolean {
  return Boolean(loadRuntime());
}

export async function flushNativeIosLocationEvents(): Promise<number> {
  const native = loadRuntime();
  if (!native || drainInProgress) return 0;

  drainInProgress = true;
  try {
    const events = await native.module.drainEvents();
    return persistNativeEvents(events);
  } finally {
    drainInProgress = false;
  }
}

export async function startNativeIosLocationCapture(tripId: string): Promise<boolean> {
  const native = loadRuntime();
  if (!native) return false;
  if (!tripId) return false;

  activeTripId = tripId;
  await rawSessionEventDao.insert({
    tripId,
    timestamp: new Date(),
    type: 'LOCATION_TASK_START_REQUESTED',
    payload: { taskName: 'trailbook-native-ios-location', provider: 'native-ios' },
  });

  eventSubscription?.remove();
  eventSubscription = native.emitter.addListener('onLocations', (event) => {
    const error = typeof event.error === 'string' ? event.error : null;
    if (error && activeTripId) {
      rawSessionEventDao.insert({
        tripId: activeTripId,
        timestamp: new Date(),
        type: 'LOCATION_TASK_CALLBACK_WRITE_FAILED',
        payload: { error, taskName: 'trailbook-native-ios-location' },
      }).catch(() => {});
      return;
    }

    flushNativeIosLocationEvents().catch((flushError) => {
      if (!activeTripId) return;
      rawSessionEventDao.insert({
        tripId: activeTripId,
        timestamp: new Date(),
        type: 'LOCATION_TASK_CALLBACK_WRITE_FAILED',
        payload: {
          error: flushError instanceof Error ? flushError.message : String(flushError),
          taskName: 'trailbook-native-ios-location',
        },
      }).catch(() => {});
    });
  });

  await native.module.start(tripId);
  await rawSessionEventDao.insert({
    tripId,
    timestamp: new Date(),
    type: 'LOCATION_TASK_START_SUCCEEDED',
    payload: { taskName: 'trailbook-native-ios-location', provider: 'native-ios' },
  });

  drainInterval = setInterval(() => {
    flushNativeIosLocationEvents().catch(() => {});
  }, 5000);

  return true;
}

export async function stopNativeIosLocationCapture(): Promise<boolean> {
  const native = loadRuntime();
  if (!native) return false;

  const tripId = activeTripId;
  if (tripId) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'LOCATION_TASK_STOP_REQUESTED',
      payload: { taskName: 'trailbook-native-ios-location' },
    });
  }

  if (drainInterval) {
    clearInterval(drainInterval);
    drainInterval = null;
  }

  await native.module.stop();
  await flushNativeIosLocationEvents();
  eventSubscription?.remove();
  eventSubscription = null;

  if (tripId) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'LOCATION_TASK_STOP_SUCCEEDED',
      payload: { taskName: 'trailbook-native-ios-location' },
    });
  }

  activeTripId = null;
  return true;
}
