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

export interface SyncTripGroupsRequestDto {
  groups: TripGroupDto[];
  members: TripGroupMemberDto[];
}

export interface SyncTripGroupsResponseDto {
  syncedGroupIds: string[];
  syncedMemberIds: string[];
}

export interface TripGroupsListResponseDto {
  groups: TripGroupDto[];
  members: TripGroupMemberDto[];
}
