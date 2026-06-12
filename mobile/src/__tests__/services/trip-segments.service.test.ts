import { beforeAll, describe, expect, it, vi } from "vitest";

import type { TripPoint, TripSegment } from "../../domain/trips";

vi.mock("../../services/trip-points/trip-points.service", () => ({
  getVisibleTripPointsForTrip: vi.fn(
    (tripPoints: TripPoint[], tripLocalId: string) =>
      tripPoints.filter((tripPoint) => tripPoint.tripLocalId === tripLocalId),
  ),
}));

vi.mock("../../services/trips/trip-distance.service", () => ({
  calculateTripDistanceMeters: vi.fn((tripPoints: TripPoint[]) => {
    if (tripPoints.length < 2) {
      return 0;
    }

    const latitudes = tripPoints.map((tripPoint) => tripPoint.latitude);
    return (Math.max(...latitudes) - Math.min(...latitudes)) * 111_000;
  }),
}));

vi.mock("../../services/trips/trips-management.service", () => ({
  formatDurationSummary: vi.fn((durationMs: number) => `${durationMs}ms`),
}));

let normalizeAutoClosedTripSegment: typeof import(
  "../../services/trip-segments/trip-segments.service"
).normalizeAutoClosedTripSegment;

beforeAll(async () => {
  ({ normalizeAutoClosedTripSegment } = await import("../../services/trip-segments/trip-segments.service"));
});

const BASE_MS = Date.UTC(2026, 5, 12, 8, 0, 0);

function iso(minutes: number): string {
  return new Date(BASE_MS + minutes * 60_000).toISOString();
}

function segment(
  localId: string,
  recordingProfile: TripSegment["recordingProfile"],
  startedAtMinutes: number,
  endedAtMinutes: number | null,
): TripSegment {
  return {
    createdAt: iso(startedAtMinutes),
    deviceId: "device-1",
    distanceMeters: 0,
    durationMs: 0,
    endedAt: endedAtMinutes === null ? null : iso(endedAtMinutes),
    localId,
    pointCount: 0,
    recordingProfile,
    serverId: null,
    startedAt: iso(startedAtMinutes),
    statsUpdatedAt: iso(startedAtMinutes),
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    updatedAt: endedAtMinutes === null ? iso(startedAtMinutes) : iso(endedAtMinutes),
    userId: "user-1",
  };
}

function point(localId: string, segmentLocalId: string, minutes: number, latitude: number): TripPoint {
  return {
    accuracy: 5,
    altitude: null,
    deviceId: "device-1",
    latitude,
    localId,
    longitude: 19.811,
    recordedAt: iso(minutes),
    segmentLocalId,
    serverId: null,
    speed: 10,
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    userId: "user-1",
  };
}

describe("normalizeAutoClosedTripSegment", () => {
  it("keeps short drive segments when actual points contain enough distance evidence", () => {
    const tripSegments = [
      segment("walk-1", "walk", 0, 10),
      segment("drive-1", "drive", 10, 13),
      segment("walk-2", "walk", 13, null),
    ];
    const tripPoints = [
      point("drive-point-1", "drive-1", 10, 45.01),
      point("drive-point-2", "drive-1", 11, 45.016),
      point("drive-point-3", "drive-1", 12, 45.02),
    ];

    const result = normalizeAutoClosedTripSegment(tripSegments, tripPoints, [], "trip-1", iso(13));

    expect(result.tripSegments.find((candidate) => candidate.localId === "drive-1")?.recordingProfile).toBe("drive");
  });

  it("still folds weak short drive segments into the surrounding ground profile", () => {
    const tripSegments = [
      segment("walk-1", "walk", 0, 10),
      segment("drive-1", "drive", 10, 12),
      segment("walk-2", "walk", 12, null),
    ];
    const tripPoints = [
      point("drive-point-1", "drive-1", 10, 45.01),
      point("drive-point-2", "drive-1", 11, 45.01001),
    ];

    const result = normalizeAutoClosedTripSegment(tripSegments, tripPoints, [], "trip-1", iso(12));

    expect(result.tripSegments.some((candidate) => candidate.recordingProfile === "drive")).toBe(false);
  });
});
