import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import * as tripDao from '@/core/data/local/tripDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';

export async function deleteWaypointPhoto(
  waypointId: string,
  imageId: string,
): Promise<Result<void>> {
  try {
    const waypoint = await waypointDao.getById(waypointId);
    if (!waypoint) return err('Waypoint not found.');

    const images = await waypointImageDao.getForWaypoint(waypointId);
    const image = images.find((candidate) => candidate.id === imageId);
    if (!image) return err('Photo not found.');

    if (image.uploadState === 'UPLOADED') {
      const remoteResult = await remoteWaypointImageDataSource.deleteImage(waypointId, imageId);
      if (!remoteResult.ok) return err(remoteResult.error);
    }

    await FileSystem.deleteAsync(image.localUri, { idempotent: true });
    await waypointImageDao.deleteById(imageId);
    await tripDao.updateSyncState(waypoint.tripId, 'PENDING');
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}
