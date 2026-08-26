import { create } from 'zustand';
import { dbEvents } from '@/core/db/events';
import { tripGroupRepository } from '@/core/data/repository/TripGroupRepositoryImpl';
import type { TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import { accessErrorMessage } from '@/core/domain/access/mobileAccessPolicy';
import { requireNoActiveRecording } from '@/core/domain/recording/recordingMutationGuard';

interface TripGroupsState {
  groups: TripGroupWithMembers[];
  loading: boolean;
  syncingGroupIds: string[];
}

interface TripGroupsActions {
  load(): Promise<void>;
  createGroup(title: string, description: string | null, tripClientIds: string[]): Promise<string | null>;
  addTripsToGroup(groupId: string, tripClientIds: string[]): Promise<string | null>;
  deleteGroup(groupId: string): Promise<string | null>;
  syncGroup(groupId: string): Promise<string | null>;
}

export const useTripGroupsStore = create<TripGroupsState & TripGroupsActions>((set) => {
  dbEvents.on('tripGroups:changed', () => {
    useTripGroupsStore.getState().load();
  });

  return {
    groups: [],
    loading: false,
    syncingGroupIds: [],

    async load() {
      set({ loading: true });
      try {
        const groups = await tripGroupRepository.listGroups();
        set({ groups });
      } finally {
        set({ loading: false });
      }
    },

    async createGroup(title, description, tripClientIds) {
      const result = await tripGroupRepository.createGroup(title, description, tripClientIds);
      return result.ok ? null : accessErrorMessage(result.error);
    },

    async addTripsToGroup(groupId, tripClientIds) {
      const result = await tripGroupRepository.addTripsToGroup(groupId, tripClientIds);
      return result.ok ? null : accessErrorMessage(result.error);
    },

    async deleteGroup(groupId) {
      const result = await tripGroupRepository.deleteGroup(groupId);
      return result.ok ? null : accessErrorMessage(result.error);
    },

    async syncGroup(groupId) {
      const recordingGuard = await requireNoActiveRecording();
      if (!recordingGuard.ok) return accessErrorMessage(recordingGuard.error);

      const { syncingGroupIds } = useTripGroupsStore.getState();
      if (syncingGroupIds.includes(groupId)) return null;
      set({ syncingGroupIds: [...syncingGroupIds, groupId] });
      try {
        const result = await tripGroupRepository.syncGroup(groupId);
        return result.ok ? null : accessErrorMessage(result.error);
      } finally {
        set({
          syncingGroupIds: useTripGroupsStore
            .getState()
            .syncingGroupIds.filter((id) => id !== groupId),
        });
      }
    },
  };
});
