import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TripPoint } from "../../domain/trips";

type TripPointRow = {
  accuracy: number | null;
  altitude: number | null;
  device_id: string;
  latitude: number;
  local_id: string;
  longitude: number;
  recorded_at: string;
  segment_local_id: string | null;
  server_id: string | null;
  speed: number | null;
  sync_status: TripPoint["syncStatus"];
  trip_local_id: string;
  user_id: string;
};

type TripRow = {
  distance_meters: number | null;
  local_id: string;
  point_count: number | null;
  stats_updated_at: string | null;
};

type TripSegmentRow = {
  distance_meters: number | null;
  duration_ms: number | null;
  ended_at: string | null;
  local_id: string;
  point_count: number | null;
  started_at: string;
  stats_updated_at: string | null;
  trip_local_id: string;
};

type TripStatsRow = {
  distance_meters: number;
  point_count: number;
  trip_local_id: string;
  updated_at: string;
};

type TripSegmentStatsRow = {
  distance_meters: number;
  duration_ms: number;
  point_count: number;
  segment_local_id: string;
  trip_local_id: string;
  updated_at: string;
};

const state = vi.hoisted(() => ({
  tripPoints: new Map<string, TripPointRow>(),
  tripSegmentStats: new Map<string, TripSegmentStatsRow>(),
  tripSegments: new Map<string, TripSegmentRow>(),
  tripStats: new Map<string, TripStatsRow>(),
  trips: new Map<string, TripRow>(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../storage/sqlite/migrate-once", () => ({
  migrateOnce: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../storage/sqlite/db", () => ({
  getDatabase: async () => fakeDatabase,
  runExclusiveDatabaseWrite: async <T>(task: (database: typeof fakeDatabase) => Promise<T>) =>
    task(fakeDatabase),
}));

const fakeDatabase = {
  getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql.includes("SELECT * FROM trip_points WHERE trip_local_id IN")) {
      return sortTripPointRows(
        [...state.tripPoints.values()].filter((row) => params.includes(row.trip_local_id)),
      ) as T[];
    }

    if (normalizedSql.includes("SELECT * FROM trip_points WHERE trip_local_id = ?")) {
      const tripLocalId = String(params[0]);

      return sortTripPointRows(
        [...state.tripPoints.values()].filter((row) => row.trip_local_id === tripLocalId),
      ) as T[];
    }

    if (normalizedSql.includes("SELECT * FROM trip_points WHERE segment_local_id IN")) {
      return sortTripPointRows(
        [...state.tripPoints.values()].filter((row) =>
          row.segment_local_id !== null && params.includes(row.segment_local_id)
        ),
      ) as T[];
    }

    if (normalizedSql.includes("SELECT * FROM trip_points ORDER BY")) {
      return sortTripPointRows([...state.tripPoints.values()]) as T[];
    }

    if (normalizedSql.includes("SELECT local_id, trip_local_id, started_at, ended_at")) {
      return [...state.tripSegments.values()]
        .filter((row) => params.includes(row.trip_local_id))
        .sort((left, right) =>
          left.started_at.localeCompare(right.started_at) || left.local_id.localeCompare(right.local_id)
        )
        .map((row) => ({
          ended_at: row.ended_at,
          local_id: row.local_id,
          started_at: row.started_at,
          trip_local_id: row.trip_local_id,
        })) as T[];
    }

    if (normalizedSql.includes("local_id AS trip_local_id")) {
      return [...state.trips.values()]
        .filter((row) =>
          params.includes(row.local_id) &&
          row.point_count !== null &&
          row.distance_meters !== null &&
          row.stats_updated_at !== null
        )
        .map((row) => ({
          distance_meters: row.distance_meters,
          point_count: row.point_count,
          trip_local_id: row.local_id,
          updated_at: row.stats_updated_at,
        })) as T[];
    }

    if (normalizedSql.includes("local_id AS segment_local_id")) {
      return [...state.tripSegments.values()]
        .filter((row) =>
          params.includes(row.trip_local_id) &&
          row.point_count !== null &&
          row.distance_meters !== null &&
          row.duration_ms !== null &&
          row.stats_updated_at !== null
        )
        .map((row) => ({
          distance_meters: row.distance_meters,
          duration_ms: row.duration_ms,
          point_count: row.point_count,
          segment_local_id: row.local_id,
          trip_local_id: row.trip_local_id,
          updated_at: row.stats_updated_at,
        })) as T[];
    }

    throw new Error(`Unexpected getAllAsync SQL in trip point test: ${sql}`);
  },
  runAsync: async (sql: string, ...params: unknown[]) => {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();

    if (normalizedSql === "DELETE FROM trip_points") {
      state.tripPoints.clear();
      return { changes: 1 };
    }

    if (normalizedSql.includes("DELETE FROM trip_points WHERE trip_local_id = ?")) {
      const tripLocalId = String(params[0]);

      for (const [localId, row] of state.tripPoints) {
        if (row.trip_local_id === tripLocalId) {
          state.tripPoints.delete(localId);
        }
      }

      return { changes: 1 };
    }

    if (normalizedSql.includes("DELETE FROM trip_points WHERE local_id = ?")) {
      state.tripPoints.delete(String(params[0]));
      return { changes: 1 };
    }

    if (normalizedSql.includes("INSERT INTO trip_points") || normalizedSql.includes("INSERT OR REPLACE INTO trip_points")) {
      const row = tripPointRowFromParams(params);

      state.tripPoints.set(row.local_id, row);
      return { changes: 1 };
    }

    if (normalizedSql === "DELETE FROM trip_stats") {
      state.tripStats.clear();
      return { changes: 1 };
    }

    if (normalizedSql.includes("DELETE FROM trip_stats WHERE trip_local_id = ?")) {
      state.tripStats.delete(String(params[0]));
      return { changes: 1 };
    }

    if (normalizedSql.includes("DELETE FROM trip_segment_stats WHERE trip_local_id IN")) {
      for (const [segmentLocalId, row] of state.tripSegmentStats) {
        if (params.includes(row.trip_local_id)) {
          state.tripSegmentStats.delete(segmentLocalId);
        }
      }

      return { changes: 1 };
    }

    if (
      normalizedSql.includes("UPDATE trips") &&
      normalizedSql.includes("SET point_count = NULL") &&
      !normalizedSql.includes("WHERE local_id = ?")
    ) {
      for (const [localId, row] of state.trips) {
        state.trips.set(localId, clearTripStats(row));
      }

      return { changes: 1 };
    }

    if (normalizedSql.includes("UPDATE trip_segments") && normalizedSql.includes("SET point_count = NULL")) {
      for (const [segmentLocalId, row] of state.tripSegments) {
        if (params.includes(row.trip_local_id)) {
          state.tripSegments.set(segmentLocalId, clearTripSegmentStats(row));
        }
      }

      return { changes: 1 };
    }

    if (normalizedSql.includes("INSERT INTO trip_stats")) {
      const row = {
        distance_meters: Number(params[2]),
        point_count: Number(params[1]),
        trip_local_id: String(params[0]),
        updated_at: String(params[3]),
      };

      state.tripStats.set(row.trip_local_id, row);
      return { changes: 1 };
    }

    if (normalizedSql.includes("UPDATE trips") && normalizedSql.includes("WHERE local_id = ?")) {
      const localId = String(params[3]);
      const existing = state.trips.get(localId);

      if (existing) {
        state.trips.set(localId, {
          ...existing,
          distance_meters: Number(params[1]),
          point_count: Number(params[0]),
          stats_updated_at: String(params[2]),
        });
      }

      return { changes: existing ? 1 : 0 };
    }

    if (normalizedSql.includes("INSERT INTO trip_segment_stats")) {
      const row = {
        distance_meters: Number(params[3]),
        duration_ms: Number(params[4]),
        point_count: Number(params[2]),
        segment_local_id: String(params[0]),
        trip_local_id: String(params[1]),
        updated_at: String(params[5]),
      };

      state.tripSegmentStats.set(row.segment_local_id, row);
      return { changes: 1 };
    }

    if (normalizedSql.includes("UPDATE trip_segments") && normalizedSql.includes("WHERE local_id = ?")) {
      const segmentLocalId = String(params[4]);
      const existing = state.tripSegments.get(segmentLocalId);

      if (existing) {
        state.tripSegments.set(segmentLocalId, {
          ...existing,
          distance_meters: Number(params[1]),
          duration_ms: Number(params[2]),
          point_count: Number(params[0]),
          stats_updated_at: String(params[3]),
        });
      }

      return { changes: existing ? 1 : 0 };
    }

    throw new Error(`Unexpected runAsync SQL in trip point test: ${sql}`);
  },
};

