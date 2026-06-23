import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
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

async function restoreImage(waypointId: string, image: RemoteImageInfo): Promise<void> {
  try {
    const bytesResult = await remoteWaypointImageDataSource.downloadImage(image.getUrl);
    if (!bytesResult.ok) return;

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
  } catch {
    // silent: this image won't be shown, but the trip is still restored
  }
}

export async function restoreTrips(): Promise<Result<void>> {
  if (await authRepository.isDemo()) return err('Demo users cannot restore trips');

  const listResult = await remoteTripDataSource.fetchTripList();
  if (!listResult.ok) return listResult;

  for (const item of listResult.value) {
    const existsResult = await tripRepository.tripExists(item.clientTripId);
    if (!existsResult.ok) continue;
    if (existsResult.value) continue;

    const bundleResult = await remoteTripDataSource.fetchTrip(item.clientTripId);
    if (!bundleResult.ok) continue;

    const saveResult = await rawCaptureRepository.saveTripBundle(bundleResult.value);
    if (!saveResult.ok) continue;

    for (const waypoint of bundleResult.value.waypoints) {
      const imagesResult = await remoteWaypointImageDataSource.getImages(waypoint.id);
      if (!imagesResult.ok) continue;

      for (const image of imagesResult.value) {
        await restoreImage(waypoint.id, image);
      }
    }
  }

  dbEvents.emit('trips:changed');
  return ok(undefined);
}
