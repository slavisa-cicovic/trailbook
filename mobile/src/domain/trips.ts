export type SyncStatus = "local-only" | "pending-sync" | "synced" | "sync-error";
export type RecordingStatus = "idle" | "recording" | "interrupted";

export interface Trip {
  localId: string;
  serverId: string | null;
  deviceId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface TripPoint {
  localId: string;
  serverId: string | null;
  tripLocalId: string;
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
  deviceId: string;
  userId: string;
  latitude: number;
  longitude: number;
  title: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface RecordingSessionSummary {
  status: RecordingStatus;
  activeTripId: string | null;
  startedAt: string | null;
  lastPointRecordedAt: string | null;
  interruptedAt: string | null;
  userId: string | null;
  userEmail: string | null;
  deviceId: string | null;
}
