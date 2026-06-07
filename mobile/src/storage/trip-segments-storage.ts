import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc, eq } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import { normalizeTripSegment } from "../domain/normalize-trip-segment";
import type { TripSegment } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripSegments as tripSegmentsTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";
import { refreshTripSegmentStatsForTripLocalIds, refreshTripStatsForTripLocalIds } from "./trip-points-storage";

type TripSegmentRow = typeof tripSegmentsTable.$inferSelect;
type TripSegmentInsert = typeof tripSegmentsTable.$inferInsert;

function toTripSegmentRow(tripSegment: TripSegment): TripSegmentInsert {
  return {
    createdAt: tripSegment.createdAt,
    deviceId: tripSegment.deviceId,
    distanceMeters: tripSegment.distanceMeters,
    durationMs: tripSegment.durationMs,
    endedAt: tripSegment.endedAt,
    localId: tripSegment.localId,
    pointCount: tripSegment.pointCount,
    recordingProfile: tripSegment.recordingProfile,
    serverId: tripSegment.serverId,
    startedAt: tripSegment.startedAt,
    statsUpdatedAt: tripSegment.statsUpdatedAt,
    syncStatus: tripSegment.syncStatus,
    tripLocalId: tripSegment.tripLocalId,
    updatedAt: tripSegment.updatedAt,
    userId: tripSegment.userId,
  };
}

function toTripSegmentFromRow(row: TripSegmentRow): TripSegment {
  return normalizeTripSegment({
    createdAt: row.createdAt,
    deviceId: row.deviceId,
    distanceMeters: row.distanceMeters,
    durationMs: row.durationMs,
    endedAt: row.endedAt,
    localId: row.localId,
    pointCount: row.pointCount,
    recordingProfile: row.recordingProfile as TripSegment["recordingProfile"],
    serverId: row.serverId,
    startedAt: row.startedAt,
    statsUpdatedAt: row.statsUpdatedAt,
    syncStatus: row.syncStatus as TripSegment["syncStatus"],
    tripLocalId: row.tripLocalId,
    updatedAt: row.updatedAt,
    userId: row.userId,
  });
}

function toTripSegmentUpdate(row: TripSegmentInsert): Omit<TripSegmentInsert, "localId"> {
  const { localId: _localId, ...update } = row;
  return update;
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
    const database = await getDrizzleDatabase();
    const existingRows = await database
      .select({ localId: tripSegmentsTable.localId })
      .from(tripSegmentsTable)
      .limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyTripSegments = await loadLegacyTripSegmentsFromAsyncStorage();

    if (legacyTripSegments.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(tripSegmentsTable).values(legacyTripSegments.map(toTripSegmentRow));
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

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripSegmentsTable)
    .orderBy(asc(tripSegmentsTable.startedAt), asc(tripSegmentsTable.localId));

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
    await runExclusiveDrizzleWrite(async (database) => {
      await database.delete(tripSegmentsTable);

      if (tripSegments.length > 0) {
        await database.insert(tripSegmentsTable).values(tripSegments.map(toTripSegmentRow));
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

  await runExclusiveDrizzleWrite(async (database) => {
    for (const tripSegment of removedTripSegments) {
      await database.delete(tripSegmentsTable).where(eq(tripSegmentsTable.localId, tripSegment.localId));
    }

    for (const tripSegment of upsertTripSegments) {
      const row = toTripSegmentRow(tripSegment);
      await database
        .insert(tripSegmentsTable)
        .values(row)
        .onConflictDoUpdate({
          target: tripSegmentsTable.localId,
          set: toTripSegmentUpdate(row),
        });
    }
  });

  await refreshTripSegmentStatsForTripLocalIds(affectedTripLocalIds);
  await refreshTripStatsForTripLocalIds(affectedTripLocalIds);
}
