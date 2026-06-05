import { asc, desc } from "drizzle-orm";

import type { TripGroup } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripGroups as tripGroupsTable } from "./drizzle/schema";

type TripGroupRow = typeof tripGroupsTable.$inferSelect;
type TripGroupInsert = typeof tripGroupsTable.$inferInsert;

function toTripGroupRow(group: TripGroup): TripGroupInsert {
  return {
    createdAt: group.createdAt,
    deletedAt: group.deletedAt,
    description: group.description,
    deviceId: group.deviceId,
    localId: group.localId,
    serverId: group.serverId,
    syncStatus: group.syncStatus,
    title: group.title,
    updatedAt: group.updatedAt,
    userId: group.userId,
  };
}

function toTripGroupFromRow(row: TripGroupRow): TripGroup {
  return {
    localId: row.localId,
    serverId: row.serverId,
    deviceId: row.deviceId,
    userId: row.userId,
    title: row.title,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    syncStatus: row.syncStatus as TripGroup["syncStatus"],
  };
}

export async function loadTripGroups(): Promise<TripGroup[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripGroupsTable)
    .orderBy(desc(tripGroupsTable.updatedAt), asc(tripGroupsTable.localId));

  return rows.map(toTripGroupFromRow);
}

export async function saveTripGroups(groups: TripGroup[]): Promise<void> {
  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripGroupsTable);

    if (groups.length > 0) {
      await database.insert(tripGroupsTable).values(groups.map(toTripGroupRow));
    }
  });
}
