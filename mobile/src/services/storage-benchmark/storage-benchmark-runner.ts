import { asc, eq } from "drizzle-orm";

import type {
  RawLocationEvent,
  RawLocationEventCallbackSource,
  RawLocationEventOrigin,
  RawLocationEventProcessingResult,
  RawLocationEventProcessingStatus,
} from "../../domain/raw-location-event";
import type { TripPoint } from "../../domain/trips";
import {
  insertRawLocationEvents,
  loadRawLocationEventsForTrip,
  replaceRawLocationEventsForTrip,
  updateRawLocationEventProcessingResults,
} from "../../repositories/raw-location-events-repository";
import {
  loadTripPointsForTrip,
  refreshTripSegmentStatsForTripLocalId,
  refreshTripStatsForTripLocalId,
  replaceTripPointsForTrip,
} from "../../repositories/trip-points-repository";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "../../storage/drizzle/db";
import { rawLocationEvents, tripPoints } from "../../storage/drizzle/schema";
import { runExclusiveDatabaseWrite } from "../../storage/sqlite/db";
import {
  createStorageBenchmarkIds,
  generateBenchmarkRawEventProcessingResults,
  generateBenchmarkRawEvents,
  generateBenchmarkTripPoints,
  STORAGE_BENCHMARK_DEVICE_ID,
  STORAGE_BENCHMARK_PREFIX,
  STORAGE_BENCHMARK_USER_ID,
} from "./storage-benchmark.fixtures";
import type {
  StorageBenchmarkGroup,
  StorageBenchmarkImplementation,
  StorageBenchmarkOperation,
  StorageBenchmarkRecommendation,
  StorageBenchmarkReport,
  StorageBenchmarkResult,
  StorageBenchmarkRunOptions,
} from "./storage-benchmark.types";

type RawLocationEventInsert = typeof rawLocationEvents.$inferInsert;
type TripPointInsert = typeof tripPoints.$inferInsert;

interface MeasureOperationInput {
  batchSize: number;
  beforeEach?: () => Promise<void>;
  group: StorageBenchmarkGroup;
  implementation: StorageBenchmarkImplementation;
  operation: StorageBenchmarkOperation;
  rowCount: number;
  runCount: number;
  task: () => Promise<unknown>;
}

const DEFAULT_ROW_COUNT = 500;
const DEFAULT_RUN_COUNT = 3;

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );

  return sortedValues[index];
}

function buildResult(input: Omit<StorageBenchmarkResult, "maxMs" | "medianMs" | "minMs" | "p95Ms">): StorageBenchmarkResult {
  const sortedDurations = [...input.durationsMs].sort((left, right) => left - right);

  return {
    ...input,
    maxMs: sortedDurations[sortedDurations.length - 1] ?? 0,
    medianMs: percentile(sortedDurations, 0.5),
    minMs: sortedDurations[0] ?? 0,
    p95Ms: percentile(sortedDurations, 0.95),
  };
}

async function measureOperation({
  batchSize,
  beforeEach,
  group,
  implementation,
  operation,
  rowCount,
  runCount,
  task,
}: MeasureOperationInput): Promise<StorageBenchmarkResult> {
  const durationsMs: number[] = [];

  for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
    await beforeEach?.();
    const startedAt = nowMs();

    await task();

    durationsMs.push(nowMs() - startedAt);
  }

  return buildResult({
    batchSize,
    durationsMs,
    group,
    implementation,
    operation,
    rowCount,
    runCount,
  });
}

function rawLocationEventToInsert(event: RawLocationEvent): RawLocationEventInsert {
  return {
    acceptedTripPointLocalId: event.acceptedTripPointLocalId,
    accuracy: event.accuracy,
    activeSegmentLocalId: event.activeSegmentLocalId,
    altitude: event.altitude,
    batchId: event.batchId,
    batchIndex: event.batchIndex,
    callbackSource: event.callbackSource,
    latitude: event.latitude,
    localId: event.localId,
    longitude: event.longitude,
    origin: event.origin,
    processedAt: event.processedAt,
    processingDecision: event.processingDecision,
    processingStatus: event.processingStatus,
    receivedAt: event.receivedAt,
    recordedAt: event.recordedAt,
    segmentLocalId: event.segmentLocalId,
    sessionStartedAt: event.sessionStartedAt,
    speed: event.speed,
    tripLocalId: event.tripLocalId,
  };
}

