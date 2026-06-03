import type { RecordingProfile, WaypointCategory } from "./trips";

export interface SharedTripOwner {
  displayName: string;
  email: string;
  id: string;
}

export interface SharedTripSummary {
  owner: SharedTripOwner;
  shareId: string;
  sharedAt: string;
  trip: {
    description: string | null;
    endedAt: string | null;
    id: string;
    recordingProfile: RecordingProfile;
    segmentCount: number;
    startedAt: string;
    title: string;
    updatedAt: string;
    waypointCount: number;
  };
}

export interface SharedTripDetail {
  owner: SharedTripOwner;
  shareId: string;
  sharedAt: string;
  trip: {
    createdAt: string;
    description: string | null;
    endedAt: string | null;
    id: string;
    pointCount: number | null;
    distanceMeters: number | null;
    statsUpdatedAt: string | null;
    points: {
      accuracy: number | null;
      altitude: number | null;
      id: string;
      latitude: number;
      longitude: number;
      recordedAt: string;
      segmentId: string | null;
      speed: number | null;
    }[];
    recordingProfile: RecordingProfile;
    segments: {
      createdAt: string;
      endedAt: string | null;
      id: string;
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
    attachments: {
      createdAt: string;
      fileSizeBytes: number | null;
      id: string;
      mimeType: string | null;
      updatedAt: string;
      waypointId: string;
    }[];
    waypoints: {
      category: WaypointCategory;
      createdAt: string;
      id: string;
      latitude: number;
      longitude: number;
      note: string | null;
      segmentId: string | null;
      title: string;
      updatedAt: string;
    }[];
  };
}