function tripPointRowFromParams(params: unknown[]): TripPointRow {
  return {
    accuracy: params[9] as number | null,
    altitude: params[10] as number | null,
    device_id: String(params[4]),
    latitude: Number(params[6]),
    local_id: String(params[0]),
    longitude: Number(params[7]),
    recorded_at: String(params[8]),
    segment_local_id: params[3] as string | null,
    server_id: params[1] as string | null,
    speed: params[11] as number | null,
    sync_status: params[12] as TripPoint["syncStatus"],
    trip_local_id: String(params[2]),
    user_id: String(params[5]),
  };
}

function clearTripStats(row: TripRow): TripRow {
  return {
    ...row,
    distance_meters: null,
    point_count: null,
    stats_updated_at: null,
  };
}

function clearTripSegmentStats(row: TripSegmentRow): TripSegmentRow {
  return {
    ...row,
    distance_meters: null,
    duration_ms: null,
    point_count: null,
    stats_updated_at: null,
  };
}

function sortTripPointRows(rows: TripPointRow[]): TripPointRow[] {
  return [...rows].sort((left, right) =>
    left.recorded_at.localeCompare(right.recorded_at) || left.local_id.localeCompare(right.local_id)
  );
}

function seedTrip(localId: string): void {
  state.trips.set(localId, {
    distance_meters: null,
    local_id: localId,
    point_count: null,
    stats_updated_at: null,
  });
}