function rawLocationEventFromRow(row: typeof rawLocationEvents.$inferSelect): RawLocationEvent {
  return {
    acceptedTripPointLocalId: row.acceptedTripPointLocalId,
    accuracy: row.accuracy,
    activeSegmentLocalId: row.activeSegmentLocalId,
    altitude: row.altitude,
    batchId: row.batchId,
    batchIndex: row.batchIndex,
    callbackSource: row.callbackSource as RawLocationEventCallbackSource,
    latitude: row.latitude,
    localId: row.localId,
    longitude: row.longitude,
    origin: row.origin as RawLocationEventOrigin,
    processedAt: row.processedAt,
    processingDecision: row.processingDecision,
    processingStatus: row.processingStatus as RawLocationEventProcessingStatus,
    receivedAt: row.receivedAt,
    recordedAt: row.recordedAt,
    segmentLocalId: row.segmentLocalId,
    sessionStartedAt: row.sessionStartedAt,
    speed: row.speed,
    tripLocalId: row.tripLocalId,
  };
}

function tripPointToInsert(point: TripPoint): TripPointInsert {
  return {
    accuracy: point.accuracy,
    altitude: point.altitude,
    deviceId: point.deviceId,
    latitude: point.latitude,
    localId: point.localId,
    longitude: point.longitude,
    recordedAt: point.recordedAt,
    segmentLocalId: point.segmentLocalId,
    serverId: point.serverId,
    speed: point.speed,
    syncStatus: point.syncStatus,
    tripLocalId: point.tripLocalId,
    userId: point.userId,
  };
}

function tripPointFromRow(row: typeof tripPoints.$inferSelect): TripPoint {
  return {
    accuracy: row.accuracy,
    altitude: row.altitude,
    deviceId: row.deviceId,
    latitude: row.latitude,
    localId: row.localId,
    longitude: row.longitude,
    recordedAt: row.recordedAt,
    segmentLocalId: row.segmentLocalId,
    serverId: row.serverId,
    speed: row.speed,
    syncStatus: row.syncStatus as TripPoint["syncStatus"],
    tripLocalId: row.tripLocalId,
    userId: row.userId,
  };
}

async function insertRawLocationEventsWithDrizzle(events: RawLocationEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .insert(rawLocationEvents)
      .values(events.map(rawLocationEventToInsert))
      .onConflictDoNothing();
  });
}

async function updateRawLocationEventProcessingResultsWithDrizzle(
  results: RawLocationEventProcessingResult[],
): Promise<void> {
  if (results.length === 0) {
    return;
  }

  await runExclusiveDrizzleWrite(async (database) => {
    for (const result of results) {
      await database
        .update(rawLocationEvents)
        .set({
          acceptedTripPointLocalId: result.acceptedTripPointLocalId,
          processedAt: result.processedAt,
          processingDecision: result.processingDecision,
          processingStatus: result.processingStatus,
          segmentLocalId: result.segmentLocalId,
        })
        .where(eq(rawLocationEvents.localId, result.localId));
    }
  });
}

async function loadRawLocationEventsForTripWithDrizzle(tripLocalId: string): Promise<RawLocationEvent[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(rawLocationEvents)
    .where(eq(rawLocationEvents.tripLocalId, tripLocalId))
    .orderBy(
      asc(rawLocationEvents.recordedAt),
      asc(rawLocationEvents.batchIndex),
      asc(rawLocationEvents.localId),
    );

  return rows.map(rawLocationEventFromRow);
}

