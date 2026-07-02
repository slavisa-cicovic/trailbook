import type { TripGroup, TripGroupMember } from '@/core/domain/model/tripGroup';

export interface TripGroupDto {
  clientGroupId: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TripGroupMemberDto {
  clientMemberId: string;
  clientGroupId: string;
  clientTripId: string;
  orderIndex: number;
  addedAt: string;
  updatedAt: string;
  removedAt: string | null;
}

export interface TripGroupsSyncRequestDto {
  groups: TripGroupDto[];
  members: TripGroupMemberDto[];
}

export interface TripGroupsSyncResponseDto {
  syncedGroupIds: string[];
  syncedMemberIds: string[];
}

export interface TripGroupsListResponseDto {
  groups: TripGroupDto[];
  members: TripGroupMemberDto[];
}

export function groupToDto(group: TripGroup): TripGroupDto {
  return {
    clientGroupId: group.id,
    title: group.title,
    description: group.description,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    deletedAt: group.deletedAt?.toISOString() ?? null,
  };
}

export function memberToDto(member: TripGroupMember): TripGroupMemberDto {
  return {
    clientMemberId: member.id,
    clientGroupId: member.groupId,
    clientTripId: member.tripClientId,
    orderIndex: member.orderIndex,
    addedAt: member.addedAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
    removedAt: member.removedAt?.toISOString() ?? null,
  };
}

export function groupFromDto(dto: TripGroupDto): TripGroup {
  return {
    id: dto.clientGroupId,
    title: dto.title,
    description: dto.description,
    createdAt: new Date(dto.createdAt),
    updatedAt: new Date(dto.updatedAt),
    deletedAt: dto.deletedAt ? new Date(dto.deletedAt) : null,
    syncState: 'SYNCED',
  };
}

export function memberFromDto(dto: TripGroupMemberDto): TripGroupMember {
  return {
    id: dto.clientMemberId,
    groupId: dto.clientGroupId,
    tripClientId: dto.clientTripId,
    orderIndex: dto.orderIndex,
    addedAt: new Date(dto.addedAt),
    updatedAt: new Date(dto.updatedAt),
    removedAt: dto.removedAt ? new Date(dto.removedAt) : null,
    syncState: 'SYNCED',
  };
}
