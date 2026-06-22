export type TripStatus = "recording" | "paused" | "completed";

export type SyncState = "pending" | "synced" | "failed";

export type SegmentType =
  | "walk"
  | "bike"
  | "drive"
  | "boat"
  | "plane"
  | "stationary"
  | "unknown";

export type SessionEventType =
  | "recording_started"
  | "recording_stopped"
  | "trip_resumed"
  | "service_restarted"
  | "process_death_recovered"
  | "permission_changed"
  | "location_settings_changed";

export interface TripCore {
  clientTripId: string;
  description: string | null;
  endedAt: string | null;
  id?: number;
  processingVersion: number;
  startedAt: string;
  status: TripStatus;
  syncState: SyncState;
  title: string;
}

export interface SegmentCore {
  distanceM: number | null;
  endedAt: string;
  index: number;
  segmentType: SegmentType;
  startedAt: string;
  tripId: string;
}

export interface RawLocationSample {
  accuracyM: number | null;
  altitudeM: number | null;
  bearingDeg: number | null;
  latitude: number;
  longitude: number;
  provider: string;
  speedMps: number | null;
  timestamp: string;
  tripId: string;
}

export interface RawActivityResult {
  activityType: number;
  confidence: number;
}

export interface RawActivitySample {
  results: RawActivityResult[];
  timestamp: string;
  tripId: string;
}

export interface RawDeviceSample {
  batteryPct: number;
  gpsEnabled: boolean;
  isCharging: boolean;
  powerSaveMode: boolean;
  timestamp: string;
  tripId: string;
}

export interface RawSessionEvent {
  timestamp: string;
  tripId: string;
  type: SessionEventType;
}

export interface CaptureMeta {
  appVersion: string;
  captureSchemaVersion: number;
  captureTimeZone: string;
  deviceModel: string;
  osApiLevel: string;
  tripId: string;
}

export interface WaypointCore {
  createdAt: string;
  id: string;
  latitude: number;
  longitude: number;
  note: string | null;
  segmentIndex: number | null;
  title: string;
  tripId: string;
  type: string;
  updatedAt: string;
}

export interface WaypointImageCore {
  createdAt: string;
  id: string;
  localUri: string;
  mimeType: string | null;
  remoteUrl: string | null;
  uploaded: boolean;
  waypointId: string;
}

export interface TripBundleCore {
  activities: RawActivitySample[];
  captureMeta: CaptureMeta;
  deviceStates: RawDeviceSample[];
  locations: RawLocationSample[];
  segments: SegmentCore[];
  sessionEvents: RawSessionEvent[];
  trip: TripCore;
  waypoints: WaypointCore[];
}
