import type { SyncState } from './trip';

export interface TripGroup {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  syncState: SyncState;
}

export interface TripGroupMember {
  id: string;
  groupId: string;
  tripClientId: string;
  orderIndex: number;
  addedAt: Date;
  updatedAt: Date;
  removedAt: Date | null;
  syncState: SyncState;
}

export interface TripGroupWithMembers {
  group: TripGroup;
  members: TripGroupMember[];
}
