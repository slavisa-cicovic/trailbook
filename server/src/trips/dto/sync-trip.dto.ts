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

export interface SyncTripDto {
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  deviceId: string;
  endedAt: string | null;
  localId: string;
  recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
  segments: SyncTripSegmentDto[];
  startedAt: string;
  title: string;
  updatedAt: string;
  waypoints: SyncWaypointDto[];
  points: SyncTripPointDto[];
}