async function replaceRawLocationEventsForTripWithDrizzle(
  tripLocalId: string,
  events: RawLocationEvent[],
): Promise<void> {
  if (events.some((event) => event.tripLocalId !== tripLocalId)) {
    throw new Error("Cannot replace raw events with events from another trip.");
  }

  const rows = [...events]
    .sort((left, right) => {
      const recordedAtCompare = left.recordedAt.localeCompare(right.recordedAt);

      if (recordedAtCompare !== 0) {
        return recordedAtCompare;
      }

      if (left.batchId !== right.batchId) {
        return left.batchId.localeCompare(right.batchId);
      }

      return left.batchIndex - right.batchIndex;
    })
    .map(rawLocationEventToInsert);

  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(rawLocationEvents).where(eq(rawLocationEvents.tripLocalId, tripLocalId));

    if (rows.length > 0) {
      await database.insert(rawLocationEvents).values(rows);
    }
  });
}

async function loadTripPointsForTripWithDrizzle(tripLocalId: string): Promise<TripPoint[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripPoints)
    .where(eq(tripPoints.tripLocalId, tripLocalId))
    .orderBy(asc(tripPoints.recordedAt), asc(tripPoints.localId));

  return rows.map(tripPointFromRow);
}

async function replaceTripPointsForTripWithDrizzle(
  tripLocalId: string,
  points: TripPoint[],
): Promise<void> {
  if (points.some((point) => point.tripLocalId !== tripLocalId)) {
    throw new Error("Cannot replace trip points with points from another trip.");
  }

  const rows = [...points]
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .map(tripPointToInsert);

  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripPoints).where(eq(tripPoints.tripLocalId, tripLocalId));

    if (rows.length > 0) {
      await database.insert(tripPoints).values(rows);
    }
  });

  await refreshTripStatsForTripLocalId(tripLocalId);
  await refreshTripSegmentStatsForTripLocalId(tripLocalId);
}

async function cleanupStorageBenchmarkData(): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    const prefix = `${STORAGE_BENCHMARK_PREFIX}%`;

    await database.runAsync("DELETE FROM raw_location_events WHERE trip_local_id LIKE ?", prefix);
    await database.runAsync("DELETE FROM trip_points WHERE trip_local_id LIKE ?", prefix);
    await database.runAsync("DELETE FROM trip_segment_stats WHERE trip_local_id LIKE ?", prefix);
    await database.runAsync("DELETE FROM trip_stats WHERE trip_local_id LIKE ?", prefix);
    await database.runAsync("DELETE FROM trip_segments WHERE trip_local_id LIKE ?", prefix);
    await database.runAsync("DELETE FROM trips WHERE local_id LIKE ?", prefix);
  });
}

async function clearBenchmarkRowsForTrip(tripLocalId: string): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM raw_location_events WHERE trip_local_id = ?", tripLocalId);
    await database.runAsync("DELETE FROM trip_points WHERE trip_local_id = ?", tripLocalId);
    await database.runAsync("DELETE FROM trip_segment_stats WHERE trip_local_id = ?", tripLocalId);
    await database.runAsync("DELETE FROM trip_stats WHERE trip_local_id = ?", tripLocalId);
    await database.runAsync(
      `UPDATE trips
       SET point_count = NULL,
           distance_meters = NULL,
           stats_updated_at = NULL
       WHERE local_id = ?`,
      tripLocalId,
    );
    await database.runAsync(
      `UPDATE trip_segments
       SET point_count = NULL,
           distance_meters = NULL,
           duration_ms = NULL,
           stats_updated_at = NULL
       WHERE trip_local_id = ?`,
      tripLocalId,
    );
  });
}

