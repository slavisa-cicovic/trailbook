import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
import { flushPendingTripDeletions } from './DeleteTripUseCase';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { saveRestoredPhoto } from '@/core/data/local/photoStorage';
import { dbEvents } from '@/core/db/events';

interface RemoteImageInfo {
  imageId: string;
  getUrl: string;
  objectKey: string;
}

async function restoreImage(
  waypointId: string,
  image: RemoteImageInfo,
): Promise<Result<void>> {
  try {
    const bytesResult = await remoteWaypointImageDataSource.downloadImage(image.getUrl);
    if (!bytesResult.ok) return err(bytesResult.error);

    const localUri = await saveRestoredPhoto(waypointId, image.imageId, bytesResult.value);
    await waypointImageDao.insert({
      id: image.imageId,
      waypointId,
      source: 'CAMERA',
      localUri,
      capturedAt: null,
      objectKey: image.objectKey,
      uploadState: 'UPLOADED',
    });
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function restoreTrips(): Promise<Result<void>> {
  if (await authRepository.isDemo()) return err('Demo users cannot restore trips');

  const deletionResult = await flushPendingTripDeletions();
  if (!deletionResult.ok) {
    return err(`Could not synchronize pending trip deletions: ${deletionResult.error}`);
  }

  const listResult = await remoteTripDataSource.fetchTripList();
  if (!listResult.ok) return listResult;

  for (const item of listResult.value) {
    const bundleResult = await remoteTripDataSource.fetchTrip(item.clientTripId);
    if (!bundleResult.ok) return err(bundleResult.error);

    const saveResult = await rawCaptureRepository.replaceTripBundle(bundleResult.value);
    if (!saveResult.ok) return err(saveResult.error);

    for (const waypoint of bundleResult.value.waypoints) {
      const imagesResult = await remoteWaypointImageDataSource.getImages(waypoint.id);
      if (!imagesResult.ok) return err(imagesResult.error);
      const localImages = await waypointImageDao.getForWaypoint(waypoint.id);
      const localImageIds = new Set(localImages.map((image) => image.id));

      for (const image of imagesResult.value) {
        if (localImageIds.has(image.imageId)) continue;
        const restoreResult = await restoreImage(waypoint.id, image);
        if (!restoreResult.ok) return err(restoreResult.error);
      }
    }
  }

  dbEvents.emit('trips:changed');
  return ok(undefined);
}
