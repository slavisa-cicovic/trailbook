import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Trip,
  TripGroup,
  TripGroupMember,
  TripPause,
  TripPoint,
  TripSegment,
  Waypoint,
  WaypointAttachment,
} from "../../domain/trips";

const storageMocks = vi.hoisted(() => ({
  loadTripGroupMembers: vi.fn(),
  loadTripGroups: vi.fn(),
  loadTripPauses: vi.fn(),
  loadTripPointsForTrip: vi.fn(),
  loadTripSegmentStatsByTripLocalIds: vi.fn(),
  loadTripStatsByTripLocalIds: vi.fn(),
  loadTripSegments: vi.fn(),
  loadTrips: vi.fn(),
  loadWaypointAttachments: vi.fn(),
  loadWaypoints: vi.fn(),
}));

vi.mock("expo-linking", () => ({
  createURL: vi.fn((path: string) => `trailbook://${path}`),
  parse: vi.fn(() => ({})),
}));

vi.mock("expo", () => ({
  NativeModule: class NativeModule {},
  requireNativeModule: vi.fn(() => ({})),
  requireOptionalNativeModule: vi.fn(() => null),
}));

vi.mock("expo-asset", () => ({
  Asset: {
    fromModule: vi.fn(() => ({
      downloadAsync: vi.fn().mockResolvedValue(undefined),
      uri: "",
    })),
  },
}));

vi.mock("expo-constants", () => ({
  default: {
    appOwnership: "standalone",
    expoConfig: null,
  },
  ExecutionEnvironment: {
    Bare: "bare",
    Standalone: "standalone",
    StoreClient: "storeClient",
  },
}));

vi.mock("expo/src/winter/runtime", () => ({}));
vi.mock("expo/src/winter/runtime.native", () => ({}));

vi.mock("expo-modules-core", () => ({
  EventEmitter: class EventEmitter {},
  NativeModule: class NativeModule {},
  Platform: { OS: "test" },
  UnavailabilityError: class UnavailabilityError extends Error {},
  requireNativeModule: vi.fn(() => ({})),
  requireOptionalNativeModule: vi.fn(() => null),
}));

vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: vi.fn().mockResolvedValue({}),
  openDatabaseSync: vi.fn(() => ({
    execSync: vi.fn(),
    getFirstSync: vi.fn(),
    runSync: vi.fn(),
  })),
}));

vi.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: vi.fn(() => ({
    $client: {},
  })),
}));

vi.mock("drizzle-orm/expo-sqlite/migrator", () => ({
  migrate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/drizzle/db", () => ({
  getDrizzleDatabase: vi.fn(),
  getDrizzleMigrationState: vi.fn(),
  runExclusiveDrizzleWrite: vi.fn(),
}));

vi.mock("../../storage/trips-storage", () => ({
  loadTrips: storageMocks.loadTrips,
  saveTrips: vi.fn(),
}));

vi.mock("../../storage/trip-groups-storage", () => ({
  loadTripGroups: storageMocks.loadTripGroups,
}));

vi.mock("../../storage/trip-group-members-storage", () => ({
  loadTripGroupMembers: storageMocks.loadTripGroupMembers,
}));

vi.mock("../../storage/trip-segments-storage", () => ({
  loadTripSegments: storageMocks.loadTripSegments,
}));

vi.mock("../../storage/trip-pauses-storage", () => ({
  loadTripPauses: storageMocks.loadTripPauses,
}));

vi.mock("../../storage/waypoints-storage", () => ({
  loadWaypoints: storageMocks.loadWaypoints,
}));

vi.mock("../../storage/waypoint-attachments-storage", () => ({
  loadWaypointAttachments: storageMocks.loadWaypointAttachments,
}));

vi.mock("../../storage/trip-points-storage", () => ({
  loadTripPointsForTrip: storageMocks.loadTripPointsForTrip,
  loadTripSegmentStatsByTripLocalIds: storageMocks.loadTripSegmentStatsByTripLocalIds,
  loadTripStatsByTripLocalIds: storageMocks.loadTripStatsByTripLocalIds,
}));

const { getTripRouteScreenModel, listTripsScreenItems } = await import(
  "../../repositories/trips-repository"
);

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

