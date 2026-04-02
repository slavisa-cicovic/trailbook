export interface SyncTripPointDto {
  localId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
}

export interface SyncWaypointDto {
  localId: string;
  latitude: number;
  longitude: number;
  title: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncTripDto {
  localId: string;
  deviceId: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  points: SyncTripPointDto[];
  waypoints: SyncWaypointDto[];
}
