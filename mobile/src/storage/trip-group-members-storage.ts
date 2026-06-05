import { asc } from "drizzle-orm";

import type { TripGroupMember } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripGroupMembers as tripGroupMembersTable } from "./drizzle/schema";

type TripGroupMemberRow = typeof tripGroupMembersTable.$inferSelect;
type TripGroupMemberInsert = typeof tripGroupMembersTable.$inferInsert;

function toTripGroupMemberRow(member: TripGroupMember): TripGroupMemberInsert {
  return {
    createdAt: member.createdAt,
    deletedAt: member.deletedAt,
    deviceId: member.deviceId,
    groupLocalId: member.groupLocalId,
    localId: member.localId,
    serverId: member.serverId,
    sortOrder: member.sortOrder,
    syncStatus: member.syncStatus,
    tripLocalId: member.tripLocalId,
    updatedAt: member.updatedAt,
    userId: member.userId,
  };
}

function toTripGroupMemberFromRow(row: TripGroupMemberRow): TripGroupMember {
  return {
    localId: row.localId,
    serverId: row.serverId,
    groupLocalId: row.groupLocalId,
    tripLocalId: row.tripLocalId,
    deviceId: row.deviceId,
    userId: row.userId,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    syncStatus: row.syncStatus as TripGroupMember["syncStatus"],
  };
}

export async function loadTripGroupMembers(): Promise<TripGroupMember[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripGroupMembersTable)
    .orderBy(
      asc(tripGroupMembersTable.groupLocalId),
      asc(tripGroupMembersTable.sortOrder),
      asc(tripGroupMembersTable.createdAt),
    );

  return rows.map(toTripGroupMemberFromRow);
}

export async function saveTripGroupMembers(members: TripGroupMember[]): Promise<void> {
  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripGroupMembersTable);

    if (members.length > 0) {
      await database.insert(tripGroupMembersTable).values(members.map(toTripGroupMemberRow));
    }
  });
}
