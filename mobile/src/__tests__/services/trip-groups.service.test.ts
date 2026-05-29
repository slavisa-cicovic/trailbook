import { describe, expect, it } from "vitest";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { Trip, TripGroup, TripGroupMember } from "../../domain/trips";
import {
  buildTripGroupMembersForTrips,
  buildTripGroupSummaries,
  createTripGroup,
  getVisibleTripGroupMembers,
  getVisibleTripGroups,
} from "../../services/trips/trip-groups.service";

function makeSession(overrides?: Partial<AuthenticatedDeviceSession>): AuthenticatedDeviceSession {
  return {
    mode: "authenticated",
    userId: "user-1",
    userEmail: "test@example.com",
    displayName: "Test User",
    deviceId: "device-1",
    sessionToken: "token",
    sessionExpiresAt: null,
    refreshToken: null,
    refreshExpiresAt: null,
    providers: ["local"],
    role: "user",
    ...overrides,
  };
}

function makeTrip(overrides: Partial<Trip> & Pick<Trip, "localId">): Trip {
  return {
    serverId: null,
    deviceId: "device-1",
    userId: "user-1",
    title: "Trip",
    description: null,
    recordingProfile: "walk",
    recordingConfig: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    batteryEndLevelPercent: null,
    batteryEndState: null,
    pointCount: null,
    distanceMeters: null,
    statsUpdatedAt: null,
    status: "ended",
    startedAt: "2024-01-01T10:00:00.000Z",
    endedAt: "2024-01-01T11:00:00.000Z",
    createdAt: "2024-01-01T10:00:00.000Z",
    updatedAt: "2024-01-01T10:00:00.000Z",
    deletedAt: null,
    syncStatus: "local-only",
    ...overrides,
  };
}

function makeGroup(overrides: Partial<TripGroup> & Pick<TripGroup, "localId">): TripGroup {
  return {
    serverId: null,
    deviceId: "device-1",
    userId: "user-1",
    title: "Group",
    description: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
    syncStatus: "local-only",
    ...overrides,
  };
}

function makeMember(
  overrides: Partial<TripGroupMember> & Pick<TripGroupMember, "localId" | "groupLocalId" | "tripLocalId">,
): TripGroupMember {
  return {
    serverId: null,
    deviceId: "device-1",
    userId: "user-1",
    sortOrder: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    deletedAt: null,
    syncStatus: "local-only",
    ...overrides,
  };
}

describe("createTripGroup", () => {
  it("creates a group with trimmed title and correct fields", () => {
    const session = makeSession();
    const group = createTripGroup(session, { title: "  Corfu  ", description: "  Nice trip  " });

    expect(group.title).toBe("Corfu");
    expect(group.description).toBe("Nice trip");
    expect(group.userId).toBe(session.userId);
    expect(group.deviceId).toBe(session.deviceId);
    expect(group.deletedAt).toBeNull();
    expect(group.serverId).toBeNull();
    expect(group.syncStatus).toBe("pending-sync");
  });

  it("stores null description when blank", () => {
    const group = createTripGroup(makeSession(), { title: "Test", description: "   " });
    expect(group.description).toBeNull();
  });

  it("uses localId based on createdAt", () => {
    const at = "2024-06-01T12:00:00.000Z";
    const group = createTripGroup(makeSession(), { title: "T", description: null }, at);
    expect(group.localId).toContain(at);
    expect(group.createdAt).toBe(at);
    expect(group.updatedAt).toBe(at);
  });
});

describe("getVisibleTripGroups", () => {
  it("excludes soft-deleted groups", () => {
    const groups = [
      makeGroup({ localId: "g1" }),
      makeGroup({ localId: "g2", deletedAt: "2024-01-02T00:00:00.000Z" }),
    ];

    expect(getVisibleTripGroups(groups).map((g) => g.localId)).toEqual(["g1"]);
  });
});

describe("getVisibleTripGroupMembers", () => {
  it("excludes soft-deleted members", () => {
    const members = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1" }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", deletedAt: "2024-01-02T00:00:00.000Z" }),
    ];

    expect(getVisibleTripGroupMembers(members).map((m) => m.localId)).toEqual(["m1"]);
  });
});

