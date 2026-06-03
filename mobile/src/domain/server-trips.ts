import type { MobileRecordingConfig } from "./recording-config";
import type { RawLocationEvent } from "./raw-location-event";
import type { RecordingProfile, WaypointCategory } from "./trips";

export interface OwnedServerTripSummary {
  description: string | null;
  endedAt: string | null;
  id: string;
  pointCount: number | null;
  distanceMeters: number | null;
  statsUpdatedAt: string | null;
  recordingProfile: RecordingProfile;
  segmentCount: number;
  startedAt: string;
  title: string;
  updatedAt: string;
  waypointCount: number;
}

export interface OwnedServerTripDetail {
  attachments: {
    createdAt: string;
    fileSizeBytes: number | null;
    id: string;
    localId: string;
    mimeType: string | null;
    updatedAt: string;
    waypointId: string;
    waypointLocalId: string;
  }[];
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  deviceId: string;
  endedAt: string | null;
  id: string;
  localId: string;
  pointCount: number | null;
  distanceMeters: number | null;
  statsUpdatedAt: string | null;
  points: {
    accuracy: number | null;
    altitude: number | null;
    id: string;
    latitude: number;
    localId: string;
    longitude: number;
    recordedAt: string;
    segmentId: string | null;
    speed: number | null;
  }[];
  recordingConfig: MobileRecordingConfig | null;
  recordingProfile: RecordingProfile;
  rawEvents?: (RawLocationEvent & { id: string })[];
  batteryStartLevelPercent: number | null;
  batteryStartState: string | null;
  batteryEndLevelPercent: number | null;
  batteryEndState: string | null;
  segments: {
    createdAt: string;
    endedAt: string | null;
    id: string;
    localId: string;
    pointCount: number | null;
    distanceMeters: number | null;
    durationMs: number | null;
    statsUpdatedAt: string | null;
    recordingProfile: RecordingProfile;
    startedAt: string;
    updatedAt: string;
  }[];
  startedAt: string;
  title: string;
  updatedAt: string;
  waypoints: {
    category: WaypointCategory;
    createdAt: string;
    id: string;
    latitude: number;
    localId: string;
    longitude: number;
    note: string | null;
    segmentId: string | null;
    title: string;
    updatedAt: string;
  }[];
}
