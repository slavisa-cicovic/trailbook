import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_WAYPOINT_CATEGORY, normalizeWaypointCategory } from "../constants/waypoint-categories";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Waypoint } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";

function normalizeWaypoint(
  value: Partial<Waypoint> & Pick<Waypoint, "localId" | "tripLocalId" | "deviceId" | "userId">,
): Waypoint {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    segmentLocalId: value.segmentLocalId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    category: normalizeWaypointCategory(value.category ?? DEFAULT_WAYPOINT_CATEGORY),
    title: value.title ?? value.localId,
    note: value.note ?? null,
    createdAt: value.createdAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.createdAt ?? fallbackDate,
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface WaypointRow {
  category: Waypoint["category"];
  created_at: string;
  deleted_at: string | null;
  device_id: string;
  latitude: number;
  local_id: string;
  longitude: number;
  note: string | null;
  segment_local_id: string | null;
  server_id: string | null;
  sync_status: Waypoint["syncStatus"];
  title: string;
  trip_local_id: string;
  updated_at: string;
  user_id: string;
}

function toWaypointRow(waypoint: Waypoint): WaypointRow {
  return {
    category: waypoint.category,
    created_at: waypoint.createdAt,
    deleted_at: waypoint.deletedAt,
    device_id: waypoint.deviceId,
    latitude: waypoint.latitude,
    local_id: waypoint.localId,
    longitude: waypoint.longitude,
    note: waypoint.note,
    segment_local_id: waypoint.segmentLocalId,
    server_id: waypoint.serverId,
    sync_status: waypoint.syncStatus,
    title: waypoint.title,
    trip_local_id: waypoint.tripLocalId,
    updated_at: waypoint.updatedAt,
    user_id: waypoint.userId,
  };
}

function toWaypointFromRow(row: WaypointRow): Waypoint {
  return normalizeWaypoint({
    category: row.category,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id,
    latitude: row.latitude,
    localId: row.local_id,
    longitude: row.longitude,
    note: row.note,
    segmentLocalId: row.segment_local_id,
    serverId: row.server_id,
    syncStatus: row.sync_status,
    title: row.title,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
  });
}

async function loadLegacyWaypointsFromAsyncStorage(): Promise<Waypoint[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.waypoints);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as (Partial<Waypoint> & Pick<Waypoint, "localId" | "tripLocalId" | "deviceId" | "userId">)[]
  ).map(normalizeWaypoint);
}

async function ensureWaypointsMigrated(): Promise<void> {
  await migrateOnce("async-storage/waypoints", async () => {
    const database = await getDatabase();
    const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM waypoints");

    if ((countRow?.count ?? 0) > 0) {
      return;
    }

    const legacyWaypoints = await loadLegacyWaypointsFromAsyncStorage();

    if (legacyWaypoints.length === 0) {
      return;
    }

    await runExclusiveDatabaseWrite(async (database) => {
      for (const waypoint of legacyWaypoints) {
        const row = toWaypointRow(waypoint);
        await database.runAsync(
          `INSERT OR REPLACE INTO waypoints (
            local_id,
            server_id,
            trip_local_id,
            segment_local_id,
            device_id,
            user_id,
            latitude,
            longitude,
            category,
            title,
            note,
            created_at,
            updated_at,
            deleted_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.segment_local_id,
          row.device_id,
          row.user_id,
          row.latitude,
          row.longitude,
          row.category,
          row.title,
          row.note,
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.sync_status,
        );
      }
    });
  });
}

export async function loadWaypoints(): Promise<Waypoint[]> {
  await ensureWaypointsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<WaypointRow>("SELECT * FROM waypoints ORDER BY created_at ASC, local_id ASC");

  return rows.map(toWaypointFromRow);
}

function areWaypointsEqual(left: Waypoint, right: Waypoint): boolean {
  return (
    left.localId === right.localId &&
    left.serverId === right.serverId &&
    left.tripLocalId === right.tripLocalId &&
    left.segmentLocalId === right.segmentLocalId &&
    left.deviceId === right.deviceId &&
    left.userId === right.userId &&
    left.latitude === right.latitude &&
    left.longitude === right.longitude &&
    left.category === right.category &&
    left.title === right.title &&
    left.note === right.note &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.deletedAt === right.deletedAt &&
    left.syncStatus === right.syncStatus
  );
}

export async function saveWaypoints(waypoints: Waypoint[], previousWaypoints?: Waypoint[]): Promise<void> {
  await ensureWaypointsMigrated();

  if (!previousWaypoints) {
    await runExclusiveDatabaseWrite(async (database) => {
      await database.runAsync("DELETE FROM waypoints");

      for (const waypoint of waypoints) {
        const row = toWaypointRow(waypoint);
        await database.runAsync(
          `INSERT INTO waypoints (
            local_id,
            server_id,
            trip_local_id,
            segment_local_id,
            device_id,
            user_id,
            latitude,
            longitude,
            category,
            title,
            note,
            created_at,
            updated_at,
            deleted_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.trip_local_id,
          row.segment_local_id,
          row.device_id,
          row.user_id,
          row.latitude,
          row.longitude,
          row.category,
          row.title,
          row.note,
          row.created_at,
          row.updated_at,
          row.deleted_at,
          row.sync_status,
        );
      }
    });

    return;
  }

  const previousWaypointsById = new Map(previousWaypoints.map((waypoint) => [waypoint.localId, waypoint]));
  const nextWaypointsById = new Map(waypoints.map((waypoint) => [waypoint.localId, waypoint]));
  const removedWaypoints = previousWaypoints.filter((waypoint) => !nextWaypointsById.has(waypoint.localId));
  const upsertWaypoints = waypoints.filter((waypoint) => {
    const previousWaypoint = previousWaypointsById.get(waypoint.localId);
    return !previousWaypoint || !areWaypointsEqual(previousWaypoint, waypoint);
  });

  if (removedWaypoints.length === 0 && upsertWaypoints.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const waypoint of removedWaypoints) {
      await database.runAsync("DELETE FROM waypoints WHERE local_id = ?", waypoint.localId);
    }

    for (const waypoint of upsertWaypoints) {
      const row = toWaypointRow(waypoint);
      await database.runAsync(
        `INSERT OR REPLACE INTO waypoints (
          local_id,
          server_id,
          trip_local_id,
          segment_local_id,
          device_id,
          user_id,
          latitude,
          longitude,
          category,
          title,
          note,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.segment_local_id,
        row.device_id,
        row.user_id,
        row.latitude,
        row.longitude,
        row.category,
        row.title,
        row.note,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}
