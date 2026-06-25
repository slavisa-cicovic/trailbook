import type { Trip, TripStatus, SyncState } from '../model/trip';
import type { Waypoint } from '../model/waypoint';
import type { Segment } from '../model/segment';
import type { TripBundle } from '../model/tripBundle';
import type { Result } from '@/core/common/result';

export interface TripRepository {
  createTrip(trip: Omit<Trip, 'id'>): Promise<Result<void>>;
  getTripByClientId(clientTripId: string): Promise<Result<Trip | null>>;
  getAllTrips(): Promise<Result<Trip[]>>;
  getActiveTrip(): Promise<Result<Trip | null>>;
  finishTrip(clientTripId: string, endedAt: Date): Promise<Result<void>>;
  updateStatus(clientTripId: string, status: TripStatus): Promise<Result<void>>;
  updateSyncState(clientTripId: string, state: SyncState): Promise<Result<void>>;
  updateProcessingVersion(clientTripId: string, version: number): Promise<Result<void>>;
  deleteTrip(clientTripId: string): Promise<Result<void>>;
  deleteAllLocalData(): Promise<Result<void>>;
  tripExists(clientTripId: string): Promise<Result<boolean>>;
  hasUnsyncedData(): Promise<Result<boolean>>;
  getAllCompletedClientIds(): Promise<Result<string[]>>;
  getAllPendingSyncIds(): Promise<Result<string[]>>;

  addWaypoint(waypoint: Waypoint): Promise<Result<void>>;
  updateWaypoint(waypoint: Waypoint): Promise<Result<void>>;
  deleteWaypoint(waypointId: string): Promise<Result<void>>;
  getWaypointsForTrip(tripId: string): Promise<Result<Waypoint[]>>;

  replaceSegments(tripId: string, segments: Segment[]): Promise<Result<void>>;
  getSegmentsForTrip(tripId: string): Promise<Result<Segment[]>>;
  applyReprocessing(
    tripId: string,
    segments: Segment[],
    processingVersion: number,
  ): Promise<Result<void>>;
  undoReprocessing(tripId: string): Promise<Result<void>>;
  hasReprocessingSnapshot(tripId: string): Promise<Result<boolean>>;

  getTripBundle(clientTripId: string): Promise<Result<TripBundle | null>>;
}