async function prepareBenchmarkTrip(tripLocalId: string, segmentLocalId: string, rowCount: number): Promise<void> {
  const startedAt = new Date(Date.UTC(2026, 0, 1, 8, 0, 0)).toISOString();
  const endedAt = new Date(Date.UTC(2026, 0, 1, 8, 0, 0) + Math.max(1, rowCount) * 1000).toISOString();
  const now = new Date().toISOString();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `INSERT OR REPLACE INTO trips (
        local_id,
        server_id,
        device_id,
        user_id,
        title,
        description,
        recording_profile,
        recording_config_json,
        battery_start_level_percent,
        battery_start_state,
        battery_end_level_percent,
        battery_end_state,
        point_count,
        distance_meters,
        stats_updated_at,
        status,
        started_at,
        ended_at,
        created_at,
        updated_at,
        deleted_at,
        sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tripLocalId,
      null,
      STORAGE_BENCHMARK_DEVICE_ID,
      STORAGE_BENCHMARK_USER_ID,
      "Storage benchmark",
      "Synthetic trip for raw SQL vs Drizzle benchmark.",
      "bike",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "ended",
      startedAt,
      endedAt,
      now,
      now,
      null,
      "local-only",
    );
    await database.runAsync(
      `INSERT OR REPLACE INTO trip_segments (
        local_id,
        server_id,
        trip_local_id,
        device_id,
        user_id,
        recording_profile,
        point_count,
        distance_meters,
        duration_ms,
        stats_updated_at,
        started_at,
        ended_at,
        created_at,
        updated_at,
        sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      segmentLocalId,
      null,
      tripLocalId,
      STORAGE_BENCHMARK_DEVICE_ID,
      STORAGE_BENCHMARK_USER_ID,
      "bike",
      null,
      null,
      null,
      null,
      startedAt,
      endedAt,
      now,
      now,
      "local-only",
    );
  });
}

function findResult(
  results: StorageBenchmarkResult[],
  group: StorageBenchmarkGroup,
  operation: StorageBenchmarkOperation,
  implementation: StorageBenchmarkImplementation,
): StorageBenchmarkResult | null {
  return results.find((result) =>
    result.group === group &&
    result.operation === operation &&
    result.implementation === implementation
  ) ?? null;
}

function isDrizzleWithinThreshold(rawResult: StorageBenchmarkResult, drizzleResult: StorageBenchmarkResult): boolean {
  const medianLimit = Math.max(1, rawResult.medianMs * 1.1);
  const p95Limit = Math.max(1, rawResult.p95Ms * 1.2);

  return drizzleResult.medianMs <= medianLimit && drizzleResult.p95Ms <= p95Limit;
}

function resolveRecommendation(results: StorageBenchmarkResult[]): StorageBenchmarkRecommendation {
  const comparisons = results
    .filter((result) => result.implementation === "raw-sql")
    .map((rawResult) => {
      const drizzleResult = findResult(results, rawResult.group, rawResult.operation, "drizzle");

      return drizzleResult
        ? {
            operation: rawResult.operation,
            withinThreshold: isDrizzleWithinThreshold(rawResult, drizzleResult),
          }
        : null;
    })
    .filter((comparison): comparison is { operation: StorageBenchmarkOperation; withinThreshold: boolean } =>
      comparison !== null
    );

  if (comparisons.length > 0 && comparisons.every((comparison) => comparison.withinThreshold)) {
    return "migrate";
  }

  const loadComparisons = comparisons.filter((comparison) => comparison.operation === "load-by-trip");

  if (loadComparisons.length > 0 && loadComparisons.every((comparison) => comparison.withinThreshold)) {
    return "partial-migration";
  }

  return "keep-raw-sql";
}

