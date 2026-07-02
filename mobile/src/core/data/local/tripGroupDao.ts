import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/core/db';
import { dbEvents } from '@/core/db/events';
import { tripGroupMembers, tripGroups } from '@/core/db/schema';
import type { SyncState } from '@/core/domain/model/trip';
import type { TripGroup, TripGroupMember, TripGroupWithMembers } from '@/core/domain/model/tripGroup';

type NewTripGroup = Omit<TripGroup, 'syncState'> & { syncState?: SyncState };
type NewTripGroupMember = Omit<TripGroupMember, 'syncState'> & { syncState?: SyncState };

function groupToRow(group: NewTripGroup) {
  return {
    id: group.id,
    title: group.title,
    description: group.description,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    deletedAt: group.deletedAt?.toISOString() ?? null,
    syncState: group.syncState ?? 'PENDING',
  };
}

function memberToRow(member: NewTripGroupMember) {
  return {
    id: member.id,
    groupId: member.groupId,
    tripClientId: member.tripClientId,
    orderIndex: member.orderIndex,
    addedAt: member.addedAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    removedAt: member.removedAt?.toISOString() ?? null,
    syncState: member.syncState ?? 'PENDING',
  };
}

function groupToDomain(row: typeof tripGroups.$inferSelect): TripGroup {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
    syncState: row.syncState as SyncState,
  };
}

function memberToDomain(row: typeof tripGroupMembers.$inferSelect): TripGroupMember {
  return {
    id: row.id,
    groupId: row.groupId,
    tripClientId: row.tripClientId,
    orderIndex: row.orderIndex,
    addedAt: new Date(row.addedAt),
    updatedAt: new Date(row.updatedAt),
    removedAt: row.removedAt ? new Date(row.removedAt) : null,
    syncState: row.syncState as SyncState,
  };
}

export async function getActiveGroups(): Promise<TripGroup[]> {
  const rows = await db.select().from(tripGroups).where(isNull(tripGroups.deletedAt));
  return rows.map(groupToDomain).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getGroupById(groupId: string): Promise<TripGroup | null> {
  const rows = await db.select().from(tripGroups).where(eq(tripGroups.id, groupId));
  return rows[0] ? groupToDomain(rows[0]) : null;
}

export async function getActiveMembers(): Promise<TripGroupMember[]> {
  const rows = await db.select().from(tripGroupMembers).where(isNull(tripGroupMembers.removedAt));
  return rows.map(memberToDomain).sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function getActiveMembersForGroup(groupId: string): Promise<TripGroupMember[]> {
  const rows = await db
    .select()
    .from(tripGroupMembers)
    .where(and(eq(tripGroupMembers.groupId, groupId), isNull(tripGroupMembers.removedAt)));
  return rows.map(memberToDomain).sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function getGroupsWithMembers(): Promise<TripGroupWithMembers[]> {
  const [groups, members] = await Promise.all([getActiveGroups(), getActiveMembers()]);
  return groups.map((group) => ({
    group,
    members: members.filter((member) => member.groupId === group.id),
  }));
}

export async function getPendingGroups(): Promise<TripGroup[]> {
  const rows = await db.select().from(tripGroups).where(ne(tripGroups.syncState, 'SYNCED'));
  return rows.map(groupToDomain);
}

export async function getPendingMembers(): Promise<TripGroupMember[]> {
  const rows = await db.select().from(tripGroupMembers).where(ne(tripGroupMembers.syncState, 'SYNCED'));
  return rows.map(memberToDomain);
}

export async function upsertGroup(group: NewTripGroup): Promise<void> {
  await db
    .insert(tripGroups)
    .values(groupToRow(group))
    .onConflictDoUpdate({
      target: tripGroups.id,
      set: groupToRow(group),
    });
  dbEvents.emit('tripGroups:changed');
}

export async function upsertMembers(members: NewTripGroupMember[]): Promise<void> {
  for (const member of members) {
    await db
      .insert(tripGroupMembers)
      .values(memberToRow(member))
      .onConflictDoUpdate({
        target: tripGroupMembers.id,
        set: memberToRow(member),
      });
  }
  dbEvents.emit('tripGroups:changed');
}

export async function markSynced(groupIds: string[], memberIds: string[]): Promise<void> {
  if (groupIds.length > 0) {
    await db.update(tripGroups).set({ syncState: 'SYNCED' }).where(inArray(tripGroups.id, groupIds));
  }
  if (memberIds.length > 0) {
    await db
      .update(tripGroupMembers)
      .set({ syncState: 'SYNCED' })
      .where(inArray(tripGroupMembers.id, memberIds));
  }
  dbEvents.emit('tripGroups:changed');
}

export async function markPendingGroup(groupId: string): Promise<void> {
  await db.update(tripGroups).set({ syncState: 'PENDING' }).where(eq(tripGroups.id, groupId));
  dbEvents.emit('tripGroups:changed');
}

export async function softDeleteGroup(groupId: string, deletedAt: Date): Promise<void> {
  await db
    .update(tripGroups)
    .set({
      deletedAt: deletedAt.toISOString(),
      updatedAt: deletedAt.toISOString(),
      syncState: 'PENDING',
    })
    .where(eq(tripGroups.id, groupId));
  dbEvents.emit('tripGroups:changed');
}

export async function replaceAll(groups: TripGroup[], members: TripGroupMember[]): Promise<void> {
  await db.delete(tripGroupMembers);
  await db.delete(tripGroups);
  for (const group of groups) {
    await db.insert(tripGroups).values(groupToRow({ ...group, syncState: 'SYNCED' }));
  }
  for (const member of members) {
    await db.insert(tripGroupMembers).values(memberToRow({ ...member, syncState: 'SYNCED' }));
  }
  dbEvents.emit('tripGroups:changed');
}

export async function activeMemberExists(groupId: string, tripClientId: string): Promise<boolean> {
  const rows = await db
    .select({ id: tripGroupMembers.id })
    .from(tripGroupMembers)
    .where(
      and(
        eq(tripGroupMembers.groupId, groupId),
        eq(tripGroupMembers.tripClientId, tripClientId),
        isNull(tripGroupMembers.removedAt),
      ),
    );
  return rows.length > 0;
}
