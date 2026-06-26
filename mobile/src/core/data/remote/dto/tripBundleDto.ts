import type { TripBundle, CaptureMeta } from '@/core/domain/model/tripBundle';
import type { Trip } from '@/core/domain/model/trip';
import type {
  RawLocationSample, RawActivitySample, RawActivityResult,
  RawDeviceSample, RawSessionEvent,
} from '@/core/domain/model/rawSamples';
import type { Waypoint } from '@/core/domain/model/waypoint';
import type { Segment } from '@/core/domain/model/segment';

// ── Wire → domain activity type mapping ──────────────────────────────────────

const ACTIVITY_TYPE_TO_STRING: Record<number, string> = {
  0: 'IN_VEHICLE', 1: 'ON_BICYCLE', 2: 'ON_FOOT', 3: 'STILL',
  4: 'UNKNOWN',    5: 'TILTING',    7: 'WALKING', 8: 'RUNNING',
};

const ACTIVITY_STRING_TO_TYPE: Record<string, number> = Object.fromEntries(
  Object.entries(ACTIVITY_TYPE_TO_STRING).map(([k, v]) => [v, parseInt(k, 10)]),
);

// ── DTO types ─────────────────────────────────────────────────────────────────

export interface TripRequestDto {
  clientTripId: string;
  title: string;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  processingVersion: number;
}

export interface CaptureMetaRequestDto {
  captureSchemaVersion: number;
  appVersion: string;
  osApiLevel: number;
  deviceModel: string;
  captureTimeZone: string;
}

export interface LocationSampleDto {
  timestamp: string;
  latitude: number;
  longitude: number;
  accuracyM?: number;
  altitudeM?: number;
  speedMps?: number;
  bearingDeg?: number;
  provider: string;
}

export interface ActivityResultDto {
  activity: string;
  confidence: number;
}

export interface ActivitySampleDto {
  timestamp: string;
  results: ActivityResultDto[];
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
  payload?: Record<string, unknown> | null;
}

export interface WaypointDto {
  id: string;
  tripId: string;
  title: string;
  description: string | null;
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
  distanceM: number | null;
}

export interface TripBundleRequestDto {
  trip: TripRequestDto;
  captureMeta: CaptureMetaRequestDto;
  raw: {
    locations: LocationSampleDto[];
    activities: ActivitySampleDto[];
    devices: DeviceSampleDto[];
    events: SessionEventDto[];
  };
  waypoints: WaypointDto[];
  segments: SegmentDto[];
}

export interface TripListItemDto {
  clientTripId: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
}

// ── Domain → DTO (upload) ─────────────────────────────────────────────────────

function toActivityResultDto(r: RawActivityResult): ActivityResultDto {
  return {
    activity: ACTIVITY_TYPE_TO_STRING[r.activityType] ?? 'UNKNOWN',
    confidence: r.confidence,
  };
}

