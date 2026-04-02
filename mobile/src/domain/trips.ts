export type SyncStatus = "local-only" | "pending-sync" | "synced" | "sync-error";

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
  activeTripId: string | null;
  isRecording: boolean;
  lastPointRecordedAt: string | null;
}
