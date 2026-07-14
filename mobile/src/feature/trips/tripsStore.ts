import { create } from 'zustand';
import type { Trip } from '@/core/domain/model/trip';
import type { Segment } from '@/core/domain/model/segment';
import { dbEvents } from '@/core/db/events';
import * as tripDao from '@/core/data/local/tripDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { uploadTrip } from '@/core/domain/usecase/UploadTripUseCase';
import { deleteTrip as deleteTripUseCase } from '@/core/domain/usecase/DeleteTripUseCase';
import type { Filters } from './tripFilters';
import { accessErrorMessage } from '@/core/domain/access/mobileAccessPolicy';

export interface TripWithMeta {
  trip: Trip;
  segments: Segment[];
  totalDistanceM: number;
  waypointCount: number;
  photoCount: number;
}

interface TripsState {
  trips: TripWithMeta[];
  loading: boolean;
  syncingTripIds: string[];
}

interface TripsActions {
  load(filters?: Filters): Promise<void>;
  deleteTrip(clientTripId: string): Promise<void>;
  syncTrip(clientTripId: string): Promise<string | null>;
}

async function buildMeta(trip: Trip): Promise<TripWithMeta> {
  const [segments, waypoints] = await Promise.all([
    segmentDao.getForTrip(trip.clientTripId),
    waypointDao.getForTrip(trip.clientTripId),
  ]);
  const totalDistanceM = segments.reduce((acc, s) => acc + (s.distanceM ?? 0), 0);
  const waypointIds = waypoints.map((waypoint) => waypoint.id);
  const [photoCount, notUploadedPhotoCount] = await Promise.all([
    waypointImageDao.countForWaypoints(waypointIds),
    waypointImageDao.countNotUploadedForWaypoints(waypointIds),
  ]);
  const reconciledTrip =
    trip.syncState === 'SYNCED' && notUploadedPhotoCount > 0
      ? { ...trip, syncState: 'PENDING' as const }
      : trip;

  if (reconciledTrip !== trip) {
    await tripDao.updateSyncState(trip.clientTripId, 'PENDING');
  }

  return {
    trip: reconciledTrip,
    segments,
    totalDistanceM,
    waypointCount: waypoints.length,
    photoCount,
  };
}

export const useTripsStore = create<TripsState & TripsActions>((set) => {
  // Subscribe to DB changes
  dbEvents.on('trips:changed', () => {
    useTripsStore.getState().load();
  });
  dbEvents.on('segments:changed', () => {
    useTripsStore.getState().load();
  });
  dbEvents.on('waypoints:changed', () => {
    useTripsStore.getState().load();
  });

  return {
    trips: [],
    loading: false,
    syncingTripIds: [],

    async load(filters) {
      set({ loading: true });
      const listedTrips = filters
        ? await tripDao.getTripsByClientIds(await tripDao.listTripIds(filters))
        : (await tripDao.getAllTrips()).sort(
            (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
          );
      const withMeta = await Promise.all(listedTrips.map(buildMeta));
      set({ trips: withMeta, loading: false });
    },

    async deleteTrip(clientTripId) {
      await deleteTripUseCase(clientTripId);
      // trips:changed event fires → load() re-runs
    },

    async syncTrip(clientTripId) {
      const { syncingTripIds } = useTripsStore.getState();
      if (syncingTripIds.includes(clientTripId)) return null;

      set({ syncingTripIds: [...syncingTripIds, clientTripId] });
      try {
        const result = await uploadTrip(clientTripId);
        return result.ok ? null : accessErrorMessage(result.error);
      } finally {
        set({
          syncingTripIds: useTripsStore
            .getState()
            .syncingTripIds
            .filter((id) => id !== clientTripId),
        });
      }
    },
  };
});
