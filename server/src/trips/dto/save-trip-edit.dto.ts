import type { RecordingProfile, WaypointCategory } from "@prisma/client";

export interface SaveTripEditDto {
  trip: {
    title: string;
    description: string | null;
  };
  segments: Array<{
    localId: string;
    recordingProfile: RecordingProfile;
    startedAt: string;
    endedAt: string | null;
    distanceMeters: number;
  }>;
  points: Array<{
    localId: string;
    latitude: number;
    longitude: number;
    recordedAt: string;
    segmentLocalId: string | null;
    accuracy?: number | null;
    altitude?: number | null;
    speed?: number | null;
  }>;
  waypoints: Array<{
    localId: string;
    title: string;
    note: string | null;
    latitude: number;
    longitude: number;
    recordedAt: string;
    photoCount: number;
    category: WaypointCategory;
    segmentLocalId: string | null;
  }>;
  pauses: Array<{
    startedAt: string;
    endedAt: string | null;
  }>;
}
