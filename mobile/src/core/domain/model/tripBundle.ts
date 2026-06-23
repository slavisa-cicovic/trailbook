import type { Trip } from './trip';
import type { RawLocationSample, RawActivitySample, RawDeviceSample, RawSessionEvent } from './rawSamples';
import type { Waypoint } from './waypoint';
import type { Segment } from './segment';

export interface CaptureMeta {
  tripId: string;
  captureSchemaVersion: number;
  appVersion: string;
  osApiLevel: number;
  deviceModel: string;
  captureTimeZone: string;
}

export interface TripBundle {
  trip: Trip;
  captureMeta: CaptureMeta;
  locations: RawLocationSample[];
  activities: RawActivitySample[];
  deviceStates: RawDeviceSample[];
  sessionEvents: RawSessionEvent[];
  waypoints: Waypoint[];
  segments: Segment[];
}
