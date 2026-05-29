import type { TripGroup } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface TripGroupRow {
  created_at: string;
  deleted_at: string | null;
  description: string | null;
  device_id: string;
  local_id: string;
  server_id: string | null;
  sync_status: TripGroup["syncStatus"];
  title: string;
  updated_at: string;
  user_id: string;
}

function toTripGroupRow(group: TripGroup): TripGroupRow {
  return {
    created_at: group.createdAt,
    deleted_at: group.deletedAt,
    description: group.description,
    device_id: group.deviceId,
    local_id: group.localId,
    server_id: group.serverId,
    sync_status: group.syncStatus,
    title: group.title,
    updated_at: group.updatedAt,
    user_id: group.userId,
  };
}

function toTripGroupFromRow(row: TripGroupRow): TripGroup {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    deviceId: row.device_id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
  };
}

export async function loadTripGroups(): Promise<TripGroup[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<TripGroupRow>(
    "SELECT * FROM trip_groups ORDER BY updated_at DESC, local_id ASC",
  );

  return rows.map(toTripGroupFromRow);
}

export async function saveTripGroups(groups: TripGroup[]): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_groups");

    for (const group of groups) {
      const row = toTripGroupRow(group);

      await database.runAsync(
        `INSERT INTO trip_groups (
          local_id,
          server_id,
          device_id,
          user_id,
          title,
          description,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.device_id,
        row.user_id,
        row.title,
        row.description,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}
