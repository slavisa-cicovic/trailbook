import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripSegment } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";
import { refreshTripSegmentStatsForTripLocalIds, refreshTripStatsForTripLocalIds } from "./trip-points-storage";

function normalizeTripSegment(
  value: Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripSegment {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    pointCount: value.pointCount ?? null,
    distanceMeters: value.distanceMeters ?? null,
    durationMs: value.durationMs ?? null,
    statsUpdatedAt: value.statsUpdatedAt ?? null,
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface TripSegmentRow {
  created_at: string;
  device_id: string;
  ended_at: string | null;
  local_id: string;
  recording_profile: TripSegment["recordingProfile"];
  point_count: number | null;
  distance_meters: number | null;
  duration_ms: number | null;
  stats_updated_at: string | null;
  server_id: string | null;
  started_at: string;
  sync_status: TripSegment["syncStatus"];
  trip_local_id: string;
  updated_at: string;
  user_id: string;
}

function toTripSegmentRow(tripSegment: TripSegment): TripSegmentRow {
  return {
    created_at: tripSegment.createdAt,
    device_id: tripSegment.deviceId,
    ended_at: tripSegment.endedAt,
    local_id: tripSegment.localId,
    recording_profile: tripSegment.recordingProfile,
    point_count: tripSegment.pointCount,
    distance_meters: tripSegment.distanceMeters,
    duration_ms: tripSegment.durationMs,
    stats_updated_at: tripSegment.statsUpdatedAt,
    server_id: tripSegment.serverId,
    started_at: tripSegment.startedAt,
    sync_status: tripSegment.syncStatus,
    trip_local_id: tripSegment.tripLocalId,
    updated_at: tripSegment.updatedAt,
    user_id: tripSegment.userId,
  };
}

function toTripSegmentFromRow(row: TripSegmentRow): TripSegment {
  return normalizeTripSegment({
    createdAt: row.created_at,
    deviceId: row.device_id,
    endedAt: row.ended_at,
    localId: row.local_id,
    recordingProfile: row.recording_profile,
    pointCount: row.point_count,
    distanceMeters: row.distance_meters,
    durationMs: row.duration_ms,
    statsUpdatedAt: row.stats_updated_at,
    serverId: row.server_id,
    startedAt: row.started_at,
    syncStatus: row.sync_status,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
  });
}

async function loadLegacyTripSegmentsFromAsyncStorage(): Promise<TripSegment[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripSegments);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as (Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">)[]
  ).map(normalizeTripSegment);
}

async function ensureTripSegmentsMigrated(): Promise<void> {
  await migrateOnce("async-storage/trip-segments", async () => {
    const database = await getDatabase();
    const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trip_segments");

    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const legacyTripSegments = await loadLegacyTripSegmentsFromAsyncStorage();

    if (legacyTripSegments.length === 0) {
      return;
    }

    await runExclusiveDatabaseWrite(async (database) => {
      for (const tripSegment of legacyTripSegments) {
        const row = toTripSegmentRow(tripSegment);
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
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.device_id,
          row.user_id,
          row.recording_profile,
          row.point_count,
          row.distance_meters,
          row.duration_ms,
          row.stats_updated_at,
          row.started_at,
          row.ended_at,
          row.created_at,
          row.updated_at,
          row.sync_status,
        );
      }
    });

    await refreshTripSegmentStatsForTripLocalIds(
      Array.from(new Set(legacyTripSegments.map((tripSegment) => tripSegment.tripLocalId))),
    );
    await refreshTripStatsForTripLocalIds(
      Array.from(new Set(legacyTripSegments.map((tripSegment) => tripSegment.tripLocalId))),
    );
  });
}

export async function loadTripSegments(): Promise<TripSegment[]> {
  await ensureTripSegmentsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripSegmentRow>(
    "SELECT * FROM trip_segments ORDER BY started_at ASC, local_id ASC",
  );

  return rows.map(toTripSegmentFromRow);
}

function areTripSegmentsEqual(left: TripSegment, right: TripSegment): boolean {
  return (
    left.localId === right.localId &&
    left.serverId === right.serverId &&
    left.tripLocalId === right.tripLocalId &&
    left.deviceId === right.deviceId &&
    left.userId === right.userId &&
    left.recordingProfile === right.recordingProfile &&
    left.pointCount === right.pointCount &&
    left.distanceMeters === right.distanceMeters &&
    left.durationMs === right.durationMs &&
    left.statsUpdatedAt === right.statsUpdatedAt &&
    left.startedAt === right.startedAt &&
    left.endedAt === right.endedAt &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.syncStatus === right.syncStatus
  );
}

export async function saveTripSegments(
  tripSegments: TripSegment[],
  previousTripSegments?: TripSegment[],
): Promise<void> {
  await ensureTripSegmentsMigrated();

  if (!previousTripSegments) {
    await runExclusiveDatabaseWrite(async (database) => {
      await database.runAsync("DELETE FROM trip_segments");

      for (const tripSegment of tripSegments) {
        const row = toTripSegmentRow(tripSegment);
        await database.runAsync(
          `INSERT INTO trip_segments (
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
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.device_id,
          row.user_id,
          row.recording_profile,
          row.point_count,
          row.distance_meters,
          row.duration_ms,
          row.stats_updated_at,
          row.started_at,
          row.ended_at,
          row.created_at,
          row.updated_at,
          row.sync_status,
        );
      }
    });

    await refreshTripSegmentStatsForTripLocalIds(
      Array.from(new Set(tripSegments.map((tripSegment) => tripSegment.tripLocalId))),
    );
    await refreshTripStatsForTripLocalIds(
      Array.from(new Set(tripSegments.map((tripSegment) => tripSegment.tripLocalId))),
    );
    return;
  }

  const previousTripSegmentsById = new Map(
    previousTripSegments.map((tripSegment) => [tripSegment.localId, tripSegment]),
  );
  const nextTripSegmentsById = new Map(tripSegments.map((tripSegment) => [tripSegment.localId, tripSegment]));
  const removedTripSegments = previousTripSegments.filter(
    (tripSegment) => !nextTripSegmentsById.has(tripSegment.localId),
  );
  const upsertTripSegments = tripSegments.filter((tripSegment) => {
    const previousTripSegment = previousTripSegmentsById.get(tripSegment.localId);
    return !previousTripSegment || !areTripSegmentsEqual(previousTripSegment, tripSegment);
  });

  if (removedTripSegments.length === 0 && upsertTripSegments.length === 0) {
    return;
  }

  const affectedTripLocalIds = Array.from(
    new Set([
      ...removedTripSegments.map((tripSegment) => tripSegment.tripLocalId),
      ...upsertTripSegments.flatMap((tripSegment) => {
        const previousTripSegment = previousTripSegmentsById.get(tripSegment.localId);
        return previousTripSegment
          ? [previousTripSegment.tripLocalId, tripSegment.tripLocalId]
          : [tripSegment.tripLocalId];
      }),
    ]),
  );

  await runExclusiveDatabaseWrite(async (database) => {
    for (const tripSegment of removedTripSegments) {
      await database.runAsync("DELETE FROM trip_segments WHERE local_id = ?", tripSegment.localId);
    }

    for (const tripSegment of upsertTripSegments) {
      const row = toTripSegmentRow(tripSegment);
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
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.device_id,
        row.user_id,
        row.recording_profile,
        row.point_count,
        row.distance_meters,
        row.duration_ms,
        row.stats_updated_at,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.sync_status,
      );
    }
  });

  await refreshTripSegmentStatsForTripLocalIds(affectedTripLocalIds);
  await refreshTripStatsForTripLocalIds(affectedTripLocalIds);
}
