import { Platform } from 'react-native';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import { buildActivitySampleFromSpeed } from '@/core/data/activity/activitySampler';
import { getMotionActivitySample } from '@/core/data/activity/motionActivity';
import { dbEvents } from '@/core/db/events';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import { LocationDrainCoordinator } from './locationDrainCoordinator';

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
  peekEvents(maxCount: number): Promise<NativeLocationEvent[]>;
  acknowledgeEvents(count: number): Promise<void>;
  pendingEventCount(): Promise<number>;
  isRunning(): Promise<boolean>;
};

type NativeModuleRuntime = {
  module: NativeLocationModule;
  emitter: {
    addListener(
      eventName: string,
      listener: (event: Record<string, unknown>) => void,
    ): { remove(): void };
  } | null;
};

let runtime: NativeModuleRuntime | null | undefined;
let activeTripId: string | null = null;
let eventSubscription: { remove(): void } | null = null;
const drainCoordinator = new LocationDrainCoordinator();
let drainInterval: ReturnType<typeof setInterval> | null = null;

function loadRuntime(): NativeModuleRuntime | null {
  if (runtime !== undefined) return runtime;

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    runtime = null;
    return runtime;
  }

  try {
    const { EventEmitter, requireNativeModule } = require('expo-modules-core');
    const module = requireNativeModule('TrailbookNativeLocation') as NativeLocationModule;
    runtime = {
      module,
      emitter: Platform.OS === 'ios' ? new EventEmitter(module) : null,
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
    provider: event.provider ?? `native-${Platform.OS}`,
  };
}

async function persistNativeEvents(events: NativeLocationEvent[]): Promise<number> {
  const locations = events
    .map(toRawLocation)
    .filter((location): location is RawLocationSample => Boolean(location));

  if (!locations.length) {
    return 0;
  }

  const first = locations[0];
  const last = locations[locations.length - 1];
  await rawSessionEventDao.insert({
    tripId: first.tripId,
    timestamp: new Date(),
    type: 'LOCATION_TASK_CALLBACK_RECEIVED',
    payload: {
      firstTimestamp: first.timestamp.toISOString(),
      lastTimestamp: last.timestamp.toISOString(),
      locationsCount: locations.length,
      provider: `native-${Platform.OS}`,
      processingLimit: 250,
    },
  });

  await rawLocationDao.insertAll(locations);
  const activitySamples = await Promise.all(
    locations.map(async (location) =>
      (await getMotionActivitySample(location.tripId, location.timestamp)) ??
      buildActivitySampleFromSpeed(location.tripId, location.speedMps, location.timestamp),
    ),
  );
  await rawActivityDao.insertAll(activitySamples);
  return locations.length;
}

export function isNativeLocationCaptureAvailable(): boolean {
  return Boolean(loadRuntime());
}

export async function flushNativeLocationEvents(): Promise<number> {
  const native = loadRuntime();
  if (!native) return 0;

  return drainCoordinator.run(async () => {
    let persistedCount = 0;
    while (true) {
      const events = await native.module.peekEvents(250);
      if (!events.length) break;
      await persistNativeEvents(events);
      await native.module.acknowledgeEvents(events.length);
      persistedCount += events.length;
      if (events.length < 250) break;
    }

    // Persist recovery queues in bounded chunks, but publish one database
    // invalidation after the complete drain. Emitting for every chunk causes
    // subscribers to rebuild the full cumulative live route repeatedly.
    if (persistedCount > 0) dbEvents.emit('rawData:changed');
    return persistedCount;
  });
}

export async function startNativeLocationCapture(tripId: string): Promise<boolean> {
  const native = loadRuntime();
  if (!native) return false;
  if (!tripId) return false;

  activeTripId = tripId;
  await rawSessionEventDao.insert({
    tripId,
    timestamp: new Date(),
    type: 'LOCATION_TASK_START_REQUESTED',
    payload: { taskName: `trailbook-native-${Platform.OS}-location`, provider: `native-${Platform.OS}` },
  });

  eventSubscription?.remove();
  eventSubscription = native.emitter?.addListener('onLocations', (event) => {
    const error = typeof event.error === 'string' ? event.error : null;
    if (error && activeTripId) {
      rawSessionEventDao.insert({
        tripId: activeTripId,
        timestamp: new Date(),
        type: 'LOCATION_TASK_CALLBACK_WRITE_FAILED',
        payload: { error, taskName: `trailbook-native-${Platform.OS}-location` },
      }).catch(() => {});
      return;
    }

    flushNativeLocationEvents().catch((flushError) => {
      if (!activeTripId) return;
      rawSessionEventDao.insert({
        tripId: activeTripId,
        timestamp: new Date(),
        type: 'LOCATION_TASK_CALLBACK_WRITE_FAILED',
        payload: {
          error: flushError instanceof Error ? flushError.message : String(flushError),
          taskName: `trailbook-native-${Platform.OS}-location`,
        },
      }).catch(() => {});
    });
  }) ?? null;

  await native.module.start(tripId);
  await rawSessionEventDao.insert({
    tripId,
    timestamp: new Date(),
    type: 'LOCATION_TASK_START_SUCCEEDED',
    payload: { taskName: `trailbook-native-${Platform.OS}-location`, provider: `native-${Platform.OS}` },
  });

  drainInterval = setInterval(() => {
    flushNativeLocationEvents().catch(() => {});
  }, 5000);

  return true;
}

export async function stopNativeLocationCapture(): Promise<boolean> {
  const native = loadRuntime();
  if (!native) return false;

  const tripId = activeTripId;
  if (tripId) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'LOCATION_TASK_STOP_REQUESTED',
      payload: { taskName: `trailbook-native-${Platform.OS}-location` },
    });
  }

  if (drainInterval) {
    clearInterval(drainInterval);
    drainInterval = null;
  }

  await native.module.stop();
  // The first call joins a drain that may already be persisting a large batch.
  // The second starts a fresh pass after native stop has made the queue stable.
  await flushNativeLocationEvents();
  await flushNativeLocationEvents();
  eventSubscription?.remove();
  eventSubscription = null;

  if (tripId) {
    await rawSessionEventDao.insert({
      tripId,
      timestamp: new Date(),
      type: 'LOCATION_TASK_STOP_SUCCEEDED',
      payload: { taskName: `trailbook-native-${Platform.OS}-location` },
    });
  }

  activeTripId = null;
  return true;
}
