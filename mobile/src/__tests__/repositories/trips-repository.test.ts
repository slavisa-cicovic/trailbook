import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Trip,
  TripGroup,
  TripGroupMember,
  TripPoint,
  TripSegment,
  Waypoint,
} from "../../domain/trips";
import { getTripRouteScreenModel, listTripsScreenItems } from "../../repositories/trips-repository";
import { loadTripGroupMembers } from "../../storage/trip-group-members-storage";
import { loadTripGroups } from "../../storage/trip-groups-storage";
import {
  loadTripPointsForTrip,
  loadTripSegmentStatsByTripLocalIds,
  loadTripStatsByTripLocalIds,
} from "../../storage/trip-points-storage";
import { loadTripSegments } from "../../storage/trip-segments-storage";
import { loadTrips } from "../../storage/trips-storage";
import { loadWaypoints } from "../../storage/waypoints-storage";

vi.mock("../../storage/trips-storage", () => ({
  loadTrips: vi.fn(),
  saveTrips: vi.fn(),
}));

vi.mock("../../storage/trip-groups-storage", () => ({
  loadTripGroups: vi.fn(),
}));

vi.mock("../../storage/trip-group-members-storage", () => ({
  loadTripGroupMembers: vi.fn(),
}));

vi.mock("../../storage/trip-segments-storage", () => ({
  loadTripSegments: vi.fn(),
}));

vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: vi.fn(),
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn(),
  loadTripSegmentStatsByTripLocalIds: vi.fn(),
  loadTripStatsByTripLocalIds: vi.fn(),
}));

function makeTrip(overrides: Partial<Trip> & Pick<Trip, "localId" | "startedAt">): Trip {
  const trip: Trip = {
    batteryEndLevelPercent: null,
    batteryEndState: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    createdAt: overrides.startedAt,
    deletedAt: null,
    description: null,
    deviceId: "device-1",
    distanceMeters: null,
    endedAt: null,
    localId: overrides.localId,
    pointCount: null,
    recordingConfig: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: overrides.startedAt,
    statsUpdatedAt: null,
    status: "ended",
    syncStatus: "local-only",
    title: overrides.localId,
    updatedAt: overrides.startedAt,
    userId: "user-1",
  };

  return {
    ...trip,
    ...overrides,
  };
}

function makeTripSegment(overrides: Partial<TripSegment> & Pick<TripSegment, "localId" | "startedAt">): TripSegment {
  const tripSegment: TripSegment = {
    createdAt: overrides.startedAt,
    deviceId: "device-1",
    distanceMeters: null,
    durationMs: null,
    endedAt: null,
    localId: overrides.localId,
    pointCount: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: overrides.startedAt,
    statsUpdatedAt: null,
    syncStatus: "local-only",
    tripLocalId: "trip-2",
    updatedAt: overrides.startedAt,
    userId: "user-1",
  };

  return {
    ...tripSegment,
    ...overrides,
  };
}

