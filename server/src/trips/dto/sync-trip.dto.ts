import type { MobileRecordingConfigResponse } from "../../auth/mobile-recording-config.types";

export interface SyncTripSegmentDto {
  createdAt: string;
  endedAt: string | null;
  localId: string;
  recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
  startedAt: string;
  updatedAt: string;
}

export interface SyncTripPointDto {
  accuracy: number | null;
  altitude: number | null;
  latitude: number;
  localId: string;
  longitude: number;
  recordedAt: string;
  segmentLocalId: string | null;
  speed: number | null;
}

export interface SyncWaypointDto {
  category:
    | "generic"
    | "departure"
    | "fuel"
    | "border"
    | "port"
    | "ferry"
    | "restaurant"
    | "cafe"
    | "viewpoint"
    | "monument"
    | "beach";
  createdAt: string;
  deletedAt: string | null;
  latitude: number;
  localId: string;
  longitude: number;
  note: string | null;
  segmentLocalId: string | null;
  title: string;
  updatedAt: string;
}

export interface SyncWaypointAttachmentDto {
  createdAt: string;
  deletedAt: string | null;
  fileSize: number | null;
  localId: string;
  mimeType: string | null;
  type: "photo";
  updatedAt: string;
  waypointLocalId: string;
}

export interface SyncTripDiagnosticsRecentEventDto {
  accuracy: number | null;
  altitude: number | null;
  decision:
    | "accepted"
    | "accepted-after-long-gap"
    | "accepted-early-session"
    | "accepted-after-resume"
    | "confirmed-pending-continuity"
    | "duplicate-timestamp"
    | "duplicate-coordinates"
    | "session-duplicate-recorded-at"
    | "accuracy"
    | "min-movement"
    | "jump-distance"
    | "implied-speed"
    | "rejected-pending-continuity"
    | "removed-as-spike"
    | null;
  latitude: number;
  longitude: number;
  receivedAt: string;
  recordedAt: string;
  source: "foreground" | "background";
  speed: number | null;
}

export interface SyncTripDiagnosticsDto {
  accepted: number;
  acceptedAfterLongGap?: number;
  accuracyHistogram?: {
    gte120m: number;
    lt10m: number;
    lt20m: number;
    lt30m: number;
    lt50m: number;
    lt80m: number;
    lt120m: number;
    unknown: number;
  };
  backgroundAccepted: number;
  backgroundCallbacks: number;
  backgroundRejected: number;
  callbackCount: number;
  decisionCount: number;
  duplicateCoordinates: number;
  duplicateTimestamp: number;
  foregroundAccepted: number;
  foregroundCallbacks: number;
  foregroundRejected: number;
  maxCallbackGapMs: number;
  maxRecordedGapMs: number;
  platform: "android" | "ios" | "web" | "unknown";
  recentEvents: SyncTripDiagnosticsRecentEventDto[];
  recordingMode: "walk" | "bike" | "drive" | "boat" | "plane" | "auto";
  rejectedByAccuracy: number;
  rejectedByImpliedSpeed: number;
  rejectedByJumpDistance: number;
  rejectedByMinMovement: number;
  sessionDuplicateRecordedAt: number;
  updatedAt: string;
}

export interface SyncTripDto {
  attachments: SyncWaypointAttachmentDto[];
  createdAt: string;
  deletedAt: string | null;
  diagnostics?: SyncTripDiagnosticsDto | null;
  description: string | null;
  deviceId: string;
  endedAt: string | null;
  localId: string;
  recordingConfig?: MobileRecordingConfigResponse | null;
  recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
  segments: SyncTripSegmentDto[];
  startedAt: string;
  title: string;
  updatedAt: string;
  waypoints: SyncWaypointDto[];
  points: SyncTripPointDto[];
}

export interface SyncTripPointsChunkDto {
  points: SyncTripPointDto[];
}
