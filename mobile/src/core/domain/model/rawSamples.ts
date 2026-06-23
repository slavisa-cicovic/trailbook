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
  | 'LOCATION_SETTINGS_CHANGED';

export interface RawSessionEvent {
  tripId: string;
  timestamp: Date;
  type: SessionEventType;
}
