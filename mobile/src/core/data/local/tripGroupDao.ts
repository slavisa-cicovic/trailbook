import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { db } from '@/core/db';
import { dbEvents } from '@/core/db/events';
import { tripGroupMembers, tripGroups } from '@/core/db/schema';
import type { SyncState } from '@/core/domain/model/trip';
import type { TripGroup, TripGroupMember, TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';

type NewTripGroup = Omit<TripGroup, 'syncState'> & { syncState?: SyncState };
type NewTripGroupMember = Omit<TripGroupMember, 'syncState'> & { syncState?: SyncState };

async function requireCurrentOwnerUserId(): Promise<string> {
  const ownerUserId = await authRepository.getLocalUserId();
  if (!ownerUserId) throw new Error('No authenticated local user');
  return ownerUserId;
}

async function getCurrentOwnerUserId(): Promise<string | null> {
  return authRepository.getLocalUserId();
}

function groupToRow(group: NewTripGroup, ownerUserId: string) {
  return {
    id: group.id,
    ownerUserId,
    title: group.title,
    description: group.description,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    deletedAt: group.deletedAt?.toISOString() ?? null,
    syncState: group.syncState ?? 'PENDING',
  };
}

function memberToRow(member: NewTripGroupMember, ownerUserId: string) {
  return {
    id: member.id,
    ownerUserId,
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
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select()
    .from(tripGroups)
    .where(and(eq(tripGroups.ownerUserId, ownerUserId), isNull(tripGroups.deletedAt)));
  return rows.map(groupToDomain).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getGroupById(groupId: string): Promise<TripGroup | null> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return null;
  const rows = await db
    .select()
    .from(tripGroups)
    .where(and(eq(tripGroups.id, groupId), eq(tripGroups.ownerUserId, ownerUserId)));
  return rows[0] ? groupToDomain(rows[0]) : null;
}

export async function getActiveMembers(): Promise<TripGroupMember[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select()
    .from(tripGroupMembers)
    .where(and(eq(tripGroupMembers.ownerUserId, ownerUserId), isNull(tripGroupMembers.removedAt)));
  return rows.map(memberToDomain).sort((a, b) => a.orderIndex - b.orderIndex);
}

export async function getActiveMembersForGroup(groupId: string): Promise<TripGroupMember[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select()
    .from(tripGroupMembers)
    .where(
      and(
        eq(tripGroupMembers.ownerUserId, ownerUserId),
        eq(tripGroupMembers.groupId, groupId),
        isNull(tripGroupMembers.removedAt),
      ),
    );
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
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select()
    .from(tripGroups)
    .where(and(eq(tripGroups.ownerUserId, ownerUserId), ne(tripGroups.syncState, 'SYNCED')));
  return rows.map(groupToDomain);
}

export async function getPendingMembers(): Promise<TripGroupMember[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select()
    .from(tripGroupMembers)
    .where(and(eq(tripGroupMembers.ownerUserId, ownerUserId), ne(tripGroupMembers.syncState, 'SYNCED')));
  return rows.map(memberToDomain);
}

export async function upsertGroup(group: NewTripGroup): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .insert(tripGroups)
    .values(groupToRow(group, ownerUserId))
    .onConflictDoUpdate({
      target: tripGroups.id,
      set: groupToRow(group, ownerUserId),
    });
  dbEvents.emit('tripGroups:changed');
}

export async function upsertMembers(members: NewTripGroupMember[]): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  for (const member of members) {
    await db
      .insert(tripGroupMembers)
      .values(memberToRow(member, ownerUserId))
      .onConflictDoUpdate({
        target: tripGroupMembers.id,
        set: memberToRow(member, ownerUserId),
      });
  }
  dbEvents.emit('tripGroups:changed');
}

export async function markSynced(groupIds: string[], memberIds: string[]): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  if (groupIds.length > 0) {
    await db
      .update(tripGroups)
      .set({ syncState: 'SYNCED' })
      .where(and(eq(tripGroups.ownerUserId, ownerUserId), inArray(tripGroups.id, groupIds)));
  }
  if (memberIds.length > 0) {
    await db
      .update(tripGroupMembers)
      .set({ syncState: 'SYNCED' })
      .where(and(eq(tripGroupMembers.ownerUserId, ownerUserId), inArray(tripGroupMembers.id, memberIds)));
  }
  dbEvents.emit('tripGroups:changed');
}

export async function markPendingGroup(groupId: string): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(tripGroups)
    .set({ syncState: 'PENDING' })
    .where(and(eq(tripGroups.id, groupId), eq(tripGroups.ownerUserId, ownerUserId)));
  dbEvents.emit('tripGroups:changed');
}

export async function softDeleteGroup(groupId: string, deletedAt: Date): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(tripGroups)
    .set({
      deletedAt: deletedAt.toISOString(),
      updatedAt: deletedAt.toISOString(),
      syncState: 'PENDING',
    })
    .where(and(eq(tripGroups.id, groupId), eq(tripGroups.ownerUserId, ownerUserId)));
  dbEvents.emit('tripGroups:changed');
}

export async function replaceAll(groups: TripGroup[], members: TripGroupMember[]): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db.delete(tripGroupMembers).where(eq(tripGroupMembers.ownerUserId, ownerUserId));
  await db.delete(tripGroups).where(eq(tripGroups.ownerUserId, ownerUserId));
  for (const group of groups) {
    await db.insert(tripGroups).values(groupToRow({ ...group, syncState: 'SYNCED' }, ownerUserId));
  }
  for (const member of members) {
    await db.insert(tripGroupMembers).values(memberToRow({ ...member, syncState: 'SYNCED' }, ownerUserId));
  }
  dbEvents.emit('tripGroups:changed');
}

export async function deleteAllForCurrentUser(): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db.delete(tripGroupMembers).where(eq(tripGroupMembers.ownerUserId, ownerUserId));
  await db.delete(tripGroups).where(eq(tripGroups.ownerUserId, ownerUserId));
  dbEvents.emit('tripGroups:changed');
}

export async function activeMemberExists(groupId: string, tripClientId: string): Promise<boolean> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return false;
  const rows = await db
    .select({ id: tripGroupMembers.id })
    .from(tripGroupMembers)
    .where(
      and(
        eq(tripGroupMembers.groupId, groupId),
        eq(tripGroupMembers.ownerUserId, ownerUserId),
        eq(tripGroupMembers.tripClientId, tripClientId),
        isNull(tripGroupMembers.removedAt),
      ),
    );
  return rows.length > 0;
}
