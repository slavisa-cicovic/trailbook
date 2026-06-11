import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Trip, TripPoint, Waypoint, WaypointAttachment } from "../../domain/trips";
import {
  getWaypointPhotoViewerModel,
  getWaypointScreenModel,
} from "../../repositories/waypoints-repository";
import { loadTripPointsForTrip } from "../../storage/trip-points-storage";
import { loadTrips } from "../../storage/trips-storage";
import { loadWaypointAttachments } from "../../storage/waypoint-attachments-storage";
import { loadWaypoints } from "../../storage/waypoints-storage";

vi.mock("../../storage/trips-storage", () => ({
  loadTrips: vi.fn(),
}));

vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: vi.fn(),
  saveWaypoints: vi.fn(),
}));

vi.mock("../../storage/waypoint-attachments-storage", () => ({
  loadWaypointAttachments: vi.fn(),
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: vi.fn(),
}));

function makeTrip(overrides: Partial<Trip> & Pick<Trip, "localId">): Trip {
  const trip: Trip = {
    batteryEndLevelPercent: null,
    batteryEndState: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    createdAt: "2026-06-01T10:00:00.000Z",
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
    startedAt: "2026-06-01T10:00:00.000Z",
    statsUpdatedAt: null,
    status: "ended",
    syncStatus: "local-only",
    title: overrides.localId,
    updatedAt: "2026-06-01T10:00:00.000Z",
    userId: "user-1",
  };

  return {
    ...trip,
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
    tripLocalId: "trip-1",
    updatedAt: overrides.createdAt,
    userId: "user-1",
  };

  return {
    ...waypoint,
    ...overrides,
  };
}

function makeAttachment(
  overrides: Partial<WaypointAttachment> & Pick<WaypointAttachment, "localId" | "createdAt" | "waypointLocalId">,
): WaypointAttachment {
  const attachment: WaypointAttachment = {
    createdAt: overrides.createdAt,
    deletedAt: null,
    deviceId: "device-1",
    fileSize: null,
    localId: overrides.localId,
    localUri: `file://${overrides.localId}.jpg`,
    mimeType: "image/jpeg",
    serverId: null,
    syncStatus: "local-only",
    type: "photo",
    updatedAt: overrides.createdAt,
    userId: "user-1",
    waypointLocalId: overrides.waypointLocalId,
  };

  return {
    ...attachment,
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
  recordedAt: "2026-06-01T10:01:00.000Z",
  segmentLocalId: null,
  serverId: null,
  speed: null,
  syncStatus: "local-only",
  tripLocalId: "trip-1",
  userId: "user-1",
};

describe("waypoints repository read models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns waypoint model with ordered navigation and visible attachments", async () => {
    vi.mocked(loadTrips).mockResolvedValue([makeTrip({ localId: "trip-1", title: "Route" })]);
    vi.mocked(loadWaypoints).mockResolvedValue([
      makeWaypoint({ localId: "waypoint-1", createdAt: "2026-06-01T10:01:00.000Z" }),
      makeWaypoint({ localId: "waypoint-2", createdAt: "2026-06-01T10:02:00.000Z" }),
      makeWaypoint({ localId: "waypoint-3", createdAt: "2026-06-01T10:03:00.000Z" }),
    ]);
    vi.mocked(loadWaypointAttachments).mockResolvedValue([
      makeAttachment({
        localId: "attachment-2",
        createdAt: "2026-06-01T10:04:00.000Z",
        waypointLocalId: "waypoint-2",
      }),
      makeAttachment({
        localId: "attachment-deleted",
        createdAt: "2026-06-01T10:03:00.000Z",
        deletedAt: "2026-06-01T10:05:00.000Z",
        waypointLocalId: "waypoint-2",
      }),
    ]);
    vi.mocked(loadTripPointsForTrip).mockResolvedValue([]);

    const model = await getWaypointScreenModel({
      tripLocalId: "trip-1",
      userId: "user-1",
      waypointLocalId: "waypoint-2",
    });

    expect(model?.trip.title).toBe("Route");
    expect(model?.navigation).toEqual({
      nextWaypointLocalId: "waypoint-3",
      previousWaypointLocalId: "waypoint-1",
    });
    expect(model?.attachments.map((attachment) => attachment.localId)).toEqual(["attachment-2"]);
  });

  it("returns photo viewer model with route coordinates and neighboring photo waypoints", async () => {
    vi.mocked(loadTrips).mockResolvedValue([makeTrip({ localId: "trip-1" })]);
    vi.mocked(loadWaypoints).mockResolvedValue([
      makeWaypoint({ localId: "waypoint-1", createdAt: "2026-06-01T10:01:00.000Z" }),
      makeWaypoint({ localId: "waypoint-2", createdAt: "2026-06-01T10:02:00.000Z" }),
      makeWaypoint({ localId: "waypoint-3", createdAt: "2026-06-01T10:03:00.000Z" }),
    ]);
    vi.mocked(loadWaypointAttachments).mockResolvedValue([
      makeAttachment({
        localId: "attachment-1",
        createdAt: "2026-06-01T10:01:30.000Z",
        waypointLocalId: "waypoint-1",
      }),
      makeAttachment({
        localId: "attachment-2",
        createdAt: "2026-06-01T10:02:30.000Z",
        waypointLocalId: "waypoint-2",
      }),
      makeAttachment({
        localId: "attachment-3",
        createdAt: "2026-06-01T10:03:30.000Z",
        waypointLocalId: "waypoint-3",
      }),
    ]);
    vi.mocked(loadTripPointsForTrip).mockResolvedValue([tripPoint]);

    const model = await getWaypointPhotoViewerModel({
      selectedAttachmentLocalId: "attachment-2",
      tripLocalId: "trip-1",
      userId: "user-1",
      waypointLocalId: "waypoint-2",
    });

    expect(model?.selectedAttachment?.localId).toBe("attachment-2");
    expect(model?.routeCoordinates).toEqual([{ latitude: 45, longitude: 19 }]);
    expect(model?.nextPhotoWaypoint?.waypointLocalId).toBe("waypoint-1");
    expect(model?.previousPhotoWaypoint?.waypointLocalId).toBe("waypoint-3");
  });
});
