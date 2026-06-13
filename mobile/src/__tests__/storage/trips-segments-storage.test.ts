import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MobileRecordingConfig } from "../../domain/recording-config";
import type { Trip, TripSegment } from "../../domain/trips";

type TableName = "tripSegments" | "trips";
type FakeColumn = {
  columnName: string;
  tableName: TableName;
};
type FakeCondition = {
  column: FakeColumn;
  value: string;
};
type FakeOrder = {
  column: FakeColumn;
};
type FakeTable = {
  tableName: TableName;
};
type FakeRows = Record<string, unknown>;

const state = vi.hoisted(() => ({
  mutations: [] as string[],
  tables: {
    tripSegments: new Map<string, FakeRows>(),
    trips: new Map<string, FakeRows>(),
  },
}));

const statsRefreshMocks = vi.hoisted(() => ({
  refreshTripSegmentStatsForTripLocalIds: vi.fn().mockResolvedValue(undefined),
  refreshTripStatsForTripLocalIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("drizzle-orm", () => ({
  asc: (column: FakeColumn): FakeOrder => ({ column }),
  eq: (column: FakeColumn, value: string): FakeCondition => ({ column, value }),
}));

vi.mock("../../storage/sqlite/migrate-once", () => ({
  migrateOnce: async (_key: string, migrate: () => Promise<void>) => migrate(),
}));

vi.mock("../../storage/trip-points-storage", () => statsRefreshMocks);

vi.mock("../../storage/drizzle/schema", () => {
  function column(tableName: TableName, columnName: string): FakeColumn {
    return { columnName, tableName };
  }

  return {
    tripSegments: {
      tableName: "tripSegments",
      localId: column("tripSegments", "localId"),
      startedAt: column("tripSegments", "startedAt"),
    },
    trips: {
      tableName: "trips",
      localId: column("trips", "localId"),
      startedAt: column("trips", "startedAt"),
    },
  };
});

vi.mock("../../storage/drizzle/db", () => ({
  getDrizzleDatabase: async () => createFakeDatabase(),
  runExclusiveDrizzleWrite: async <T>(task: (database: ReturnType<typeof createFakeDatabase>) => Promise<T>) =>
    task(createFakeDatabase()),
}));

function createFakeDatabase() {
  return {
    delete: (table: FakeTable) => createDeleteQuery(table.tableName),
    insert: (table: FakeTable) => ({
      values: (input: FakeRows | FakeRows[]) => createInsertQuery(table.tableName, input),
    }),
    select: (selection?: Record<string, FakeColumn>) => ({
      from: (table: FakeTable) => createSelectQuery(table.tableName, selection),
    }),
  };
}

function createDeleteQuery(tableName: TableName) {
  const deleteAll = async () => {
    state.mutations.push(`delete-all:${tableName}`);
    state.tables[tableName].clear();
  };

  return {
    then: <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => deleteAll().then(onfulfilled, onrejected),
    where: async (condition: FakeCondition) => {
      state.mutations.push(`delete:${tableName}:${condition.value}`);
      state.tables[tableName].delete(condition.value);
    },
  };
}

function createInsertQuery(tableName: TableName, input: FakeRows | FakeRows[]) {
  const rows = Array.isArray(input) ? input : [input];
  const insertAll = async () => {
    for (const row of rows) {
      state.mutations.push(`insert:${tableName}:${String(row.localId)}`);
      state.tables[tableName].set(String(row.localId), { ...row });
    }
  };

  return {
    onConflictDoUpdate: async ({ set }: { set: FakeRows }) => {
      for (const row of rows) {
        const localId = String(row.localId);
        const existingRow = state.tables[tableName].get(localId);
        state.mutations.push(`upsert:${tableName}:${localId}`);
        state.tables[tableName].set(localId, existingRow ? { ...existingRow, ...set } : { ...row });
      }
    },
    then: <TResult1 = void, TResult2 = never>(
      onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => insertAll().then(onfulfilled, onrejected),
  };
}

function createSelectQuery(tableName: TableName, selection?: Record<string, FakeColumn>) {
  function getRows() {
    return [...state.tables[tableName].values()];
  }

  function project(row: FakeRows) {
    if (!selection) {
      return { ...row };
    }

    return Object.fromEntries(
      Object.entries(selection).map(([selectionKey, column]) => [selectionKey, row[column.columnName]]),
    );
  }

  return {
    limit: async (limit: number) => getRows().slice(0, limit).map(project),
    orderBy: async (...orders: FakeOrder[]) =>
      getRows()
        .sort((left, right) => compareRows(left, right, orders))
        .map(project),
  };
}

function compareRows(left: FakeRows, right: FakeRows, orders: FakeOrder[]) {
  for (const order of orders) {
    const leftValue = String(left[order.column.columnName] ?? "");
    const rightValue = String(right[order.column.columnName] ?? "");
    const comparison = leftValue.localeCompare(rightValue);

    if (comparison !== 0) {
      return comparison;
    }
  }

  return 0;
}

function makeRecordingConfig(): MobileRecordingConfig {
  return {
    pointFilters: {
      default: {
        walk: {
          maxAccuracyMeters: 50,
          maxImpliedSpeedKmh: 15,
          maxJumpDistanceMeters: 100,
          minMovementMeters: 5,
        },
      },
    },
    updatedAt: "2026-01-01T10:00:00.000Z",
    version: 1,
  };
}

function makeTrip(overrides: Partial<Trip> & Pick<Trip, "localId">): Trip {
  const { localId, ...optionalOverrides } = overrides;

  return {
    batteryEndLevelPercent: null,
    batteryEndState: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    createdAt: "2026-01-01T10:00:00.000Z",
    deletedAt: null,
    description: null,
    deviceId: "device-1",
    distanceMeters: null,
    endedAt: null,
    localId,
    pointCount: null,
    recordingConfig: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    statsUpdatedAt: null,
    status: "active",
    syncStatus: "local-only",
    title: localId,
    updatedAt: "2026-01-01T10:00:00.000Z",
    userId: "user-1",
    ...optionalOverrides,
  };
}

function makeTripSegment(overrides: Partial<TripSegment> & Pick<TripSegment, "localId">): TripSegment {
  const { localId, ...optionalOverrides } = overrides;

  return {
    createdAt: "2026-01-01T10:00:00.000Z",
    deviceId: "device-1",
    distanceMeters: null,
    durationMs: null,
    endedAt: null,
    localId,
    pointCount: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: "2026-01-01T10:00:00.000Z",
    statsUpdatedAt: null,
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    updatedAt: "2026-01-01T10:00:00.000Z",
    userId: "user-1",
    ...optionalOverrides,
  };
}

describe("trips-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.tripSegments.clear();
    state.tables.trips.clear();
    vi.clearAllMocks();
  });

  it("fully replaces trips and loads them in started order", async () => {
    const { loadTrips, saveTrips } = await import("../../storage/trips-storage");
    const lateTrip = makeTrip({ localId: "trip-2", startedAt: "2026-01-01T12:00:00.000Z" });
    const earlyTrip = makeTrip({ localId: "trip-1", startedAt: "2026-01-01T11:00:00.000Z" });

    await saveTrips([lateTrip, earlyTrip]);

    await expect(loadTrips()).resolves.toEqual([earlyTrip, lateTrip]);
  });

  it("empty trip save clears stale rows", async () => {
    const { loadTrips, saveTrips } = await import("../../storage/trips-storage");

    await saveTrips([makeTrip({ localId: "trip-1" })]);
    await saveTrips([]);

    expect(state.mutations).toContain("delete-all:trips");
    await expect(loadTrips()).resolves.toEqual([]);
  });

  it("round-trips recording config JSON", async () => {
    const { loadTrips, saveTrips } = await import("../../storage/trips-storage");
    const trip = makeTrip({
      localId: "trip-1",
      recordingConfig: makeRecordingConfig(),
    });

    await saveTrips([trip]);

    await expect(loadTrips()).resolves.toEqual([trip]);
  });
});

describe("trip-segments-storage", () => {
  beforeEach(() => {
    state.mutations = [];
    state.tables.tripSegments.clear();
    state.tables.trips.clear();
    vi.clearAllMocks();
  });

  it("fully replaces trip segments, loads them in started order and refreshes stats", async () => {
    const { loadTripSegments, saveTripSegments } = await import("../../storage/trip-segments-storage");
    const lateSegment = makeTripSegment({
      localId: "segment-2",
      startedAt: "2026-01-01T12:00:00.000Z",
      tripLocalId: "trip-1",
    });
    const earlySegment = makeTripSegment({
      localId: "segment-1",
      startedAt: "2026-01-01T11:00:00.000Z",
      tripLocalId: "trip-2",
    });

    await saveTripSegments([lateSegment, earlySegment]);

    await expect(loadTripSegments()).resolves.toEqual([earlySegment, lateSegment]);
    expect(statsRefreshMocks.refreshTripSegmentStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1", "trip-2"]);
    expect(statsRefreshMocks.refreshTripStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1", "trip-2"]);
  });

  it("incrementally deletes removed segments and upserts changed segments", async () => {
    const { loadTripSegments, saveTripSegments } = await import("../../storage/trip-segments-storage");
    const previousSegment = makeTripSegment({ distanceMeters: 10, localId: "segment-1" });
    const removedSegment = makeTripSegment({ localId: "segment-2" });
    const nextSegment = { ...previousSegment, distanceMeters: 20 };

    await saveTripSegments([previousSegment, removedSegment]);
    state.mutations = [];
    vi.clearAllMocks();
    await saveTripSegments([nextSegment], [previousSegment, removedSegment]);

    expect(state.mutations).toEqual([
      "delete:tripSegments:segment-2",
      "upsert:tripSegments:segment-1",
    ]);
    expect(statsRefreshMocks.refreshTripSegmentStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1"]);
    expect(statsRefreshMocks.refreshTripStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1"]);
    await expect(loadTripSegments()).resolves.toEqual([nextSegment]);
  });

  it("does not write or refresh stats when incremental segment input is unchanged", async () => {
    const { saveTripSegments } = await import("../../storage/trip-segments-storage");
    const tripSegment = makeTripSegment({ localId: "segment-1" });

    await saveTripSegments([tripSegment]);
    state.mutations = [];
    vi.clearAllMocks();
    await saveTripSegments([tripSegment], [tripSegment]);

    expect(state.mutations).toEqual([]);
    expect(statsRefreshMocks.refreshTripSegmentStatsForTripLocalIds).not.toHaveBeenCalled();
    expect(statsRefreshMocks.refreshTripStatsForTripLocalIds).not.toHaveBeenCalled();
  });

  it("refreshes stats for old and new trip ids when segment ownership changes", async () => {
    const { saveTripSegments } = await import("../../storage/trip-segments-storage");
    const previousSegment = makeTripSegment({ localId: "segment-1", tripLocalId: "trip-1" });
    const nextSegment = { ...previousSegment, tripLocalId: "trip-2" };

    await saveTripSegments([previousSegment]);
    state.mutations = [];
    vi.clearAllMocks();
    await saveTripSegments([nextSegment], [previousSegment]);

    expect(state.mutations).toEqual(["upsert:tripSegments:segment-1"]);
    expect(statsRefreshMocks.refreshTripSegmentStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1", "trip-2"]);
    expect(statsRefreshMocks.refreshTripStatsForTripLocalIds).toHaveBeenCalledWith(["trip-1", "trip-2"]);
  });
});
