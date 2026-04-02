export interface TripRecord {
  id: string;
  userId: string;
  deviceId: string;
  startedAtUtc: string;
  endedAtUtc: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface TripPointRecord {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  recordedAtUtc: string;
  accuracy: number | null;
}

export interface WaypointRecord {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  title: string;
  note: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
}
