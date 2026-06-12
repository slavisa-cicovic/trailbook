import { z } from "zod";

const RecordingProfileSchema = z.enum(["walk", "bike", "drive", "boat", "plane", "stationary"]);

const WaypointCategorySchema = z.enum([
  "generic", "departure", "fuel", "border", "port", "ferry",
  "restaurant", "cafe", "viewpoint", "monument", "beach",
]);

const SharedTripOwnerSchema = z.object({
  displayName: z.string(),
  email: z.string(),
  id: z.string(),
});

export const SharedTripSummarySchema = z.object({
  owner: SharedTripOwnerSchema,
  shareId: z.string(),
  sharedAt: z.string(),
  trip: z.object({
    description: z.string().nullable(),
    endedAt: z.string().nullable(),
    id: z.string(),
    recordingProfile: RecordingProfileSchema,
    segmentCount: z.number(),
    startedAt: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    waypointCount: z.number(),
  }),
});

export const ListSharedTripsResponseSchema = z.object({
  sharedTrips: z.array(SharedTripSummarySchema),
});

export const SharedTripDetailSchema = z.object({
  owner: SharedTripOwnerSchema,
  shareId: z.string(),
  sharedAt: z.string(),
  trip: z.object({
    createdAt: z.string(),
    description: z.string().nullable(),
    distanceMeters: z.number().nullable(),
    endedAt: z.string().nullable(),
    id: z.string(),
    pointCount: z.number().nullable(),
    statsUpdatedAt: z.string().nullable(),
    points: z.array(z.object({
      accuracy: z.number().nullable(),
      altitude: z.number().nullable(),
      id: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      recordedAt: z.string(),
      segmentId: z.string().nullable(),
      speed: z.number().nullable(),
    })),
    recordingProfile: RecordingProfileSchema,
    segments: z.array(z.object({
      createdAt: z.string(),
      distanceMeters: z.number().nullable(),
      durationMs: z.number().nullable(),
      endedAt: z.string().nullable(),
      id: z.string(),
      pointCount: z.number().nullable(),
      recordingProfile: RecordingProfileSchema,
      startedAt: z.string(),
      statsUpdatedAt: z.string().nullable(),
      updatedAt: z.string(),
    })),
    startedAt: z.string(),
    title: z.string(),
    updatedAt: z.string(),
    attachments: z.array(z.object({
      createdAt: z.string(),
      fileSizeBytes: z.number().nullable(),
      id: z.string(),
      mimeType: z.string().nullable(),
      updatedAt: z.string(),
      waypointId: z.string(),
    })),
    waypoints: z.array(z.object({
      category: WaypointCategorySchema,
      createdAt: z.string(),
      id: z.string(),
      latitude: z.number(),
      longitude: z.number(),
      note: z.string().nullable(),
      segmentId: z.string().nullable(),
      title: z.string(),
      updatedAt: z.string(),
    })),
  }),
});
