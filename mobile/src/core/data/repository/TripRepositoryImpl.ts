import type { TripRepository } from '@/core/domain/usecase/TripRepository';
import type { Trip, TripStatus, SyncState } from '@/core/domain/model/trip';
import type { Waypoint } from '@/core/domain/model/waypoint';
import type { Segment } from '@/core/domain/model/segment';
import type { TripBundle } from '@/core/domain/model/tripBundle';
import type { Result } from '@/core/common/result';
import { ok, resultOfAsync } from '@/core/common/result';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as captureMetaDao from '@/core/data/local/captureMetaDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as rawDeviceDao from '@/core/data/local/rawDeviceDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import * as reprocessingSnapshotDao from '@/core/data/local/reprocessingSnapshotDao';
import * as pendingTripDeletionDao from '@/core/data/local/pendingTripDeletionDao';
import { deleteAllPhotos, deletePhotosForWaypoints } from '@/core/data/local/photoStorage';
import { sqlite } from '@/core/db';
import { buildDisplayRoutePoints } from '@/core/domain/processing/displayRouteBuilder';

export class TripRepositoryImpl implements TripRepository {
  async createTrip(trip: Omit<Trip, 'id'>): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.insertTrip(trip));
  }

  async getTripByClientId(clientTripId: string): Promise<Result<Trip | null>> {
    return resultOfAsync(() => tripDao.getTripByClientId(clientTripId));
  }

  async getAllTrips(): Promise<Result<Trip[]>> {
    return resultOfAsync(() => tripDao.getAllTrips());
  }

  async getActiveTrip(): Promise<Result<Trip | null>> {
    return resultOfAsync(() => tripDao.getActiveTrip());
  }

  async finishTrip(clientTripId: string, endedAt: Date): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.updateEndedAt(clientTripId, endedAt));
  }

  async updateStatus(clientTripId: string, status: TripStatus): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.updateStatus(clientTripId, status));
  }

  async updateSyncState(clientTripId: string, state: SyncState): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.updateSyncState(clientTripId, state));
  }

  async updateProcessingVersion(clientTripId: string, version: number): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.updateProcessingVersion(clientTripId, version));
  }

  async updateDetails(
    clientTripId: string,
    title: string,
    description: string | null,
  ): Promise<Result<void>> {
    return resultOfAsync(() => tripDao.updateDetails(clientTripId, title, description));
  }

  async deleteTrip(clientTripId: string): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await reprocessingSnapshotDao.deleteForTrip(clientTripId);
      await displayRoutePointDao.deleteForTrip(clientTripId);
      await tripDao.deleteByClientId(clientTripId);
    });
  }

  async deleteTripAndQueueRemoteDeletion(clientTripId: string): Promise<Result<void>> {
    return resultOfAsync(async () => {
      const waypoints = await waypointDao.getForTrip(clientTripId);
      const waypointIds = waypoints.map((waypoint) => waypoint.id);

      await sqlite.withTransactionAsync(async () => {
        await pendingTripDeletionDao.insert(clientTripId);
        await waypointImageDao.deleteAllForTrip(waypointIds);
        await reprocessingSnapshotDao.deleteForTrip(clientTripId);
        await displayRoutePointDao.deleteForTrip(clientTripId);
        await segmentDao.deleteForTrip(clientTripId);
        await waypointDao.deleteForTrip(clientTripId);
        await rawSessionEventDao.deleteForTrip(clientTripId);
        await rawDeviceDao.deleteForTrip(clientTripId);
        await rawActivityDao.deleteForTrip(clientTripId);
        await rawLocationDao.deleteForTrip(clientTripId);
        await captureMetaDao.deleteForTrip(clientTripId);
        await tripDao.deleteByClientId(clientTripId);
      });

      await deletePhotosForWaypoints(waypointIds);
    });
  }

  async getPendingRemoteDeletionIds(): Promise<Result<string[]>> {
    return resultOfAsync(() => pendingTripDeletionDao.getAll());
  }

  async completeRemoteDeletion(clientTripId: string): Promise<Result<void>> {
    return resultOfAsync(() => pendingTripDeletionDao.deleteByClientTripId(clientTripId));
  }

  async deleteAllLocalData(): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await deleteAllPhotos();
      await waypointImageDao.deleteAll();
      await waypointDao.deleteAll();
      await displayRoutePointDao.deleteAll();
      await segmentDao.deleteAll();
      await reprocessingSnapshotDao.deleteAll();
      await tripDao.deleteAll();
    });
  }

  async tripExists(clientTripId: string): Promise<Result<boolean>> {
    return resultOfAsync(() => tripDao.existsByClientId(clientTripId));
  }

  async hasUnsyncedData(): Promise<Result<boolean>> {
    return resultOfAsync(async () => {
      const unsynced = await tripDao.countUnsynced();
      if (unsynced > 0) return true;
      const notUploaded = await waypointImageDao.countNotUploaded();
      return notUploaded > 0;
    });
  }

  async getAllCompletedClientIds(): Promise<Result<string[]>> {
    return resultOfAsync(() => tripDao.getAllCompletedClientIds());
  }

  async getAllPendingSyncIds(): Promise<Result<string[]>> {
    return resultOfAsync(() => tripDao.getPendingSyncClientIds());
  }

  async addWaypoint(waypoint: Waypoint): Promise<Result<void>> {
    return resultOfAsync(() => waypointDao.insertWaypoint(waypoint));
  }

  async updateWaypoint(waypoint: Waypoint): Promise<Result<void>> {
    return resultOfAsync(() => waypointDao.updateWaypoint(waypoint));
  }

  async deleteWaypoint(waypointId: string): Promise<Result<void>> {
    return resultOfAsync(() => waypointDao.deleteWaypoint(waypointId));
  }

  async getWaypointsForTrip(tripId: string): Promise<Result<Waypoint[]>> {
    return resultOfAsync(() => waypointDao.getForTrip(tripId));
  }

  async replaceSegments(tripId: string, segs: Segment[]): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await segmentDao.deleteForTrip(tripId);
      await segmentDao.insertAll(segs);
      const locations = await rawLocationDao.getAllForTrip(tripId);
      await displayRoutePointDao.replaceForTrip(
        tripId,
        buildDisplayRoutePoints(tripId, locations),
      );
    });
  }

  async getSegmentsForTrip(tripId: string): Promise<Result<Segment[]>> {
    return resultOfAsync(() => segmentDao.getForTrip(tripId));
  }

  async applyReprocessing(
    tripId: string,
    segs: Segment[],
    processingVersion: number,
  ): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await sqlite.withTransactionAsync(async () => {
        const existingSnapshot = await reprocessingSnapshotDao.existsForTrip(tripId);
        if (existingSnapshot) {
          throw new Error('This trip has already been reprocessed. Undo it before trying again.');
        }

        const trip = await tripDao.getTripByClientId(tripId);
        if (!trip) throw new Error('Trip not found');

        const currentSegments = await segmentDao.getForTrip(tripId);
        await reprocessingSnapshotDao.insert({
          tripId,
          processingVersion: trip.processingVersion,
          segments: currentSegments,
          createdAt: new Date(),
        });
        await segmentDao.deleteForTrip(tripId);
        await segmentDao.insertAll(segs);
        await tripDao.updateProcessingVersion(tripId, processingVersion);
        await tripDao.updateSyncState(tripId, 'PENDING');
      });
    });
  }

  async undoReprocessing(tripId: string): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await sqlite.withTransactionAsync(async () => {
        const snapshot = await reprocessingSnapshotDao.getForTrip(tripId);
        if (!snapshot) throw new Error('No reprocessing snapshot found');

        await segmentDao.deleteForTrip(tripId);
        await segmentDao.insertAll(snapshot.segments);
        await tripDao.updateProcessingVersion(tripId, snapshot.processingVersion);
        await tripDao.updateSyncState(tripId, 'PENDING');
        await reprocessingSnapshotDao.deleteForTrip(tripId);
      });
    });
  }

  async hasReprocessingSnapshot(tripId: string): Promise<Result<boolean>> {
    return resultOfAsync(() => reprocessingSnapshotDao.existsForTrip(tripId));
  }

  async getTripBundle(clientTripId: string): Promise<Result<TripBundle | null>> {
    return resultOfAsync(async () => {
      const trip = await tripDao.getTripByClientId(clientTripId);
      if (!trip) return null;
      const meta = await captureMetaDao.getForTrip(clientTripId);
      if (!meta) return null;
      const [locations, activities, deviceStates, sessionEvents, wps, segs] = await Promise.all([
        rawLocationDao.getAllForTrip(clientTripId),
        rawActivityDao.getAllForTrip(clientTripId),
        rawDeviceDao.getAllForTrip(clientTripId),
        rawSessionEventDao.getAllForTrip(clientTripId),
        waypointDao.getForTrip(clientTripId),
        segmentDao.getForTrip(clientTripId),
      ]);
      return {
        trip,
        captureMeta: meta,
        locations,
        activities,
        deviceStates,
        sessionEvents,
        waypoints: wps,
        segments: segs,
      };
    });
  }
}

export const tripRepository = new TripRepositoryImpl();
