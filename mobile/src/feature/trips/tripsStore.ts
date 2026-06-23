import { create } from 'zustand';
import type { Trip } from '@/core/domain/model/trip';
import type { Segment } from '@/core/domain/model/segment';
import { dbEvents } from '@/core/db/events';
import * as tripDao from '@/core/data/local/tripDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';

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
}

interface TripsActions {
  load(): Promise<void>;
  deleteTrip(clientTripId: string): Promise<void>;
}

async function buildMeta(trip: Trip): Promise<TripWithMeta> {
  const [segments, waypoints] = await Promise.all([
    segmentDao.getForTrip(trip.clientTripId),
    waypointDao.getForTrip(trip.clientTripId),
  ]);
  const totalDistanceM = segments.reduce((acc, s) => acc + (s.distanceM ?? 0), 0);
  const photoCount = await waypointImageDao.countForWaypoints(waypoints.map((w) => w.id));
  return { trip, segments, totalDistanceM, waypointCount: waypoints.length, photoCount };
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

    async load() {
      set({ loading: true });
      const allTrips = await tripDao.getAllTrips();
      const sorted = allTrips.sort(
        (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
      );
      const withMeta = await Promise.all(sorted.map(buildMeta));
      set({ trips: withMeta, loading: false });
    },

    async deleteTrip(clientTripId) {
      await tripDao.deleteByClientId(clientTripId);
      // trips:changed event fires → load() re-runs
    },
  };
});