export function tripBundleToDto(bundle: TripBundle): TripBundleRequestDto {
  const { trip, captureMeta, locations, activities, deviceStates, sessionEvents, waypoints, segments } = bundle;

  return {
    trip: {
      clientTripId: trip.clientTripId,
      title: trip.title,
      description: trip.description,
      startedAt: trip.startedAt.toISOString(),
      endedAt: trip.endedAt?.toISOString() ?? null,
      status: trip.status,
      processingVersion: trip.processingVersion,
    },
    captureMeta: {
      captureSchemaVersion: captureMeta.captureSchemaVersion,
      appVersion: captureMeta.appVersion,
      osApiLevel: captureMeta.osApiLevel,
      deviceModel: captureMeta.deviceModel,
      captureTimeZone: captureMeta.captureTimeZone,
    },
    raw: {
      locations: locations.map((l) => ({
        timestamp: l.timestamp.toISOString(),
        latitude: l.latitude,
        longitude: l.longitude,
        accuracyM: l.accuracyM,
        altitudeM: l.altitudeM,
        speedMps: l.speedMps,
        bearingDeg: l.bearingDeg,
        provider: l.provider,
      })),
      activities: activities.map((a) => ({
        timestamp: a.timestamp.toISOString(),
        results: a.results.map(toActivityResultDto),
      })),
      devices: deviceStates.map((d) => ({
        timestamp: d.timestamp.toISOString(),
        batteryPct: d.batteryPct,
        isCharging: d.isCharging,
        powerSaveMode: d.powerSaveMode,
        gpsEnabled: d.gpsEnabled,
      })),
      events: sessionEvents.map((e) => ({
        timestamp: e.timestamp.toISOString(),
        type: e.type,
        payload: e.payload ?? null,
      })),
    },
    waypoints: waypoints.map((w) => ({
      id: w.id,
      tripId: w.tripId,
      title: w.title,
      description: w.description,
      category: w.category,
      latitude: w.latitude,
      longitude: w.longitude,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
    segments: segments.map((s) => ({
      index: s.index,
      segmentType: s.segmentType,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt.toISOString(),
      distanceM: s.distanceM,
    })),
  };
}

// ── DTO → Domain (restore — PLAN 10) ─────────────────────────────────────────

export function tripBundleDtoToDomain(dto: TripBundleRequestDto, localId: number): TripBundle {
  const t = dto.trip;
  const trip: Trip = {
    id: localId,
    clientTripId: t.clientTripId,
    title: t.title,
    description: t.description,
    startedAt: new Date(t.startedAt),
    endedAt: t.endedAt ? new Date(t.endedAt) : null,
    status: t.status as Trip['status'],
    processingVersion: t.processingVersion,
    syncState: 'SYNCED',
  };

  const cm = dto.captureMeta;
  const captureMeta: CaptureMeta = {
    tripId: t.clientTripId,
    captureSchemaVersion: cm.captureSchemaVersion,
    appVersion: cm.appVersion,
    osApiLevel: cm.osApiLevel,
    deviceModel: cm.deviceModel,
    captureTimeZone: cm.captureTimeZone,
  };

  const locations: RawLocationSample[] = dto.raw.locations.map((l) => ({
    tripId: t.clientTripId,
    timestamp: new Date(l.timestamp),
    latitude: l.latitude,
    longitude: l.longitude,
    accuracyM: l.accuracyM,
    altitudeM: l.altitudeM,
    speedMps: l.speedMps,
    bearingDeg: l.bearingDeg,
    provider: l.provider,
  }));

  const activities: RawActivitySample[] = dto.raw.activities.map((a) => ({
    tripId: t.clientTripId,
    timestamp: new Date(a.timestamp),
    results: a.results.map((r) => ({
      activityType: ACTIVITY_STRING_TO_TYPE[r.activity] ?? 4,
      confidence: r.confidence,
    })) as RawActivityResult[],
  }));

  const deviceStates: RawDeviceSample[] = dto.raw.devices.map((d) => ({
    tripId: t.clientTripId,
    timestamp: new Date(d.timestamp),
    batteryPct: d.batteryPct,
    isCharging: d.isCharging,
    powerSaveMode: d.powerSaveMode,
    gpsEnabled: d.gpsEnabled,
  }));

  const sessionEvents: RawSessionEvent[] = dto.raw.events.map((e) => ({
    tripId: t.clientTripId,
    timestamp: new Date(e.timestamp),
    type: e.type as RawSessionEvent['type'],
    payload: e.payload ?? undefined,
  }));

  const waypoints: Waypoint[] = dto.waypoints.map((w) => ({
    id: w.id,
    tripId: w.tripId,
    title: w.title,
    description: w.description,
    category: w.category as Waypoint['category'],
    latitude: w.latitude,
    longitude: w.longitude,
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
  }));

  const segments: Segment[] = dto.segments.map((s) => ({
    tripId: t.clientTripId,
    index: s.index,
    segmentType: s.segmentType as Segment['segmentType'],
    startedAt: new Date(s.startedAt),
    endedAt: new Date(s.endedAt),
    distanceM: s.distanceM,
  }));

  return { trip, captureMeta, locations, activities, deviceStates, sessionEvents, waypoints, segments };
}
