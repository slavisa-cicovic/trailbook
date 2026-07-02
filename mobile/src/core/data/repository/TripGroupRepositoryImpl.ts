import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { randomUuid } from '@/core/common/uuid';
import type { TripGroup, TripGroupMember, TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import * as tripDao from '@/core/data/local/tripDao';
import * as tripGroupDao from '@/core/data/local/tripGroupDao';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { remoteTripGroupDataSource } from '@/core/data/remote/FetchRemoteTripGroupDataSource';
import {
  groupFromDto,
  groupToDto,
  memberFromDto,
  memberToDto,
} from '@/core/data/remote/dto/tripGroupDto';

export class TripGroupRepositoryImpl {
  listGroups(): Promise<TripGroupWithMembers[]> {
    return tripGroupDao.getGroupsWithMembers();
  }

  async createGroup(
    title: string,
    description: string | null,
    tripClientIds: string[],
  ): Promise<Result<void>> {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return err('Group title is required');

    const validation = await this.validateSyncedTrips(tripClientIds);
    if (!validation.ok) return validation;

    const now = new Date();
    const group: TripGroup = {
      id: randomUuid(),
      title: trimmedTitle,
      description: description?.trim() ? description.trim() : null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncState: 'PENDING',
    };
    const members = tripClientIds.map<TripGroupMember>((tripClientId, index) => ({
      id: randomUuid(),
      groupId: group.id,
      tripClientId,
      orderIndex: index,
      addedAt: now,
      updatedAt: now,
      removedAt: null,
      syncState: 'PENDING',
    }));

    await tripGroupDao.upsertGroup(group);
    await tripGroupDao.upsertMembers(members);
    return ok(undefined);
  }

  async addTripsToGroup(groupId: string, tripClientIds: string[]): Promise<Result<void>> {
    const validation = await this.validateSyncedTrips(tripClientIds);
    if (!validation.ok) return validation;

    const groups = await tripGroupDao.getGroupsWithMembers();
    const target = groups.find((item) => item.group.id === groupId);
    if (!target) return err('Group not found');

    const now = new Date();
    const existingIds = new Set(target.members.map((member) => member.tripClientId));
    const newIds = tripClientIds.filter((tripClientId) => !existingIds.has(tripClientId));
    const startIndex = target.members.length;
    const members = newIds.map<TripGroupMember>((tripClientId, index) => ({
      id: randomUuid(),
      groupId,
      tripClientId,
      orderIndex: startIndex + index,
      addedAt: now,
      updatedAt: now,
      removedAt: null,
      syncState: 'PENDING',
    }));
    if (members.length === 0) return ok(undefined);

    await tripGroupDao.upsertMembers(members);
    await tripGroupDao.markPendingGroup(groupId);
    return ok(undefined);
  }

  async deleteGroup(groupId: string): Promise<Result<void>> {
    const group = await tripGroupDao.getGroupById(groupId);
    if (!group) return err('Group not found');
    await tripGroupDao.softDeleteGroup(groupId, new Date());
    const syncResult = await this.syncDeletedGroup(groupId);
    return syncResult.ok ? ok(undefined) : err(syncResult.error);
  }

  async syncPending(): Promise<Result<void>> {
    if (await authRepository.isDemo()) return err('Demo users cannot sync groups');
    const [groups, members] = await Promise.all([
      tripGroupDao.getPendingGroups(),
      tripGroupDao.getPendingMembers(),
    ]);
    if (groups.length === 0 && members.length === 0) return ok(undefined);

    const result = await remoteTripGroupDataSource.syncGroups({
      groups: groups.map(groupToDto),
      members: members.map(memberToDto),
    });
    if (!result.ok) return err(result.error);

    await tripGroupDao.markSynced(result.value.syncedGroupIds, result.value.syncedMemberIds);
    return ok(undefined);
  }

  async syncGroup(groupId: string): Promise<Result<void>> {
    if (await authRepository.isDemo()) return err('Demo users cannot sync groups');
    const groups = await tripGroupDao.getGroupsWithMembers();
    const target = groups.find((item) => item.group.id === groupId);
    if (!target) return err('Group not found');

    const pendingGroup = target.group.syncState !== 'SYNCED' ? [target.group] : [];
    const pendingMembers = target.members.filter((member) => member.syncState !== 'SYNCED');
    if (pendingGroup.length === 0 && pendingMembers.length === 0) return ok(undefined);

    const result = await remoteTripGroupDataSource.syncGroups({
      groups: pendingGroup.map(groupToDto),
      members: pendingMembers.map(memberToDto),
    });
    if (!result.ok) return err(result.error);

    await tripGroupDao.markSynced(result.value.syncedGroupIds, result.value.syncedMemberIds);
    return ok(undefined);
  }

  private async syncDeletedGroup(groupId: string): Promise<Result<void>> {
    if (await authRepository.isDemo()) return err('Demo users cannot sync groups');
    const group = await tripGroupDao.getGroupById(groupId);
    if (!group) return err('Group not found');

    const result = await remoteTripGroupDataSource.syncGroups({
      groups: [groupToDto(group)],
      members: [],
    });
    if (!result.ok) return err(result.error);

    await tripGroupDao.markSynced(result.value.syncedGroupIds, result.value.syncedMemberIds);
    return ok(undefined);
  }

  async restore(): Promise<Result<void>> {
    if (await authRepository.isDemo()) return err('Demo users cannot restore groups');
    const result = await remoteTripGroupDataSource.fetchGroups();
    if (!result.ok) return err(result.error);
    await tripGroupDao.replaceAll(
      result.value.groups.map(groupFromDto),
      result.value.members.map(memberFromDto),
    );
    return ok(undefined);
  }

  private async validateSyncedTrips(tripClientIds: string[]): Promise<Result<void>> {
    if (tripClientIds.length === 0) return err('Select at least one trip');
    if (await authRepository.isDemo()) return err('Demo users cannot create groups');

    for (const tripClientId of tripClientIds) {
      const trip = await tripDao.getTripByClientId(tripClientId);
      if (!trip) return err('Trip not found');
      if (trip.syncState !== 'SYNCED') {
        return err('Sync trip before adding it to a group');
      }
    }
    return ok(undefined);
  }
}

export const tripGroupRepository = new TripGroupRepositoryImpl();