function makeWaypointAttachment(
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

function makeTripPause(overrides: Partial<TripPause> & Pick<TripPause, "localId" | "startedAt">): TripPause {
  const tripPause: TripPause = {
    createdAt: overrides.startedAt,
    deviceId: "device-1",
    endedAt: "2026-06-01T10:09:00.000Z",
    localId: overrides.localId,
    serverId: null,
    startedAt: overrides.startedAt,
    syncStatus: "local-only",
    tripLocalId: "trip-2",
    updatedAt: overrides.startedAt,
    userId: "user-1",
  };

  return {
    ...tripPause,
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

    storageMocks.loadTrips.mockResolvedValue([
      makeTrip({ localId: "trip-1", startedAt: "2026-06-01T09:00:00.000Z" }),
      makeTrip({ localId: "trip-2", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTrip({ localId: "trip-3", startedAt: "2026-06-01T11:00:00.000Z" }),
    ]);
    storageMocks.loadTripGroups.mockResolvedValue([makeGroup({ localId: "group-1" })]);
    storageMocks.loadTripGroupMembers.mockResolvedValue([
      makeGroupMember({ localId: "member-1", sortOrder: 0, tripLocalId: "trip-1" }),
      makeGroupMember({ localId: "member-2", sortOrder: 1, tripLocalId: "trip-2" }),
      makeGroupMember({ localId: "member-3", sortOrder: 2, tripLocalId: "trip-3" }),
    ]);
    storageMocks.loadTripSegments.mockResolvedValue([
      makeTripSegment({ localId: "segment-2", startedAt: "2026-06-01T10:10:00.000Z" }),
      makeTripSegment({ localId: "segment-1", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTripSegment({ localId: "other-segment", startedAt: "2026-06-01T10:00:00.000Z", tripLocalId: "trip-1" }),
    ]);
    storageMocks.loadTripPauses.mockResolvedValue([
      makeTripPause({ localId: "pause-1", startedAt: "2026-06-01T10:08:00.000Z" }),
    ]);
    storageMocks.loadWaypoints.mockResolvedValue([
      makeWaypoint({ localId: "waypoint-2", createdAt: "2026-06-01T10:20:00.000Z" }),
      makeWaypoint({ localId: "deleted-waypoint", createdAt: "2026-06-01T10:15:00.000Z", deletedAt: "2026-06-01T10:16:00.000Z" }),
      makeWaypoint({ localId: "waypoint-1", createdAt: "2026-06-01T10:05:00.000Z" }),
    ]);
    storageMocks.loadWaypointAttachments.mockResolvedValue([
      makeWaypointAttachment({
        localId: "attachment-1",
        createdAt: "2026-06-01T10:06:00.000Z",
        waypointLocalId: "waypoint-1",
      }),
      makeWaypointAttachment({
        localId: "attachment-deleted",
        createdAt: "2026-06-01T10:07:00.000Z",
        deletedAt: "2026-06-01T10:08:00.000Z",
        waypointLocalId: "waypoint-2",
      }),
    ]);
    storageMocks.loadTripPointsForTrip.mockResolvedValue([tripPoint]);
    storageMocks.loadTripStatsByTripLocalIds.mockResolvedValue(new Map([["trip-2", tripStats]]));
    storageMocks.loadTripSegmentStatsByTripLocalIds.mockResolvedValue(segmentStats);

    const model = await getTripRouteScreenModel({
      groupLocalId: "group-1",
      tripLocalId: "trip-2",
      userId: "user-1",
    });

    expect(model?.trip.localId).toBe("trip-2");
    expect(model?.tripPoints).toEqual([tripPoint]);
    expect(model?.tripSegments.map((segment) => segment.localId)).toEqual(["segment-1", "segment-2"]);
    expect(model?.waypoints.map((waypoint) => waypoint.localId)).toEqual(["waypoint-1", "waypoint-2"]);
    expect(model?.selectedTripWaypoints.map((waypoint) => waypoint.localId)).toEqual(["waypoint-1", "waypoint-2"]);
    expect(model?.selectedTripAttachments.map((attachment) => attachment.localId)).toEqual(["attachment-1"]);
    expect(model?.waypointMarkers).toEqual([
      {
        firstPhotoUri: "file://attachment-1.jpg",
        hasPhotos: true,
        waypoint: expect.objectContaining({ localId: "waypoint-1" }),
      },
      {
        firstPhotoUri: null,
        hasPhotos: false,
        waypoint: expect.objectContaining({ localId: "waypoint-2" }),
      },
    ]);
    expect(model?.selectedTripTimeline.map((entry) => entry.type)).toEqual(["segment", "pause", "segment"]);
    expect(model?.tripStats).toEqual({
      distanceMeters: 123,
      pointCount: 2,
      statsUpdatedAt: "2026-06-01T10:30:00.000Z",
      tripLocalId: "trip-2",
    });
    expect(model?.segmentStatsBySegmentId).toBe(segmentStats);
    expect(model?.navigation).toEqual({
      groupLocalId: "group-1",
      nextTripLocalId: "trip-1",
      previousTripLocalId: "trip-3",
    });
  });

  it("returns trips list items with stats and group info", async () => {
    storageMocks.loadTrips.mockResolvedValue([
      makeTrip({ localId: "trip-1", startedAt: "2026-06-01T09:00:00.000Z" }),
      makeTrip({ localId: "trip-2", startedAt: "2026-06-01T10:00:00.000Z" }),
      makeTrip({ localId: "trip-deleted", startedAt: "2026-06-01T11:00:00.000Z", deletedAt: "2026-06-01T12:00:00.000Z" }),
    ]);
    storageMocks.loadTripGroups.mockResolvedValue([makeGroup({ localId: "group-1", title: "Krf" })]);
    storageMocks.loadTripGroupMembers.mockResolvedValue([
      makeGroupMember({ localId: "member-1", sortOrder: 0, tripLocalId: "trip-2" }),
    ]);
    storageMocks.loadTripStatsByTripLocalIds.mockResolvedValue(new Map([
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
