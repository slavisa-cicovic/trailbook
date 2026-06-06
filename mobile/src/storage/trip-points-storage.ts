// Intentional raw SQL hot path.
// PLAN_52G benchmark selected "keep raw SQL" for trip_points and stats recomputation on Android/iOS.
// Do not migrate this file to Drizzle without rerunning the storage benchmark on an Android release build.
// The repository wrapper remains the public boundary for callers.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPoint } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";

export interface TripStatsRow {
  distance_meters: number;
  point_count: number;
  trip_local_id: string;
  updated_at: string;
}

export interface TripSegmentStatsRow {
  distance_meters: number;
  duration_ms: number;
  point_count: number;
  segment_local_id: string;
  trip_local_id: string;
  updated_at: string;
}

function normalizeTripPoint(
  value: Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripPoint {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    segmentLocalId: value.segmentLocalId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    recordedAt: value.recordedAt ?? new Date(0).toISOString(),
    accuracy: value.accuracy ?? null,
    altitude: value.altitude ?? null,
    speed: value.speed ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface TripPointRow {
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
}

interface TripSegmentStatsSourceRow {
  ended_at: string | null;
  local_id: string;
  started_at: string;
  trip_local_id: string;
}

function toTripPointRow(tripPoint: TripPoint): TripPointRow {
  return {
    accuracy: tripPoint.accuracy,
    altitude: tripPoint.altitude,
    device_id: tripPoint.deviceId,
    latitude: tripPoint.latitude,
    local_id: tripPoint.localId,
    longitude: tripPoint.longitude,
    recorded_at: tripPoint.recordedAt,
    segment_local_id: tripPoint.segmentLocalId,
    server_id: tripPoint.serverId,
    speed: tripPoint.speed,
    sync_status: tripPoint.syncStatus,
    trip_local_id: tripPoint.tripLocalId,
    user_id: tripPoint.userId,
  };
}

function toTripPoint(row: TripPointRow): TripPoint {
  return normalizeTripPoint({
    accuracy: row.accuracy,
    altitude: row.altitude,
    deviceId: row.device_id,
    latitude: row.latitude,
    localId: row.local_id,
    longitude: row.longitude,
    recordedAt: row.recorded_at,
    segmentLocalId: row.segment_local_id,
    serverId: row.server_id,
    speed: row.speed,
    syncStatus: row.sync_status,
    tripLocalId: row.trip_local_id,
    userId: row.user_id,
  });
}

function calculateDistanceBetweenPoints(left: TripPoint, right: TripPoint): number {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = ((right.latitude - left.latitude) * Math.PI) / 180;
  const deltaLongitude = ((right.longitude - left.longitude) * Math.PI) / 180;
  const latitudeLeft = (left.latitude * Math.PI) / 180;
  const latitudeRight = (right.latitude * Math.PI) / 180;

  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(latitudeLeft) *
      Math.cos(latitudeRight) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * arc;
}

function calculateTripDistanceMeters(tripPoints: TripPoint[]): number {
  if (tripPoints.length < 2) {
    return 0;
  }

  let totalDistanceMeters = 0;

  for (let index = 1; index < tripPoints.length; index += 1) {
    const segmentDistance = calculateDistanceBetweenPoints(tripPoints[index - 1], tripPoints[index]);

    if (segmentDistance >= 5) {
      totalDistanceMeters += segmentDistance;
    }
  }

  return totalDistanceMeters;
}

function calculateSegmentedTripDistanceMeters(tripPoints: TripPoint[]): number {
  const tripPointsBySegmentLocalId = groupTripPointsBySegmentLocalId(tripPoints);

  if (tripPointsBySegmentLocalId.size === 0) {
    return calculateTripDistanceMeters(tripPoints);
  }

  let totalDistanceMeters = 0;

  for (const segmentTripPoints of tripPointsBySegmentLocalId.values()) {
    totalDistanceMeters += calculateTripDistanceMeters(segmentTripPoints);
  }

  return totalDistanceMeters;
}

function calculateSegmentDurationMs(segment: TripSegmentStatsSourceRow): number {
  const startedAt = new Date(segment.started_at).getTime();
  const endedAt = new Date(segment.ended_at ?? new Date().toISOString()).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return endedAt - startedAt;
}

function groupTripPointsByTripLocalId(tripPoints: TripPoint[]): Map<string, TripPoint[]> {
  const groupedTripPoints = new Map<string, TripPoint[]>();

  for (const tripPoint of tripPoints) {
    const existingTripPoints = groupedTripPoints.get(tripPoint.tripLocalId);

    if (existingTripPoints) {
      existingTripPoints.push(tripPoint);
    } else {
      groupedTripPoints.set(tripPoint.tripLocalId, [tripPoint]);
    }
  }

  for (const groupedPoints of groupedTripPoints.values()) {
    groupedPoints.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  return groupedTripPoints;
}

function groupTripPointsBySegmentLocalId(tripPoints: TripPoint[]): Map<string, TripPoint[]> {
  const groupedTripPoints = new Map<string, TripPoint[]>();

  for (const tripPoint of tripPoints) {
    if (!tripPoint.segmentLocalId) {
      continue;
    }

    const existingTripPoints = groupedTripPoints.get(tripPoint.segmentLocalId);

    if (existingTripPoints) {
      existingTripPoints.push(tripPoint);
    } else {
      groupedTripPoints.set(tripPoint.segmentLocalId, [tripPoint]);
    }
  }

  for (const groupedPoints of groupedTripPoints.values()) {
    groupedPoints.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  return groupedTripPoints;
}

async function replaceTripStats(
  database: Awaited<ReturnType<typeof getDatabase>>,
  groupedTripPoints: Map<string, TripPoint[]>,
) {
  await database.runAsync("DELETE FROM trip_stats");
  await database.runAsync(`
    UPDATE trips
    SET point_count = NULL,
        distance_meters = NULL,
        stats_updated_at = NULL
  `);

  const updatedAt = new Date().toISOString();

  for (const [tripLocalId, groupedPoints] of groupedTripPoints.entries()) {
    const distanceMeters = calculateSegmentedTripDistanceMeters(groupedPoints);

    await database.runAsync(
      `INSERT INTO trip_stats (
        trip_local_id,
        point_count,
        distance_meters,
        updated_at
      ) VALUES (?, ?, ?, ?)`,
      tripLocalId,
      groupedPoints.length,
      distanceMeters,
      updatedAt,
    );
    await database.runAsync(
      `UPDATE trips
       SET point_count = ?,
           distance_meters = ?,
           stats_updated_at = ?
       WHERE local_id = ?`,
      groupedPoints.length,
      distanceMeters,
      updatedAt,
      tripLocalId,
    );
  }
}

async function updateTripSegmentStatsForTripLocalIds(
  database: Awaited<ReturnType<typeof getDatabase>>,
  tripLocalIds: string[],
) {
  if (tripLocalIds.length === 0) {
    return;
  }

  const placeholders = tripLocalIds.map(() => "?").join(", ");
  const segments = await database.getAllAsync<TripSegmentStatsSourceRow>(
    `SELECT local_id, trip_local_id, started_at, ended_at
     FROM trip_segments
     WHERE trip_local_id IN (${placeholders})
     ORDER BY started_at ASC, local_id ASC`,
    ...tripLocalIds,
  );

  await database.runAsync(
    `DELETE FROM trip_segment_stats WHERE trip_local_id IN (${placeholders})`,
    ...tripLocalIds,
  );
  await database.runAsync(
    `UPDATE trip_segments
     SET point_count = NULL,
         distance_meters = NULL,
         duration_ms = NULL,
         stats_updated_at = NULL
     WHERE trip_local_id IN (${placeholders})`,
    ...tripLocalIds,
  );

  if (segments.length === 0) {
    return;
  }

  const segmentIds = segments.map((segment) => segment.local_id);
  const segmentPlaceholders = segmentIds.map(() => "?").join(", ");
  const tripPointRows = await database.getAllAsync<TripPointRow>(
    `SELECT * FROM trip_points
     WHERE segment_local_id IN (${segmentPlaceholders})
     ORDER BY recorded_at ASC, local_id ASC`,
    ...segmentIds,
  );
  const tripPointsBySegmentLocalId = groupTripPointsBySegmentLocalId(
    tripPointRows.map(toTripPoint),
  );
  const updatedAt = new Date().toISOString();

  for (const segment of segments) {
    const segmentTripPoints = tripPointsBySegmentLocalId.get(segment.local_id) ?? [];
    const distanceMeters = calculateTripDistanceMeters(segmentTripPoints);
    const durationMs = calculateSegmentDurationMs(segment);

    await database.runAsync(
      `INSERT INTO trip_segment_stats (
        segment_local_id,
        trip_local_id,
        point_count,
        distance_meters,
        duration_ms,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      segment.local_id,
      segment.trip_local_id,
      segmentTripPoints.length,
      distanceMeters,
      durationMs,
      updatedAt,
    );
    await database.runAsync(
      `UPDATE trip_segments
       SET point_count = ?,
           distance_meters = ?,
           duration_ms = ?,
           stats_updated_at = ?
       WHERE local_id = ?`,
      segmentTripPoints.length,
      distanceMeters,
      durationMs,
      updatedAt,
      segment.local_id,
    );
  }
}

async function updateTripStatsForTripLocalIds(
  database: Awaited<ReturnType<typeof getDatabase>>,
  groupedTripPoints: Map<string, TripPoint[]>,
  tripLocalIds: string[],
) {
  const updatedAt = new Date().toISOString();

  for (const tripLocalId of tripLocalIds) {
    await database.runAsync("DELETE FROM trip_stats WHERE trip_local_id = ?", tripLocalId);

    const groupedPoints = groupedTripPoints.get(tripLocalId);
    const pointCount = groupedPoints?.length ?? 0;
    const distanceMeters = groupedPoints ? calculateSegmentedTripDistanceMeters(groupedPoints) : 0;

    await database.runAsync(
      `INSERT INTO trip_stats (
        trip_local_id,
        point_count,
        distance_meters,
        updated_at
      ) VALUES (?, ?, ?, ?)`,
      tripLocalId,
      pointCount,
      distanceMeters,
      updatedAt,
    );
    await database.runAsync(
      `UPDATE trips
       SET point_count = ?,
           distance_meters = ?,
           stats_updated_at = ?
       WHERE local_id = ?`,
      pointCount,
      distanceMeters,
      updatedAt,
      tripLocalId,
    );
  }
}

export async function refreshTripStatsForTripLocalIds(tripLocalIds: string[]): Promise<void> {
  await ensureTripPointsMigrated();

  const uniqueTripLocalIds = Array.from(new Set(tripLocalIds));

  if (uniqueTripLocalIds.length === 0) {
    return;
  }

  const database = await getDatabase();
  const placeholders = uniqueTripLocalIds.map(() => "?").join(", ");
  const rows = await database.getAllAsync<TripPointRow>(
    `SELECT * FROM trip_points WHERE trip_local_id IN (${placeholders}) ORDER BY recorded_at ASC, local_id ASC`,
    ...uniqueTripLocalIds,
  );
  const groupedTripPoints = groupTripPointsByTripLocalId(rows.map(toTripPoint));

  await runExclusiveDatabaseWrite(async (database) => {
    await updateTripStatsForTripLocalIds(database, groupedTripPoints, uniqueTripLocalIds);
  });
}

export async function refreshTripStatsForTripLocalId(tripLocalId: string): Promise<void> {
  await refreshTripStatsForTripLocalIds([tripLocalId]);
}

export async function refreshTripSegmentStatsForTripLocalIds(tripLocalIds: string[]): Promise<void> {
  await ensureTripPointsMigrated();

  await runExclusiveDatabaseWrite(async (database) => {
    await updateTripSegmentStatsForTripLocalIds(database, Array.from(new Set(tripLocalIds)));
  });
}

export async function refreshTripSegmentStatsForTripLocalId(tripLocalId: string): Promise<void> {
  await refreshTripSegmentStatsForTripLocalIds([tripLocalId]);
}

async function loadLegacyTripPointsFromAsyncStorage(): Promise<TripPoint[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripPoints);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as (Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">)[]
  ).map(normalizeTripPoint);
}

async function ensureTripPointsMigrated(): Promise<void> {
  await migrateOnce("async-storage/trip-points", async () => {
    const database = await getDatabase();
    const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trip_points");

    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const legacyTripPoints = await loadLegacyTripPointsFromAsyncStorage();

    if (legacyTripPoints.length === 0) {
      return;
    }

    await runExclusiveDatabaseWrite(async (database) => {
      for (const tripPoint of legacyTripPoints) {
        const row = toTripPointRow(tripPoint);
        await database.runAsync(
          `INSERT OR REPLACE INTO trip_points (
            local_id,
            server_id,
            trip_local_id,
            segment_local_id,
            device_id,
            user_id,
            latitude,
            longitude,
            recorded_at,
            accuracy,
            altitude,
            speed,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.segment_local_id,
          row.device_id,
          row.user_id,
          row.latitude,
          row.longitude,
          row.recorded_at,
          row.accuracy,
          row.altitude,
          row.speed,
          row.sync_status,
        );
      }
    });
  });
}

export async function loadTripPoints(): Promise<TripPoint[]> {
  await ensureTripPointsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripPointRow>(
    "SELECT * FROM trip_points ORDER BY recorded_at ASC, local_id ASC",
  );

  return rows.map(toTripPoint);
}

export async function loadTripPointsForTrip(tripLocalId: string): Promise<TripPoint[]> {
  await ensureTripPointsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripPointRow>(
    "SELECT * FROM trip_points WHERE trip_local_id = ? ORDER BY recorded_at ASC, local_id ASC",
    tripLocalId,
  );

  return rows.map(toTripPoint);
}

export async function replaceTripPointsForTrip(
  tripLocalId: string,
  tripPoints: TripPoint[],
): Promise<void> {
  await ensureTripPointsMigrated();

  const nextTripPoints = tripPoints
    .filter((tripPoint) => tripPoint.tripLocalId === tripLocalId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_points WHERE trip_local_id = ?", tripLocalId);

    for (const tripPoint of nextTripPoints) {
      const row = toTripPointRow(tripPoint);
      await database.runAsync(
        `INSERT INTO trip_points (
          local_id,
          server_id,
          trip_local_id,
          segment_local_id,
          device_id,
          user_id,
          latitude,
          longitude,
          recorded_at,
          accuracy,
          altitude,
          speed,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.segment_local_id,
        row.device_id,
        row.user_id,
        row.latitude,
        row.longitude,
        row.recorded_at,
        row.accuracy,
        row.altitude,
        row.speed,
        row.sync_status,
      );
    }

    await updateTripStatsForTripLocalIds(
      database,
      groupTripPointsByTripLocalId(nextTripPoints),
      [tripLocalId],
    );
    await updateTripSegmentStatsForTripLocalIds(database, [tripLocalId]);
  });
}

export async function loadTripStatsByTripLocalIds(tripLocalIds: string[]): Promise<Map<string, TripStatsRow>> {
  await ensureTripPointsMigrated();

  if (tripLocalIds.length === 0) {
    return new Map();
  }

  const database = await getDatabase();
  const placeholders = tripLocalIds.map(() => "?").join(", ");
  const rows = await database.getAllAsync<TripStatsRow>(
    `SELECT
       local_id AS trip_local_id,
       point_count,
       distance_meters,
       stats_updated_at AS updated_at
     FROM trips
     WHERE local_id IN (${placeholders})
       AND point_count IS NOT NULL
       AND distance_meters IS NOT NULL
       AND stats_updated_at IS NOT NULL`,
    ...tripLocalIds,
  );
  const rowTripLocalIds = new Set(rows.map((row) => row.trip_local_id));
  const missingTripLocalIds = tripLocalIds.filter((tripLocalId) => !rowTripLocalIds.has(tripLocalId));

  if (missingTripLocalIds.length > 0) {
    const missingPlaceholders = missingTripLocalIds.map(() => "?").join(", ");
    const missingPointRows = await database.getAllAsync<TripPointRow>(
      `SELECT * FROM trip_points WHERE trip_local_id IN (${missingPlaceholders}) ORDER BY recorded_at ASC, local_id ASC`,
      ...missingTripLocalIds,
    );
    const missingTripPointsByTripLocalId = groupTripPointsByTripLocalId(
      missingPointRows.map(toTripPoint),
    );

    if (missingTripPointsByTripLocalId.size > 0) {
      await runExclusiveDatabaseWrite(async (database) => {
        await updateTripStatsForTripLocalIds(
          database,
          missingTripPointsByTripLocalId,
          missingTripLocalIds,
        );
      });

      const nextRows = await database.getAllAsync<TripStatsRow>(
        `SELECT
           local_id AS trip_local_id,
           point_count,
           distance_meters,
           stats_updated_at AS updated_at
         FROM trips
         WHERE local_id IN (${placeholders})
           AND point_count IS NOT NULL
           AND distance_meters IS NOT NULL
           AND stats_updated_at IS NOT NULL`,
        ...tripLocalIds,
      );

      return new Map(nextRows.map((row) => [row.trip_local_id, row]));
    }
  }

  return new Map(rows.map((row) => [row.trip_local_id, row]));
}

export async function loadTripSegmentStatsByTripLocalIds(
  tripLocalIds: string[],
): Promise<Map<string, TripSegmentStatsRow>> {
  await ensureTripPointsMigrated();

  if (tripLocalIds.length === 0) {
    return new Map();
  }

  const database = await getDatabase();
  const placeholders = tripLocalIds.map(() => "?").join(", ");
  const rows = await database.getAllAsync<TripSegmentStatsRow>(
    `SELECT
       local_id AS segment_local_id,
       trip_local_id,
       point_count,
       distance_meters,
       duration_ms,
       stats_updated_at AS updated_at
     FROM trip_segments
     WHERE trip_local_id IN (${placeholders})
       AND point_count IS NOT NULL
       AND distance_meters IS NOT NULL
       AND duration_ms IS NOT NULL
       AND stats_updated_at IS NOT NULL`,
    ...tripLocalIds,
  );
  const rowSegmentLocalIds = new Set(rows.map((row) => row.segment_local_id));
  const segments = await database.getAllAsync<TripSegmentStatsSourceRow>(
    `SELECT local_id, trip_local_id, started_at, ended_at
     FROM trip_segments
     WHERE trip_local_id IN (${placeholders})
     ORDER BY started_at ASC, local_id ASC`,
    ...tripLocalIds,
  );
  const missingStats = segments.some((segment) => !rowSegmentLocalIds.has(segment.local_id));

  if (missingStats) {
    await runExclusiveDatabaseWrite(async (database) => {
      await updateTripSegmentStatsForTripLocalIds(database, Array.from(new Set(tripLocalIds)));
    });

    const nextRows = await database.getAllAsync<TripSegmentStatsRow>(
      `SELECT
         local_id AS segment_local_id,
         trip_local_id,
         point_count,
         distance_meters,
         duration_ms,
         stats_updated_at AS updated_at
       FROM trip_segments
       WHERE trip_local_id IN (${placeholders})
         AND point_count IS NOT NULL
         AND distance_meters IS NOT NULL
         AND duration_ms IS NOT NULL
         AND stats_updated_at IS NOT NULL`,
      ...tripLocalIds,
    );

    return new Map(nextRows.map((row) => [row.segment_local_id, row]));
  }

  return new Map(rows.map((row) => [row.segment_local_id, row]));
}

function areTripPointsEqual(left: TripPoint, right: TripPoint): boolean {
  return (
    left.localId === right.localId &&
    left.serverId === right.serverId &&
    left.tripLocalId === right.tripLocalId &&
    left.segmentLocalId === right.segmentLocalId &&
    left.deviceId === right.deviceId &&
    left.userId === right.userId &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.recordedAt === right.recordedAt &&
    left.accuracy === right.accuracy &&
    left.altitude === right.altitude &&
    left.speed === right.speed &&
    left.syncStatus === right.syncStatus
  );
}

export async function saveTripPoints(
  tripPoints: TripPoint[],
  previousTripPoints?: TripPoint[],
): Promise<void> {
  await ensureTripPointsMigrated();

  if (!previousTripPoints) {
    await runExclusiveDatabaseWrite(async (database) => {
      await database.runAsync("DELETE FROM trip_points");

      for (const tripPoint of tripPoints) {
        const row = toTripPointRow(tripPoint);
        await database.runAsync(
          `INSERT INTO trip_points (
            local_id,
            server_id,
            trip_local_id,
            segment_local_id,
            device_id,
            user_id,
            latitude,
            longitude,
            recorded_at,
            accuracy,
            altitude,
            speed,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.segment_local_id,
          row.device_id,
          row.user_id,
          row.latitude,
          row.longitude,
          row.recorded_at,
          row.accuracy,
          row.altitude,
          row.speed,
          row.sync_status,
        );
      }

      await replaceTripStats(database, groupTripPointsByTripLocalId(tripPoints));
      await updateTripSegmentStatsForTripLocalIds(
        database,
        Array.from(groupTripPointsByTripLocalId(tripPoints).keys()),
      );
    });

    return;
  }

  const previousTripPointsById = new Map(previousTripPoints.map((tripPoint) => [tripPoint.localId, tripPoint]));
  const nextTripPointsById = new Map(tripPoints.map((tripPoint) => [tripPoint.localId, tripPoint]));
  const removedTripPointIds = previousTripPoints
    .filter((tripPoint) => !nextTripPointsById.has(tripPoint.localId))
    .map((tripPoint) => tripPoint.localId);
  const upsertTripPoints = tripPoints.filter((tripPoint) => {
    const previousTripPoint = previousTripPointsById.get(tripPoint.localId);
    return !previousTripPoint || !areTripPointsEqual(previousTripPoint, tripPoint);
  });

  if (removedTripPointIds.length === 0 && upsertTripPoints.length === 0) {
    return;
  }

  const affectedTripLocalIds = Array.from(
    new Set([
      ...upsertTripPoints.map((tripPoint) => tripPoint.tripLocalId),
      ...previousTripPoints
        .filter((tripPoint) => removedTripPointIds.includes(tripPoint.localId))
        .map((tripPoint) => tripPoint.tripLocalId),
    ]),
  );

  await runExclusiveDatabaseWrite(async (database) => {
    for (const localId of removedTripPointIds) {
      await database.runAsync("DELETE FROM trip_points WHERE local_id = ?", localId);
    }

    for (const tripPoint of upsertTripPoints) {
      const row = toTripPointRow(tripPoint);
      await database.runAsync(
        `INSERT OR REPLACE INTO trip_points (
          local_id,
          server_id,
          trip_local_id,
          segment_local_id,
          device_id,
          user_id,
          latitude,
          longitude,
          recorded_at,
          accuracy,
          altitude,
          speed,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.segment_local_id,
        row.device_id,
        row.user_id,
        row.latitude,
        row.longitude,
        row.recorded_at,
        row.accuracy,
        row.altitude,
        row.speed,
        row.sync_status,
      );
    }

    await updateTripStatsForTripLocalIds(
      database,
      groupTripPointsByTripLocalId(tripPoints),
      affectedTripLocalIds,
    );
    await updateTripSegmentStatsForTripLocalIds(database, affectedTripLocalIds);
  });
}