export async function runStorageBenchmark(options: StorageBenchmarkRunOptions = {}): Promise<StorageBenchmarkReport> {
  const rowCount = options.rowCount ?? DEFAULT_ROW_COUNT;
  const runCount = options.runCount ?? DEFAULT_RUN_COUNT;
  const ids = createStorageBenchmarkIds();
  const rawEvents = generateBenchmarkRawEvents({
    batchId: ids.batchId,
    count: rowCount,
    segmentLocalId: ids.segmentLocalId,
    tripLocalId: ids.tripLocalId,
  });
  const rawEventProcessingResults = generateBenchmarkRawEventProcessingResults(rawEvents, ids.segmentLocalId);
  const points = generateBenchmarkTripPoints({
    count: rowCount,
    segmentLocalId: ids.segmentLocalId,
    tripLocalId: ids.tripLocalId,
  });
  const results: StorageBenchmarkResult[] = [];

  await cleanupStorageBenchmarkData();
  await prepareBenchmarkTrip(ids.tripLocalId, ids.segmentLocalId, rowCount);

  try {
    results.push(await measureOperation({
      batchSize: rowCount,
      beforeEach: () => clearBenchmarkRowsForTrip(ids.tripLocalId),
      group: "raw-location-events",
      implementation: "raw-sql",
      operation: "insert",
      rowCount,
      runCount,
      task: () => insertRawLocationEvents(rawEvents),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      beforeEach: () => clearBenchmarkRowsForTrip(ids.tripLocalId),
      group: "raw-location-events",
      implementation: "drizzle",
      operation: "insert",
      rowCount,
      runCount,
      task: () => insertRawLocationEventsWithDrizzle(rawEvents),
    }));

    await clearBenchmarkRowsForTrip(ids.tripLocalId);
    await insertRawLocationEvents(rawEvents);
    results.push(await measureOperation({
      batchSize: rowCount,
      group: "raw-location-events",
      implementation: "raw-sql",
      operation: "load-by-trip",
      rowCount,
      runCount,
      task: () => loadRawLocationEventsForTrip(ids.tripLocalId),
    }));
    results.push(await measureOperation({
      batchSize: rowCount,
      group: "raw-location-events",
      implementation: "drizzle",
      operation: "load-by-trip",
      rowCount,
      runCount,
      task: () => loadRawLocationEventsForTripWithDrizzle(ids.tripLocalId),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      beforeEach: async () => {
        await clearBenchmarkRowsForTrip(ids.tripLocalId);
        await insertRawLocationEvents(rawEvents);
      },
      group: "raw-location-events",
      implementation: "raw-sql",
      operation: "update-processing",
      rowCount,
      runCount,
      task: () => updateRawLocationEventProcessingResults(rawEventProcessingResults),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      beforeEach: async () => {
        await clearBenchmarkRowsForTrip(ids.tripLocalId);
        await insertRawLocationEvents(rawEvents);
      },
      group: "raw-location-events",
      implementation: "drizzle",
      operation: "update-processing",
      rowCount,
      runCount,
      task: () => updateRawLocationEventProcessingResultsWithDrizzle(rawEventProcessingResults),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      group: "raw-location-events",
      implementation: "raw-sql",
      operation: "replace-by-trip",
      rowCount,
      runCount,
      task: () => replaceRawLocationEventsForTrip(ids.tripLocalId, rawEvents),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      group: "raw-location-events",
      implementation: "drizzle",
      operation: "replace-by-trip",
      rowCount,
      runCount,
      task: () => replaceRawLocationEventsForTripWithDrizzle(ids.tripLocalId, rawEvents),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      group: "trip-points",
      implementation: "raw-sql",
      operation: "replace-by-trip",
      rowCount,
      runCount,
      task: () => replaceTripPointsForTrip(ids.tripLocalId, points),
    }));

    results.push(await measureOperation({
      batchSize: rowCount,
      group: "trip-points",
      implementation: "drizzle",
      operation: "replace-by-trip",
      rowCount,
      runCount,
      task: () => replaceTripPointsForTripWithDrizzle(ids.tripLocalId, points),
    }));

    await replaceTripPointsForTrip(ids.tripLocalId, points);
    results.push(await measureOperation({
      batchSize: rowCount,
      group: "trip-points",
      implementation: "raw-sql",
      operation: "load-by-trip",
      rowCount,
      runCount,
      task: () => loadTripPointsForTrip(ids.tripLocalId),
    }));
    results.push(await measureOperation({
      batchSize: rowCount,
      group: "trip-points",
      implementation: "drizzle",
      operation: "load-by-trip",
      rowCount,
      runCount,
      task: () => loadTripPointsForTripWithDrizzle(ids.tripLocalId),
    }));
  } finally {
    await cleanupStorageBenchmarkData();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    recommendation: resolveRecommendation(results),
    results,
    rowCount,
    runCount,
    segmentLocalId: ids.segmentLocalId,
    tripLocalId: ids.tripLocalId,
  };

  console.warn("[Trailbook][storage-benchmark]", report);

  return report;
}
