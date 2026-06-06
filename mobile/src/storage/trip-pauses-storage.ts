import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPause } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripPauses as tripPausesTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";

type TripPauseRow = typeof tripPausesTable.$inferSelect;
type TripPauseInsert = typeof tripPausesTable.$inferInsert;

function normalizeTripPause(
  value: Partial<TripPause> & Pick<TripPause, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripPause {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

function toTripPauseRow(tripPause: TripPause): TripPauseInsert {
  return {
    createdAt: tripPause.createdAt,
    deviceId: tripPause.deviceId,
    endedAt: tripPause.endedAt,
    localId: tripPause.localId,
    serverId: tripPause.serverId,
    startedAt: tripPause.startedAt,
    syncStatus: tripPause.syncStatus,
    tripLocalId: tripPause.tripLocalId,
    updatedAt: tripPause.updatedAt,
    userId: tripPause.userId,
  };
}

function toTripPauseFromRow(row: TripPauseRow): TripPause {
  return normalizeTripPause({
    createdAt: row.createdAt,
    deviceId: row.deviceId,
    endedAt: row.endedAt,
    localId: row.localId,
    serverId: row.serverId,
    startedAt: row.startedAt,
    syncStatus: row.syncStatus as TripPause["syncStatus"],
    tripLocalId: row.tripLocalId,
    updatedAt: row.updatedAt,
    userId: row.userId,
  });
}

async function loadLegacyTripPausesFromAsyncStorage(): Promise<TripPause[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripPauses);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as (Partial<TripPause> & Pick<TripPause, "localId" | "tripLocalId" | "deviceId" | "userId">)[]
  ).map(normalizeTripPause);
}

async function ensureTripPausesMigrated(): Promise<void> {
  await migrateOnce("async-storage/trip-pauses", async () => {
    const database = await getDrizzleDatabase();
    const existingRows = await database.select({ localId: tripPausesTable.localId }).from(tripPausesTable).limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyTripPauses = await loadLegacyTripPausesFromAsyncStorage();

    if (legacyTripPauses.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(tripPausesTable).values(legacyTripPauses.map(toTripPauseRow));
    });
  });
}

export async function loadTripPauses(): Promise<TripPause[]> {
  await ensureTripPausesMigrated();

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripPausesTable)
    .orderBy(asc(tripPausesTable.startedAt), asc(tripPausesTable.localId));

  return rows.map(toTripPauseFromRow);
}

export async function saveTripPauses(tripPauses: TripPause[]): Promise<void> {
  await ensureTripPausesMigrated();

  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripPausesTable);

    if (tripPauses.length > 0) {
      await database.insert(tripPausesTable).values(tripPauses.map(toTripPauseRow));
    }
  });
}
