import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';

export async function uploadWaypointImages(clientTripId: string): Promise<Result<void>> {
  const waypoints = await waypointDao.getForTrip(clientTripId);
  const waypointIds = waypoints.map((w) => w.id);
  const notUploaded = await waypointImageDao.getNotUploadedForTrip(waypointIds);

  for (const image of notUploaded) {
    const urlResult = await remoteWaypointImageDataSource.requestUploadUrl(image.waypointId, image.id);
    if (!urlResult.ok) {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
      return err(urlResult.error);
    }

    const uploadResult = await remoteWaypointImageDataSource.uploadToStorage(
      urlResult.value.putUrl,
      image.localUri,
    );

    if (uploadResult.ok) {
      const completeResult = await remoteWaypointImageDataSource.completeUpload(
        image.waypointId,
        image.id,
      );
      if (!completeResult.ok) {
        await waypointImageDao.updateUploadState(image.id, 'FAILED');
        return err(completeResult.error);
      }
      await waypointImageDao.updateUploadState(
        image.id,
        'UPLOADED',
        completeResult.value.objectKey,
      );
    } else {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
      return err(uploadResult.error);
    }
  }

  return ok(undefined);
}
