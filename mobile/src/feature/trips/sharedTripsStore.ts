import { create } from 'zustand';
import {
  remoteTripDataSource,
  type SharedTripDetailDto,
  type SharedTripListItemDto,
} from '@/core/data/remote/FetchRemoteTripDataSource';

interface SharedTripsState {
  sharedTrips: SharedTripListItemDto[];
  detail: SharedTripDetailDto | null;
  loading: boolean;
  detailLoading: boolean;
  error: string | null;
}

interface SharedTripsActions {
  loadSharedTrips(): Promise<void>;
  loadSharedTripDetail(clientTripId: string): Promise<void>;
  resetDetail(): void;
}

export const useSharedTripsStore = create<SharedTripsState & SharedTripsActions>((set) => ({
  sharedTrips: [],
  detail: null,
  loading: false,
  detailLoading: false,
  error: null,

  async loadSharedTrips() {
    set({ loading: true, error: null });
    const result = await remoteTripDataSource.fetchSharedWithMe();
    set({
      error: result.ok ? null : result.error,
      loading: false,
      sharedTrips: result.ok ? result.value : [],
    });
  },

  async loadSharedTripDetail(clientTripId) {
    set({ detail: null, detailLoading: true, error: null });
    const result = await remoteTripDataSource.fetchSharedWithMeDetail(clientTripId);
    set({
      detail: result.ok ? result.value : null,
      detailLoading: false,
      error: result.ok ? null : result.error,
    });
  },

  resetDetail() {
    set({ detail: null, detailLoading: false, error: null });
  },
}));
