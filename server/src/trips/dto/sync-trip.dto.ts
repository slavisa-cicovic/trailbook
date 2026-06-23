export interface TripBundleDto {
  trip: TripDto;
  captureMeta: CaptureMetaDto;
  raw: RawDataDto;
  waypoints: WaypointDto[];
  segments: SegmentDto[];
}

export interface TripDto {
  clientTripId: string;
  title: string;
  description?: string | null;
  startedAt: string;
  endedAt?: string | null;
  status: string;
  processingVersion: number;
}

export interface CaptureMetaDto {
  captureSchemaVersion: number;
  appVersion: string;
  osApiLevel: number;
  deviceModel: string;
  captureTimeZone: string;
}

export interface RawDataDto {
  locations: LocationSampleDto[];
  activities: ActivitySampleDto[];
  devices: DeviceSampleDto[];
  events: SessionEventDto[];
}

export interface LocationSampleDto {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  altitudeM?: number | null;
  speedMps?: number | null;
  bearingDeg?: number | null;
  provider: string;
}

export interface ActivitySampleDto {
  timestamp: string;
  results: ActivityResultDto[];
}

export interface ActivityResultDto {
  activity: string;
  confidence: number;
}

export interface DeviceSampleDto {
  timestamp: string;
  batteryPct: number;
  isCharging: boolean;
  powerSaveMode: boolean;
  gpsEnabled: boolean;
}

export interface SessionEventDto {
  timestamp: string;
  type: string;
}

export interface WaypointDto {
  id: string;
  tripId: string;
  title: string;
  description?: string | null;
  category: string;
  latitude: number;
  longitude: number;
  createdAt: string;
  updatedAt: string;
}

export interface SegmentDto {
  index: number;
  segmentType: string;
  startedAt: string;
  endedAt: string;
  distanceM?: number | null;
}

export interface TripListItemDto {
  clientTripId: string;
  title: string;
  startedAt: string;
  endedAt?: string | null;
}
