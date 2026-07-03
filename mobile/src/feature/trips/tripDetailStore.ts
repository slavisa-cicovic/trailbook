import { create } from 'zustand';
import type { Trip } from '@/core/domain/model/trip';
import type { Segment } from '@/core/domain/model/segment';
import type { Waypoint, WaypointImage } from '@/core/domain/model/waypoint';
import type { DisplayRoutePoint } from '@/core/domain/model/displayRoutePoint';
import * as tripDao from '@/core/data/local/tripDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { buildDisplayRoutePoints } from '@/core/domain/processing/displayRouteBuilder';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';
import { tripBundleDtoToDomain } from '@/core/data/remote/dto/tripBundleDto';

interface TripDetailState {
  trip: Trip | null;
  segments: Segment[];
  waypoints: Waypoint[];
  imagesByWaypoint: Record<string, WaypointImage[]>;
  routePoints: DisplayRoutePoint[];
  hasReprocessingSnapshot: boolean;
  sharedBy: string | null;
  loading: boolean;
  error: string | null;
}

interface TripDetailActions {
  load(clientTripId: string): Promise<void>;
  loadShared(clientTripId: string): Promise<void>;
  reset(): void;
}

export const useTripDetailStore = create<TripDetailState & TripDetailActions>((set) => ({
  trip: null,
  segments: [],
  waypoints: [],
  imagesByWaypoint: {},
  routePoints: [],
  hasReprocessingSnapshot: false,
  sharedBy: null,
  loading: false,
  error: null,

  async load(clientTripId) {
    set({ loading: true, error: null });
    try {
      const trip = await tripDao.getTripByClientId(clientTripId);
      if (!trip) { set({ loading: false, error: 'Trip not found' }); return; }

      const [segments, waypoints, snapshotResult] = await Promise.all([
        segmentDao.getForTrip(clientTripId),
        waypointDao.getForTrip(clientTripId),
        tripRepository.hasReprocessingSnapshot(clientTripId),
      ]);
      const routePoints = await loadDisplayRouteForTrip(clientTripId, segments);
      if (!snapshotResult.ok) throw new Error(snapshotResult.error);

      const imagesByWaypoint: Record<string, WaypointImage[]> = {};
      await Promise.all(
        waypoints.map(async (w) => {
          imagesByWaypoint[w.id] = await waypointImageDao.getForWaypoint(w.id);
        }),
      );

      set({
        trip,
        segments,
        waypoints,
        imagesByWaypoint,
        routePoints,
        hasReprocessingSnapshot: snapshotResult.value,
        sharedBy: null,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  async loadShared(clientTripId) {
    set({ loading: true, error: null });
    try {
      const result = await remoteTripDataSource.fetchSharedWithMeDetail(clientTripId);
      if (!result.ok) {
        set({ loading: false, error: result.error });
        return;
      }

      const sharedDetail = result.value;
      const bundle = tripBundleDtoToDomain(
        sharedDetail.bundle,
        0,
        sharedDetail.owner.email,
      );
      const routePoints = buildDisplayRoutePoints(
        bundle.trip.clientTripId,
        bundle.locations,
        bundle.segments,
      );
      const imagesByWaypoint: Record<string, WaypointImage[]> = {};

      for (const waypoint of bundle.waypoints) {
        imagesByWaypoint[waypoint.id] = (sharedDetail.imagesByWaypointId[waypoint.id] ?? [])
          .map((image) => ({
            id: image.imageId,
            waypointId: waypoint.id,
            source: 'GALLERY',
            localUri: image.getUrl,
            capturedAt: null,
            objectKey: image.objectKey,
            uploadState: 'UPLOADED',
          }));
      }

      set({
        trip: bundle.trip,
        segments: bundle.segments,
        waypoints: bundle.waypoints,
        imagesByWaypoint,
        routePoints,
        hasReprocessingSnapshot: false,
        sharedBy: sharedDetail.owner.displayName || sharedDetail.owner.email,
        loading: false,
      });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  reset() {
    set({
      trip: null,
      segments: [],
      waypoints: [],
      imagesByWaypoint: {},
      routePoints: [],
      hasReprocessingSnapshot: false,
      sharedBy: null,
      error: null,
    });
  },
}));

async function loadDisplayRouteForTrip(
  tripId: string,
  segments: Segment[],
): Promise<DisplayRoutePoint[]> {
  const existing = await displayRoutePointDao.getForTrip(tripId);
  if (existing.length > 0) return existing;

  const rawLocations = await rawLocationDao.getAllForTrip(tripId);
  const routePoints = buildDisplayRoutePoints(tripId, rawLocations, segments);
  await displayRoutePointDao.replaceForTrip(tripId, routePoints);
  return routePoints;
}
