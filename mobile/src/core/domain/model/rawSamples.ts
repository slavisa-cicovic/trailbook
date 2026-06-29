export interface RawLocationSample {
  tripId: string;
  timestamp: Date;
  latitude: number;
  longitude: number;
  accuracyM?: number;
  altitudeM?: number;
  speedMps?: number;
  bearingDeg?: number;
  provider: string;
}

export interface RawActivityResult {
  activityType: number;
  confidence: number;
}

export interface RawActivitySample {
  tripId: string;
  timestamp: Date;
  results: RawActivityResult[];
}

export interface RawDeviceSample {
  tripId: string;
  timestamp: Date;
  batteryPct: number;
  isCharging: boolean;
  powerSaveMode: boolean;
  gpsEnabled: boolean;
}

export type SessionEventType =
  | 'RECORDING_STARTED'
  | 'RECORDING_STOPPED'
  | 'RECORDING_PAUSED'
  | 'RECORDING_RESUMED'
  | 'TRIP_RESUMED'
  | 'SERVICE_RESTARTED'
  | 'PROCESS_DEATH_RECOVERED'
  | 'PERMISSION_CHANGED'
  | 'LOCATION_SETTINGS_CHANGED'
  | 'LOCATION_TASK_START_REQUESTED'
  | 'LOCATION_TASK_START_SUCCEEDED'
  | 'LOCATION_TASK_START_FAILED'
  | 'LOCATION_TASK_STOP_REQUESTED'
  | 'LOCATION_TASK_STOP_SUCCEEDED'
  | 'LOCATION_TASK_STOP_FAILED'
  | 'LOCATION_TASK_CALLBACK_RECEIVED'
  | 'LOCATION_TASK_CALLBACK_IGNORED'
  | 'LOCATION_TASK_CALLBACK_WRITE_FAILED'
  | 'LOCATION_TASK_OPTIONS_SNAPSHOT'
  | 'LOCATION_TASK_WATCHDOG'
  | 'LOCATION_TASK_STALE_RESTART_REQUESTED'
  | 'LOCATION_TASK_STALE_RESTART_SUCCEEDED'
  | 'LOCATION_TASK_STALE_RESTART_FAILED'
  | 'MAP_USER_LOCATION_RECEIVED';

export interface RawSessionEvent {
  tripId: string;
  timestamp: Date;
  type: SessionEventType;
  payload?: Record<string, unknown>;
}
