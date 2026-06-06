import { describe, expect, it, vi } from "vitest";

import type { Trip } from "../../domain/trips";
import {
  filterTripsByDate,
  getVisibleTrips,
} from "../../services/trips/trips-management.service";

vi.mock("../../services/trip-points/trip-points.service", () => ({
  getVisibleTripPointsForTrip: () => [],
  groupVisibleTripPointsByTripId: () => new Map(),
}));

vi.mock("../../services/trips/trip-distance.service", () => ({
  calculateTripDistanceMeters: () => 0,
}));

function makeTrip(overrides: Partial<Trip> & Pick<Trip, "localId" | "startedAt">): Trip {
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
    endedAt: null,
    createdAt: overrides.startedAt,
    updatedAt: overrides.startedAt,
    deletedAt: null,
    syncStatus: "local-only",
    ...overrides,
  };
}

const NOW = new Date("2024-06-15T12:00:00.000Z");

describe("getVisibleTrips", () => {
  it("excludes soft-deleted trips", () => {
    const trips = [
      makeTrip({ localId: "t1", startedAt: "2024-06-01T10:00:00.000Z" }),
      makeTrip({ localId: "t2", startedAt: "2024-06-02T10:00:00.000Z", deletedAt: "2024-06-10T00:00:00.000Z" }),
    ];

    expect(getVisibleTrips(trips).map((t) => t.localId)).toEqual(["t1"]);
  });

  it("sorts by startedAt descending", () => {
    const trips = [
      makeTrip({ localId: "t1", startedAt: "2024-01-01T10:00:00.000Z" }),
      makeTrip({ localId: "t2", startedAt: "2024-03-01T10:00:00.000Z" }),
      makeTrip({ localId: "t3", startedAt: "2024-02-01T10:00:00.000Z" }),
    ];

    expect(getVisibleTrips(trips).map((t) => t.localId)).toEqual(["t2", "t3", "t1"]);
  });
});

describe("filterTripsByDate", () => {
  const todayTrip = makeTrip({ localId: "today", startedAt: "2024-06-15T08:00:00.000Z" });
  const yesterdayTrip = makeTrip({ localId: "yesterday", startedAt: "2024-06-14T08:00:00.000Z" });
  const lastWeekTrip = makeTrip({ localId: "last-week", startedAt: "2024-06-10T08:00:00.000Z" });
  const lastMonthTrip = makeTrip({ localId: "last-month", startedAt: "2024-05-20T08:00:00.000Z" });
  const lastYearTrip = makeTrip({ localId: "last-year", startedAt: "2023-12-01T08:00:00.000Z" });
  const oldTrip = makeTrip({ localId: "old", startedAt: "2022-01-01T08:00:00.000Z" });

  const all = [todayTrip, yesterdayTrip, lastWeekTrip, lastMonthTrip, lastYearTrip, oldTrip];

  it("returns all trips when filter is 'all'", () => {
    expect(filterTripsByDate(all, "all", NOW)).toHaveLength(all.length);
  });

  it("returns only today's trips", () => {
    const result = filterTripsByDate(all, "today", NOW);
    expect(result.map((t) => t.localId)).toEqual(["today"]);
  });

  it("returns only yesterday's trips", () => {
    const result = filterTripsByDate(all, "yesterday", NOW);
    expect(result.map((t) => t.localId)).toEqual(["yesterday"]);
  });

  it("returns trips within the last 7 days", () => {
    const result = filterTripsByDate(all, "last_week", NOW);
    const ids = result.map((t) => t.localId);
    expect(ids).toContain("today");
    expect(ids).toContain("yesterday");
    expect(ids).toContain("last-week");
    expect(ids).not.toContain("last-month");
    expect(ids).not.toContain("old");
  });

  it("returns trips within the last month", () => {
    const result = filterTripsByDate(all, "last_month", NOW);
    const ids = result.map((t) => t.localId);
    expect(ids).toContain("last-month");
    expect(ids).not.toContain("last-year");
    expect(ids).not.toContain("old");
  });

  it("returns trips within the last year", () => {
    const result = filterTripsByDate(all, "last_year", NOW);
    const ids = result.map((t) => t.localId);
    expect(ids).toContain("last-year");
    expect(ids).not.toContain("old");
  });

  it("returns empty array when no trips match", () => {
    const result = filterTripsByDate([oldTrip], "today", NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes a trip from two days ago", () => {
    const twoDaysAgo = makeTrip({ localId: "two-days-ago", startedAt: "2024-06-13T12:00:00.000Z" });
    const result = filterTripsByDate([twoDaysAgo], "yesterday", NOW);
    expect(result).toHaveLength(0);
  });
});
