import { create } from 'zustand';
import type { Trip } from '@/core/domain/model/trip';
import type { Segment } from '@/core/domain/model/segment';
import type { Waypoint, WaypointImage } from '@/core/domain/model/waypoint';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import * as tripDao from '@/core/data/local/tripDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';

interface TripDetailState {
  trip: Trip | null;
  segments: Segment[];
  waypoints: Waypoint[];
  imagesByWaypoint: Record<string, WaypointImage[]>;
  locationSamples: RawLocationSample[];
  loading: boolean;
  error: string | null;
}

interface TripDetailActions {
  load(clientTripId: string): Promise<void>;
  reset(): void;
}

export const useTripDetailStore = create<TripDetailState & TripDetailActions>((set) => ({
  trip: null,
  segments: [],
  waypoints: [],
  imagesByWaypoint: {},
  locationSamples: [],
  loading: false,
  error: null,

  async load(clientTripId) {
    set({ loading: true, error: null });
    try {
      const trip = await tripDao.getTripByClientId(clientTripId);
      if (!trip) { set({ loading: false, error: 'Trip not found' }); return; }

      const [segments, waypoints, locationSamples] = await Promise.all([
        segmentDao.getForTrip(clientTripId),
        waypointDao.getForTrip(clientTripId),
        rawLocationDao.getAllForTrip(clientTripId),
      ]);

      const imagesByWaypoint: Record<string, WaypointImage[]> = {};
      await Promise.all(
        waypoints.map(async (w) => {
          imagesByWaypoint[w.id] = await waypointImageDao.getForWaypoint(w.id);
        }),
      );

      set({ trip, segments, waypoints, imagesByWaypoint, locationSamples, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset() {
    set({ trip: null, segments: [], waypoints: [], imagesByWaypoint: {}, locationSamples: [], error: null });
  },
}));
