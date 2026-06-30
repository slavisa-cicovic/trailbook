import type { RawCaptureRepository } from '@/core/domain/usecase/RawCaptureRepository';
import type { RawLocationSample, RawActivitySample, RawDeviceSample, RawSessionEvent } from '@/core/domain/model/rawSamples';
import type { CaptureMeta, TripBundle } from '@/core/domain/model/tripBundle';
import type { Result } from '@/core/common/result';
import { resultOfAsync } from '@/core/common/result';
import * as captureMetaDao from '@/core/data/local/captureMetaDao';
import * as rawLocationDao from '@/core/data/local/rawLocationDao';
import * as rawActivityDao from '@/core/data/local/rawActivityDao';
import * as rawDeviceDao from '@/core/data/local/rawDeviceDao';
import * as rawSessionEventDao from '@/core/data/local/rawSessionEventDao';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as segmentDao from '@/core/data/local/segmentDao';
import * as displayRoutePointDao from '@/core/data/local/displayRoutePointDao';
import * as reprocessingSnapshotDao from '@/core/data/local/reprocessingSnapshotDao';
import { sqlite } from '@/core/db';
import { buildDisplayRoutePoints } from '@/core/domain/processing/displayRouteBuilder';

export class RawCaptureRepositoryImpl implements RawCaptureRepository {
  async initCaptureMeta(meta: CaptureMeta): Promise<Result<void>> {
    return resultOfAsync(() => captureMetaDao.insert(meta));
  }

  async insertLocation(sample: RawLocationSample): Promise<Result<void>> {
    return resultOfAsync(() => rawLocationDao.insert(sample));
  }

  async insertActivity(sample: RawActivitySample): Promise<Result<void>> {
    return resultOfAsync(() => rawActivityDao.insert(sample));
  }

  async insertDeviceState(sample: RawDeviceSample): Promise<Result<void>> {
    return resultOfAsync(() => rawDeviceDao.insert(sample));
  }

  async insertSessionEvent(event: RawSessionEvent): Promise<Result<void>> {
    return resultOfAsync(() => rawSessionEventDao.insert(event));
  }

  async getTripBundle(clientTripId: string): Promise<Result<TripBundle | null>> {
    return resultOfAsync(async () => {
      const trip = await tripDao.getTripByClientId(clientTripId);
      if (!trip) return null;
      const meta = await captureMetaDao.getForTrip(clientTripId);
      if (!meta) return null;
      const [locations, activities, deviceStates, sessionEvents, waypoints, segments] =
        await Promise.all([
          rawLocationDao.getAllForTrip(clientTripId),
          rawActivityDao.getAllForTrip(clientTripId),
          rawDeviceDao.getAllForTrip(clientTripId),
          rawSessionEventDao.getAllForTrip(clientTripId),
          waypointDao.getForTrip(clientTripId),
          segmentDao.getForTrip(clientTripId),
        ]);
      return { trip, captureMeta: meta, locations, activities, deviceStates, sessionEvents, waypoints, segments };
    });
  }

  async replaceTripBundle(bundle: TripBundle): Promise<Result<void>> {
    const tripId = bundle.trip.clientTripId;

    return resultOfAsync(async () => {
      await sqlite.withTransactionAsync(async () => {
        const existingWaypoints = await waypointDao.getForTrip(tripId);
        const waypointIds = Array.from(
          new Set([
            ...existingWaypoints.map((waypoint) => waypoint.id),
            ...bundle.waypoints.map((waypoint) => waypoint.id),
          ]),
        );

        await waypointImageDao.deleteAllForTrip(waypointIds);
        await displayRoutePointDao.deleteForTrip(tripId);
        await segmentDao.deleteForTrip(tripId);
        await waypointDao.deleteForTrip(tripId);
        await rawSessionEventDao.deleteForTrip(tripId);
        await rawDeviceDao.deleteForTrip(tripId);
        await rawActivityDao.deleteForTrip(tripId);
        await rawLocationDao.deleteForTrip(tripId);
        await captureMetaDao.deleteForTrip(tripId);
        await reprocessingSnapshotDao.deleteForTrip(tripId);
        await tripDao.deleteByClientId(tripId);

        await tripDao.insertTrip(bundle.trip);
        await captureMetaDao.insert(bundle.captureMeta);
        await rawLocationDao.insertAll(bundle.locations);
        await rawActivityDao.insertAll(bundle.activities);
        await rawDeviceDao.insertAll(bundle.deviceStates);
        await rawSessionEventDao.insertAll(bundle.sessionEvents);
        await waypointDao.insertAll(bundle.waypoints);
        if (bundle.segments.length > 0) {
          await segmentDao.insertAll(bundle.segments);
        }
        await displayRoutePointDao.replaceForTrip(
          tripId,
          buildDisplayRoutePoints(tripId, bundle.locations),
        );
      });
    });
  }

  async deleteAllRawData(): Promise<Result<void>> {
    return resultOfAsync(async () => {
      await rawLocationDao.deleteAll();
      await rawActivityDao.deleteAll();
      await rawDeviceDao.deleteAll();
      await rawSessionEventDao.deleteAll();
      await captureMetaDao.deleteAll();
      await displayRoutePointDao.deleteAll();
    });
  }
}

export const rawCaptureRepository = new RawCaptureRepositoryImpl();