function makeWaypoint(overrides: Partial<Waypoint> & Pick<Waypoint, "localId" | "createdAt">): Waypoint {
  const waypoint: Waypoint = {
    category: "generic",
    createdAt: overrides.createdAt,
    deletedAt: null,
    deviceId: "device-1",
    latitude: 45,
    localId: overrides.localId,
    longitude: 19,
    note: null,
    segmentLocalId: null,
    serverId: null,
    syncStatus: "local-only",
    title: overrides.localId,
    tripLocalId: "trip-2",
    updatedAt: overrides.createdAt,
    userId: "user-1",
  };

  return {
    ...waypoint,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<TripGroup> & Pick<TripGroup, "localId">): TripGroup {
  const group: TripGroup = {
    createdAt: "2026-06-01T10:00:00.000Z",
    deletedAt: null,
    description: null,
    deviceId: "device-1",
    localId: overrides.localId,
    serverId: null,
    syncStatus: "local-only",
    title: overrides.localId,
    updatedAt: "2026-06-01T10:00:00.000Z",
    userId: "user-1",
  };

  return {
    ...group,
    ...overrides,
  };
}

function makeGroupMember(
  overrides: Partial<TripGroupMember> & Pick<TripGroupMember, "localId" | "sortOrder" | "tripLocalId">,
): TripGroupMember {
  const tripGroupMember: TripGroupMember = {
    createdAt: "2026-06-01T10:00:00.000Z",
    deletedAt: null,
    deviceId: "device-1",
    groupLocalId: "group-1",
    localId: overrides.localId,
    serverId: null,
    sortOrder: overrides.sortOrder,
    syncStatus: "local-only",
    tripLocalId: overrides.tripLocalId,
    updatedAt: "2026-06-01T10:00:00.000Z",
    userId: "user-1",
  };

  return {
    ...tripGroupMember,
    ...overrides,
  };
}

const tripPoint: TripPoint = {
  accuracy: 8,
  altitude: null,
  deviceId: "device-1",
  latitude: 45,
  localId: "point-1",
  longitude: 19,
  recordedAt: "2026-06-01T10:02:00.000Z",
  segmentLocalId: "segment-2",
  serverId: null,
  speed: null,
  syncStatus: "local-only",
  tripLocalId: "trip-2",
  userId: "user-1",
};

describe("trips repository read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sorted route data and group-aware navigation", async () => {
    const tripStats = {
      distance_meters: 123,
      point_count: 2,
      trip_local_id: "trip-2",
      updated_at: "2026-06-01T10:30:00.000Z",
    };
    const segmentStats = new Map([
      [
        "segment-2",
        {
          distance_meters: 50,
          duration_ms: 60000,
          point_count: 2,
          segment_local_id: "segment-2",
          trip_local_id: "trip-2",
          updated_at: "2026-06-01T10:30:00.000Z",
        },
      ],
    ]);

    vi.mocked(loadTrips).mockResolvedValue([
      makeTrip({ localId: "trip-1", startedAt: "2026-06-01T09:00:00.000Z" }),
      makeTrip({ localId: "trip-2", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTrip({ localId: "trip-3", startedAt: "2026-06-01T11:00:00.000Z" }),
    ]);
    vi.mocked(loadTripGroups).mockResolvedValue([makeGroup({ localId: "group-1" })]);
    vi.mocked(loadTripGroupMembers).mockResolvedValue([
      makeGroupMember({ localId: "member-1", sortOrder: 0, tripLocalId: "trip-1" }),
      makeGroupMember({ localId: "member-2", sortOrder: 1, tripLocalId: "trip-2" }),
      makeGroupMember({ localId: "member-3", sortOrder: 2, tripLocalId: "trip-3" }),
    ]);
    vi.mocked(loadTripSegments).mockResolvedValue([
      makeTripSegment({ localId: "segment-2", startedAt: "2026-06-01T10:10:00.000Z" }),
      makeTripSegment({ localId: "segment-1", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTripSegment({ localId: "other-segment", startedAt: "2026-06-01T10:00:00.000Z", tripLocalId: "trip-1" }),
    ]);
    vi.mocked(loadWaypoints).mockResolvedValue([
      makeWaypoint({ localId: "waypoint-2", createdAt: "2026-06-01T10:20:00.000Z" }),
      makeWaypoint({ localId: "deleted-waypoint", createdAt: "2026-06-01T10:15:00.000Z", deletedAt: "2026-06-01T10:16:00.000Z" }),
      makeWaypoint({ localId: "waypoint-1", createdAt: "2026-06-01T10:05:00.000Z" }),
    ]);
    vi.mocked(loadTripPointsForTrip).mockResolvedValue([tripPoint]);
    vi.mocked(loadTripStatsByTripLocalIds).mockResolvedValue(new Map([["trip-2", tripStats]]));
    vi.mocked(loadTripSegmentStatsByTripLocalIds).mockResolvedValue(segmentStats);

    const model = await getTripRouteScreenModel({
      groupLocalId: "group-1",
      tripLocalId: "trip-2",
      userId: "user-1",
    });

    expect(model?.trip.localId).toBe("trip-2");
    expect(model?.tripPoints).toEqual([tripPoint]);
    expect(model?.tripSegments.map((segment) => segment.localId)).toEqual(["segment-1", "segment-2"]);
    expect(model?.waypoints.map((waypoint) => waypoint.localId)).toEqual(["waypoint-1", "waypoint-2"]);
    expect(model?.tripStats).toEqual({
      distanceMeters: 123,
      pointCount: 2,
      statsUpdatedAt: "2026-06-01T10:30:00.000Z",
      tripLocalId: "trip-2",
    });
    expect(model?.segmentStatsBySegmentId).toBe(segmentStats);
    expect(model?.navigation).toEqual({
      nextTripLocalId: "trip-3",
      previousTripLocalId: "trip-1",
    });
  });

  it("returns trips list items with stats and group info", async () => {
    vi.mocked(loadTrips).mockResolvedValue([
      makeTrip({ localId: "trip-1", startedAt: "2026-06-01T09:00:00.000Z" }),
      makeTrip({ localId: "trip-2", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTrip({ localId: "trip-deleted", startedAt: "2026-06-01T11:00:00.000Z", deletedAt: "2026-06-01T12:00:00.000Z" }),
    ]);
    vi.mocked(loadTripGroups).mockResolvedValue([makeGroup({ localId: "group-1", title: "Krf" })]);
    vi.mocked(loadTripGroupMembers).mockResolvedValue([
      makeGroupMember({ localId: "member-1", sortOrder: 0, tripLocalId: "trip-2" }),
    ]);
    vi.mocked(loadTripStatsByTripLocalIds).mockResolvedValue(new Map([
      [
        "trip-2",
        {
          distance_meters: 250,
          point_count: 10,
          trip_local_id: "trip-2",
          updated_at: "2026-06-01T10:30:00.000Z",
        },
      ],
    ]));

    const items = await listTripsScreenItems({
      tripLocalIds: ["trip-1", "trip-2", "trip-deleted"],
      userId: "user-1",
    });

    expect(items.map((item) => item.trip.localId)).toEqual(["trip-2", "trip-1"]);
    expect(items[0].stats).toEqual({
      distanceMeters: 250,
      pointCount: 10,
      statsUpdatedAt: "2026-06-01T10:30:00.000Z",
      tripLocalId: "trip-2",
    });
    expect(items[0].groupInfo).toEqual({
      groupCount: 1,
      primaryGroupTitle: "Krf",
    });
    expect(items[1].stats).toBeNull();
  });
});