function seedTripSegment(localId: string, tripLocalId: string): void {
  state.tripSegments.set(localId, {
    distance_meters: null,
    duration_ms: null,
    ended_at: "2026-01-01T10:10:00.000Z",
    local_id: localId,
    point_count: null,
    started_at: "2026-01-01T10:00:00.000Z",
    stats_updated_at: null,
    trip_local_id: tripLocalId,
  });
}

function makeTripPoint(overrides: Partial<TripPoint> & Pick<TripPoint, "localId">): TripPoint {
  const { localId, ...optionalOverrides } = overrides;

  return {
    accuracy: 8,
    altitude: 100,
    deviceId: "device-1",
    latitude: 45,
    localId,
    longitude: 19,
    recordedAt: "2026-01-01T10:00:00.000Z",
    segmentLocalId: "segment-1",
    serverId: null,
    speed: 0,
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    userId: "user-1",
    ...optionalOverrides,
  };
}

describe("trip-points-storage hot path contract", () => {
  beforeEach(() => {
    state.tripPoints.clear();
    state.tripSegmentStats.clear();
    state.tripSegments.clear();
    state.tripStats.clear();
    state.trips.clear();
  });

  it("loads trip points ordered by recordedAt and localId", async () => {
    const { loadTripPointsForTrip, saveTripPoints } = await import("../../repositories/trip-points-repository");

    await saveTripPoints([
      makeTripPoint({ localId: "point-c", recordedAt: "2026-01-01T10:00:02.000Z" }),
      makeTripPoint({ localId: "point-b", recordedAt: "2026-01-01T10:00:00.000Z" }),
      makeTripPoint({ localId: "point-a", recordedAt: "2026-01-01T10:00:00.000Z" }),
    ]);

    await expect(loadTripPointsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "point-a" },
      { localId: "point-b" },
      { localId: "point-c" },
    ]);
  });

  it("replace by trip ignores mixed trip points according to the current contract", async () => {
    const { loadTripPointsForTrip, replaceTripPointsForTrip } = await import(
      "../../repositories/trip-points-repository"
    );

    await replaceTripPointsForTrip("trip-1", [
      makeTripPoint({ localId: "point-1", tripLocalId: "trip-1" }),
      makeTripPoint({ localId: "point-2", tripLocalId: "trip-2" }),
    ]);

    await expect(loadTripPointsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "point-1", tripLocalId: "trip-1" },
    ]);
    await expect(loadTripPointsForTrip("trip-2")).resolves.toEqual([]);
  });

  it("replace by trip removes previous points for that trip only", async () => {
    const { loadTripPointsForTrip, saveTripPoints, replaceTripPointsForTrip } = await import(
      "../../repositories/trip-points-repository"
    );

    await saveTripPoints([
      makeTripPoint({ localId: "old-trip-1", tripLocalId: "trip-1" }),
      makeTripPoint({ localId: "kept-trip-2", segmentLocalId: "segment-2", tripLocalId: "trip-2" }),
    ]);
    await replaceTripPointsForTrip("trip-1", [
      makeTripPoint({ localId: "new-trip-1", tripLocalId: "trip-1" }),
    ]);

    await expect(loadTripPointsForTrip("trip-1")).resolves.toMatchObject([
      { localId: "new-trip-1" },
    ]);
    await expect(loadTripPointsForTrip("trip-2")).resolves.toMatchObject([
      { localId: "kept-trip-2" },
    ]);
  });

  it("refreshes trip and segment stats after replacement", async () => {
    const {
      loadTripSegmentStatsByTripLocalIds,
      loadTripStatsByTripLocalIds,
      replaceTripPointsForTrip,
    } = await import("../../repositories/trip-points-repository");

    seedTrip("trip-1");
    seedTripSegment("segment-1", "trip-1");

    await replaceTripPointsForTrip("trip-1", [
      makeTripPoint({ localId: "point-1", latitude: 45, longitude: 19 }),
      makeTripPoint({
        localId: "point-2",
        latitude: 45.001,
        longitude: 19.001,
        recordedAt: "2026-01-01T10:01:00.000Z",
      }),
    ]);

    const tripStats = await loadTripStatsByTripLocalIds(["trip-1"]);
    const segmentStats = await loadTripSegmentStatsByTripLocalIds(["trip-1"]);

    expect(tripStats.get("trip-1")).toMatchObject({
      point_count: 2,
      trip_local_id: "trip-1",
    });
    expect(tripStats.get("trip-1")?.distance_meters).toBeGreaterThan(5);
    expect(segmentStats.get("segment-1")).toMatchObject({
      duration_ms: 600000,
      point_count: 2,
      segment_local_id: "segment-1",
      trip_local_id: "trip-1",
    });
    expect(segmentStats.get("segment-1")?.distance_meters).toBeGreaterThan(5);
  });

  it("empty replacement clears point counts and stats for that trip", async () => {
    const { loadTripSegmentStatsByTripLocalIds, loadTripStatsByTripLocalIds, replaceTripPointsForTrip } =
      await import("../../repositories/trip-points-repository");

    seedTrip("trip-1");
    seedTripSegment("segment-1", "trip-1");
    await replaceTripPointsForTrip("trip-1", [
      makeTripPoint({ localId: "point-1" }),
    ]);
    await replaceTripPointsForTrip("trip-1", []);

    const tripStats = await loadTripStatsByTripLocalIds(["trip-1"]);
    const segmentStats = await loadTripSegmentStatsByTripLocalIds(["trip-1"]);

    expect(tripStats.get("trip-1")).toMatchObject({
      distance_meters: 0,
      point_count: 0,
      trip_local_id: "trip-1",
    });
    expect(segmentStats.get("segment-1")).toMatchObject({
      distance_meters: 0,
      point_count: 0,
      segment_local_id: "segment-1",
    });
  });
});
