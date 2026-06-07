import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc, eq } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import { normalizeWaypoint } from "../domain/normalize-waypoint";
import type { Waypoint } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { waypoints as waypointsTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";

type WaypointRow = typeof waypointsTable.$inferSelect;
type WaypointInsert = typeof waypointsTable.$inferInsert;

function toWaypointRow(waypoint: Waypoint): WaypointInsert {
  return {
    category: waypoint.category,
    createdAt: waypoint.createdAt,
    deletedAt: waypoint.deletedAt,
    deviceId: waypoint.deviceId,
    latitude: waypoint.latitude,
    localId: waypoint.localId,
    longitude: waypoint.longitude,
    note: waypoint.note,
    segmentLocalId: waypoint.segmentLocalId,
    serverId: waypoint.serverId,
    syncStatus: waypoint.syncStatus,
    title: waypoint.title,
    tripLocalId: waypoint.tripLocalId,
    updatedAt: waypoint.updatedAt,
    userId: waypoint.userId,
  };
}

function toWaypointFromRow(row: WaypointRow): Waypoint {
  return normalizeWaypoint({
    category: row.category as Waypoint["category"],
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
    latitude: row.latitude,
    localId: row.localId,
    longitude: row.longitude,
    note: row.note,
    segmentLocalId: row.segmentLocalId,
    serverId: row.serverId,
    syncStatus: row.syncStatus as Waypoint["syncStatus"],
    title: row.title,
    tripLocalId: row.tripLocalId,
    updatedAt: row.updatedAt,
    userId: row.userId,
  });
}

function toWaypointUpdate(row: WaypointInsert): Omit<WaypointInsert, "localId"> {
  const { localId: _localId, ...update } = row;
  return update;
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
    const database = await getDrizzleDatabase();
    const existingRows = await database.select({ localId: waypointsTable.localId }).from(waypointsTable).limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyWaypoints = await loadLegacyWaypointsFromAsyncStorage();

    if (legacyWaypoints.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(waypointsTable).values(legacyWaypoints.map(toWaypointRow));
    });
  });
}

export async function loadWaypoints(): Promise<Waypoint[]> {
  await ensureWaypointsMigrated();

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(waypointsTable)
    .orderBy(asc(waypointsTable.createdAt), asc(waypointsTable.localId));

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
    await runExclusiveDrizzleWrite(async (database) => {
      await database.delete(waypointsTable);

      if (waypoints.length > 0) {
        await database.insert(waypointsTable).values(waypoints.map(toWaypointRow));
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

  await runExclusiveDrizzleWrite(async (database) => {
    for (const waypoint of removedWaypoints) {
      await database.delete(waypointsTable).where(eq(waypointsTable.localId, waypoint.localId));
    }

    for (const waypoint of upsertWaypoints) {
      const row = toWaypointRow(waypoint);
      await database
        .insert(waypointsTable)
        .values(row)
        .onConflictDoUpdate({
          target: waypointsTable.localId,
          set: toWaypointUpdate(row),
        });
    }
  });
}
