import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPause } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";

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

interface TripPauseRow {
  created_at: string;
  device_id: string;
  ended_at: string | null;
  local_id: string;
  server_id: string | null;
  started_at: string;
  sync_status: TripPause["syncStatus"];
  trip_local_id: string;
  updated_at: string;
  user_id: string;
}

function toTripPauseRow(tripPause: TripPause): TripPauseRow {
  return {
    created_at: tripPause.createdAt,
    device_id: tripPause.deviceId,
    ended_at: tripPause.endedAt,
    local_id: tripPause.localId,
    server_id: tripPause.serverId,
    started_at: tripPause.startedAt,
    sync_status: tripPause.syncStatus,
    trip_local_id: tripPause.tripLocalId,
    updated_at: tripPause.updatedAt,
    user_id: tripPause.userId,
  };
}

function toTripPauseFromRow(row: TripPauseRow): TripPause {
  return normalizeTripPause({
    createdAt: row.created_at,
    deviceId: row.device_id,
    endedAt: row.ended_at,
    localId: row.local_id,
    serverId: row.server_id,
    startedAt: row.started_at,
    syncStatus: row.sync_status,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
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
    const database = await getDatabase();
    const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trip_pauses");

    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const legacyTripPauses = await loadLegacyTripPausesFromAsyncStorage();

    if (legacyTripPauses.length === 0) {
      return;
    }

    await runExclusiveDatabaseWrite(async (database) => {
      for (const tripPause of legacyTripPauses) {
        const row = toTripPauseRow(tripPause);
        await database.runAsync(
          `INSERT OR REPLACE INTO trip_pauses (
            local_id,
            server_id,
            trip_local_id,
            device_id,
            user_id,
            started_at,
            ended_at,
            created_at,
            updated_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.device_id,
          row.user_id,
          row.started_at,
          row.ended_at,
          row.created_at,
          row.updated_at,
          row.sync_status,
        );
      }
    });
  });
}

export async function loadTripPauses(): Promise<TripPause[]> {
  await ensureTripPausesMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripPauseRow>(
    "SELECT * FROM trip_pauses ORDER BY started_at ASC, local_id ASC",
  );

  return rows.map(toTripPauseFromRow);
}

export async function saveTripPauses(tripPauses: TripPause[]): Promise<void> {
  await ensureTripPausesMigrated();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_pauses");

    for (const tripPause of tripPauses) {
      const row = toTripPauseRow(tripPause);
      await database.runAsync(
        `INSERT INTO trip_pauses (
          local_id,
          server_id,
          trip_local_id,
          device_id,
          user_id,
          started_at,
          ended_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.device_id,
        row.user_id,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.sync_status,
      );
    }
  });
}
