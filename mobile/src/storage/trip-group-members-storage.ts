import type { TripGroupMember } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface TripGroupMemberRow {
  created_at: string;
  deleted_at: string | null;
  device_id: string;
  group_local_id: string;
  local_id: string;
  server_id: string | null;
  sort_order: number;
  sync_status: TripGroupMember["syncStatus"];
  trip_local_id: string;
  updated_at: string;
  user_id: string;
}

function toTripGroupMemberRow(member: TripGroupMember): TripGroupMemberRow {
  return {
    created_at: member.createdAt,
    deleted_at: member.deletedAt,
    device_id: member.deviceId,
    group_local_id: member.groupLocalId,
    local_id: member.localId,
    server_id: member.serverId,
    sort_order: member.sortOrder,
    sync_status: member.syncStatus,
    trip_local_id: member.tripLocalId,
    updated_at: member.updatedAt,
    user_id: member.userId,
  };
}

function toTripGroupMemberFromRow(row: TripGroupMemberRow): TripGroupMember {
  return {
    localId: row.local_id,
    serverId: row.server_id,
    groupLocalId: row.group_local_id,
    tripLocalId: row.trip_local_id,
    deviceId: row.device_id,
    userId: row.user_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
  };
}

export async function loadTripGroupMembers(): Promise<TripGroupMember[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<TripGroupMemberRow>(
    "SELECT * FROM trip_group_members ORDER BY group_local_id ASC, sort_order ASC, created_at ASC",
  );

  return rows.map(toTripGroupMemberFromRow);
}

export async function saveTripGroupMembers(members: TripGroupMember[]): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_group_members");

    for (const member of members) {
      const row = toTripGroupMemberRow(member);

      await database.runAsync(
        `INSERT INTO trip_group_members (
          local_id,
          server_id,
          group_local_id,
          trip_local_id,
          device_id,
          user_id,
          sort_order,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.group_local_id,
        row.trip_local_id,
        row.device_id,
        row.user_id,
        row.sort_order,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}