describe("buildTripGroupMembersForTrips", () => {
  const session = makeSession();

  it("creates members for new trips", () => {
    const members = buildTripGroupMembersForTrips(session, {
      existingMembers: [],
      groupLocalId: "g1",
      tripLocalIds: ["t1", "t2"],
    });

    expect(members).toHaveLength(2);
    expect(members[0].tripLocalId).toBe("t1");
    expect(members[1].tripLocalId).toBe("t2");
    expect(members[0].sortOrder).toBe(0);
    expect(members[1].sortOrder).toBe(1);
  });

  it("skips trips that are already active members", () => {
    const existing = [makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1" })];

    const newMembers = buildTripGroupMembersForTrips(session, {
      existingMembers: existing,
      groupLocalId: "g1",
      tripLocalIds: ["t1", "t2"],
    });

    expect(newMembers).toHaveLength(1);
    expect(newMembers[0].tripLocalId).toBe("t2");
  });

  it("re-adds a trip whose membership was soft-deleted", () => {
    const existing = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", deletedAt: "2024-01-01T00:00:00.000Z" }),
    ];

    const newMembers = buildTripGroupMembersForTrips(session, {
      existingMembers: existing,
      groupLocalId: "g1",
      tripLocalIds: ["t1"],
    });

    expect(newMembers).toHaveLength(1);
    expect(newMembers[0].tripLocalId).toBe("t1");
  });

  it("continues sort order from existing members", () => {
    const existing = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", sortOrder: 0 }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", sortOrder: 1 }),
    ];

    const newMembers = buildTripGroupMembersForTrips(session, {
      existingMembers: existing,
      groupLocalId: "g1",
      tripLocalIds: ["t3"],
    });

    expect(newMembers[0].sortOrder).toBe(2);
  });
});

describe("buildTripGroupSummaries", () => {
  it("aggregates distance and trip count for a group", () => {
    const groups = [makeGroup({ localId: "g1" })];
    const members = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", sortOrder: 0 }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", sortOrder: 1 }),
    ];
    const trips = [
      makeTrip({ localId: "t1", distanceMeters: 1000 }),
      makeTrip({ localId: "t2", distanceMeters: 2000 }),
    ];

    const [summary] = buildTripGroupSummaries(groups, members, trips);

    expect(summary.tripCount).toBe(2);
    expect(summary.totalDistanceMeters).toBe(3000);
  });

  it("excludes deleted trips from group summary", () => {
    const groups = [makeGroup({ localId: "g1" })];
    const members = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", sortOrder: 0 }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", sortOrder: 1 }),
    ];
    const trips = [
      makeTrip({ localId: "t1", distanceMeters: 1000 }),
      makeTrip({ localId: "t2", distanceMeters: 2000, deletedAt: "2024-01-02T00:00:00.000Z" }),
    ];

    const [summary] = buildTripGroupSummaries(groups, members, trips);

    expect(summary.tripCount).toBe(1);
    expect(summary.totalDistanceMeters).toBe(1000);
  });

  it("excludes deleted groups", () => {
    const groups = [makeGroup({ localId: "g1", deletedAt: "2024-01-02T00:00:00.000Z" })];
    const summaries = buildTripGroupSummaries(groups, [], []);
    expect(summaries).toHaveLength(0);
  });

  it("uses lastTripStartedAt from the most recent trip", () => {
    const groups = [makeGroup({ localId: "g1" })];
    const members = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", sortOrder: 0 }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", sortOrder: 1 }),
    ];
    const trips = [
      makeTrip({ localId: "t1", startedAt: "2024-01-01T10:00:00.000Z" }),
      makeTrip({ localId: "t2", startedAt: "2024-03-15T08:00:00.000Z" }),
    ];

    const [summary] = buildTripGroupSummaries(groups, members, trips);

    expect(summary.lastTripStartedAt).toBe("2024-03-15T08:00:00.000Z");
  });

  it("counts duration only for ended trips", () => {
    const groups = [makeGroup({ localId: "g1" })];
    const members = [
      makeMember({ localId: "m1", groupLocalId: "g1", tripLocalId: "t1", sortOrder: 0 }),
      makeMember({ localId: "m2", groupLocalId: "g1", tripLocalId: "t2", sortOrder: 1 }),
    ];
    const trips = [
      makeTrip({ localId: "t1", startedAt: "2024-01-01T10:00:00.000Z", endedAt: "2024-01-01T11:00:00.000Z" }),
      makeTrip({ localId: "t2", startedAt: "2024-01-02T10:00:00.000Z", endedAt: null, status: "active" }),
    ];

    const [summary] = buildTripGroupSummaries(groups, members, trips);

    expect(summary.totalDurationMs).toBe(60 * 60 * 1000);
  });
});
