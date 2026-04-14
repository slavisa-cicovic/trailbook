export type SyncStatus = "local-only" | "pending-sync" | "synced" | "sync-error";
export type RecordingStatus = "idle" | "recording" | "interrupted";
export type TripStatus = "active" | "paused" | "ended";
export type WaypointAttachmentType = "photo";
export type RecordingProfile = "walk" | "bike" | "drive" | "boat" | "plane";
export type RecordingMode = RecordingProfile | "auto";
export type WaypointCategory =
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

export interface Trip {
  localId: string;
  serverId: string | null;
  deviceId: string;
  userId: string;
  title: string;
  description: string | null;
  recordingProfile: RecordingProfile;
  status: TripStatus;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface TripPause {
  localId: string;
  serverId: string | null;
  tripLocalId: string;
  deviceId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface TripSegment {
  localId: string;
  serverId: string | null;
  tripLocalId: string;
  deviceId: string;
  userId: string;
  recordingProfile: RecordingProfile;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface TripPoint {
  localId: string;
  serverId: string | null;
  tripLocalId: string;
  segmentLocalId: string | null;
  deviceId: string;
  userId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  syncStatus: SyncStatus;
}

export interface Waypoint {
  localId: string;
  serverId: string | null;
  tripLocalId: string;
  segmentLocalId: string | null;
  deviceId: string;
  userId: string;
  latitude: number;
  longitude: number;
  category: WaypointCategory;
  title: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface WaypointAttachment {
  localId: string;
  serverId: string | null;
  waypointLocalId: string;
  deviceId: string;
  userId: string;
  type: WaypointAttachmentType;
  localUri: string;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface RecordingSessionSummary {
  status: RecordingStatus;
  activeTripId: string | null;
  activeSegmentId: string | null;
  startedAt: string | null;
  lastPointRecordedAt: string | null;
  interruptedAt: string | null;
  userId: string | null;
  userEmail: string | null;
  deviceId: string | null;
  recordingMode: RecordingMode;
  recordingProfile: RecordingProfile;
  autoCandidateProfile: RecordingProfile | null;
  autoCandidateSince: string | null;
}
