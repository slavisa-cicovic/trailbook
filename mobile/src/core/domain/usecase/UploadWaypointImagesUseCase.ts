import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';

export async function uploadWaypointImages(clientTripId: string): Promise<void> {
  const waypoints = await waypointDao.getForTrip(clientTripId);
  const waypointIds = waypoints.map((w) => w.id);
  const pending = await waypointImageDao.getPendingForTrip(waypointIds);

  for (const image of pending) {
    const urlResult = await remoteWaypointImageDataSource.requestUploadUrl(image.waypointId, image.id);
    if (!urlResult.ok) {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
      continue;
    }

    const uploadResult = await remoteWaypointImageDataSource.uploadToStorage(
      urlResult.value.putUrl,
      image.localUri,
    );

    if (uploadResult.ok) {
      await waypointImageDao.updateUploadState(image.id, 'UPLOADED', urlResult.value.objectKey);
    } else {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
    }
  }
}
