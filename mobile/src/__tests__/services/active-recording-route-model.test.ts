import { describe, expect, it, vi } from "vitest";

import type { RecordingSessionSummary, Trip, TripPoint, TripSegment } from "../../domain/trips";
import { buildActiveRecordingRouteModel } from "../../services/recording/active-recording-route-model";

vi.mock("../../services/trip-points/trip-points.service", () => ({
  getVisibleTripPointsForTrip: (tripPoints: TripPoint[], tripLocalId: string) =>
    tripPoints
      .filter((p) => p.tripLocalId === tripLocalId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt)),
}));

const activeTrip: Trip = {
  batteryEndLevelPercent: null,
  batteryEndState: null,
  batteryStartLevelPercent: null,
  batteryStartState: null,
  createdAt: "2026-06-02T09:00:00.000Z",
  deletedAt: null,
  description: null,
  deviceId: "device-1",
  distanceMeters: 0,
  endedAt: null,
  localId: "trip-1",
  pointCount: 0,
  recordingConfig: null,
  recordingProfile: "walk",
  serverId: null,
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:00:00.000Z",
  status: "active",
  syncStatus: "local-only",
  title: "Active trip",
  updatedAt: "2026-06-02T09:00:00.000Z",
  userId: "user-1",
};

const endedTrip: Trip = {
  ...activeTrip,
  localId: "trip-2",
  status: "ended",
  endedAt: "2026-06-02T09:10:00.000Z",
};

const activeSegment: TripSegment = {
  createdAt: "2026-06-02T09:00:00.000Z",
  deviceId: "device-1",
  distanceMeters: 0,
  durationMs: 0,
  endedAt: null,
  localId: "seg-1",
  pointCount: 0,
  recordingProfile: "walk",
  serverId: null,
  startedAt: "2026-06-02T09:00:00.000Z",
  statsUpdatedAt: "2026-06-02T09:00:00.000Z",
  syncStatus: "local-only",
  tripLocalId: "trip-1",
  updatedAt: "2026-06-02T09:00:00.000Z",
  userId: "user-1",
};

const otherSegment: TripSegment = {
  ...activeSegment,
  localId: "seg-other",
  tripLocalId: "trip-2",
};

const tripPoint: TripPoint = {
  accuracy: 8,
  altitude: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "pt-1",
  longitude: 19,
  recordedAt: "2026-06-02T09:01:00.000Z",
  segmentLocalId: "seg-1",
  serverId: null,
  speed: 1,
  syncStatus: "local-only",
  tripLocalId: "trip-1",
  userId: "user-1",
};

const idleSession: RecordingSessionSummary = {
  activeTripId: null,
  activeSegmentId: null,
  autoCandidateProfile: null,
  autoCandidateSince: null,
  deviceId: null,
  interruptedAt: null,
  lastPointRecordedAt: null,
  motionActivityConfidence: null,
  motionActivityRecordedAt: null,
  motionActivitySourcePlatform: null,
  motionActivityType: null,
  recordingMode: "auto",
  recordingProfile: "walk",
  startedAt: null,
  status: "idle",
  userEmail: null,
  userId: null,
};

const recordingSession: RecordingSessionSummary = {
  activeTripId: "trip-1",
  activeSegmentId: "seg-1",
  autoCandidateProfile: null,
  autoCandidateSince: null,
  deviceId: "device-1",
  interruptedAt: null,
  lastPointRecordedAt: "2026-06-02T09:01:00.000Z",
  motionActivityConfidence: null,
  motionActivityRecordedAt: null,
  motionActivitySourcePlatform: null,
  motionActivityType: null,
  recordingMode: "auto",
  recordingProfile: "walk",
  startedAt: "2026-06-02T09:00:00.000Z",
  status: "recording",
  userEmail: "test@example.com",
  userId: "user-1",
};

describe("buildActiveRecordingRouteModel", () => {
  it("returns null activeTrip and empty arrays when session is idle", () => {
    const result = buildActiveRecordingRouteModel({
      recordingSession: idleSession,
      trips: [endedTrip],
      tripSegments: [otherSegment],
      tripPoints: [{ ...tripPoint, tripLocalId: "trip-2" }],
    });

    expect(result.activeTrip).toBeNull();
    expect(result.activeTripPoints).toHaveLength(0);
    expect(result.activeTripSegments).toHaveLength(0);
    expect(result.lastPointRecordedAt).toBeNull();
    expect(result.session.status).toBe("idle");
  });

  it("returns active trip and its points and segments when recording", () => {
    const result = buildActiveRecordingRouteModel({
      recordingSession,
      trips: [activeTrip, endedTrip],
      tripSegments: [activeSegment, otherSegment],
      tripPoints: [tripPoint, { ...tripPoint, localId: "pt-2", recordedAt: "2026-06-02T09:02:00.000Z" }],
    });

    expect(result.activeTrip?.localId).toBe("trip-1");
    expect(result.activeTripPoints).toHaveLength(2);
    expect(result.activeTripSegments).toHaveLength(1);
    expect(result.activeTripSegments[0]!.localId).toBe("seg-1");
    expect(result.lastPointRecordedAt).toBe("2026-06-02T09:01:00.000Z");
  });

  it("excludes points belonging to other trips", () => {
    const result = buildActiveRecordingRouteModel({
      recordingSession,
      trips: [activeTrip],
      tripSegments: [activeSegment],
      tripPoints: [
        tripPoint,
        { ...tripPoint, localId: "pt-other", tripLocalId: "trip-2" },
      ],
    });

    expect(result.activeTripPoints).toHaveLength(1);
    expect(result.activeTripPoints[0]!.localId).toBe("pt-1");
  });

  it("returns null activeTrip when activeTripId matches a non-active trip", () => {
    const result = buildActiveRecordingRouteModel({
      recordingSession,
      trips: [endedTrip, { ...activeTrip, localId: "trip-1", status: "paused" }],
      tripSegments: [],
      tripPoints: [],
    });

    expect(result.activeTrip).toBeNull();
  });

  it("orders trip points by recordedAt", () => {
    const pt1: TripPoint = { ...tripPoint, localId: "pt-1", recordedAt: "2026-06-02T09:02:00.000Z" };
    const pt2: TripPoint = { ...tripPoint, localId: "pt-2", recordedAt: "2026-06-02T09:01:00.000Z" };

    const result = buildActiveRecordingRouteModel({
      recordingSession,
      trips: [activeTrip],
      tripSegments: [],
      tripPoints: [pt1, pt2],
    });

    expect(result.activeTripPoints[0]!.recordedAt).toBe("2026-06-02T09:01:00.000Z");
    expect(result.activeTripPoints[1]!.recordedAt).toBe("2026-06-02T09:02:00.000Z");
  });
});
