import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';
import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { localImageContentType } from '@/core/domain/media/localImageContentType';

export async function uploadWaypointImages(clientTripId: string): Promise<Result<void>> {
  const waypoints = await waypointDao.getForTrip(clientTripId);
  const waypointIds = waypoints.map((w) => w.id);
  const notUploaded = await waypointImageDao.getNotUploadedForTrip(waypointIds);

  for (const image of notUploaded) {
    const metadataResult = await getLocalImageUploadMetadata(image.localUri);
    if (!metadataResult.ok) {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
      return err(metadataResult.error);
    }

    const urlResult = await remoteWaypointImageDataSource.requestUploadUrl(
      image.waypointId,
      image.id,
      metadataResult.value.contentType,
      metadataResult.value.sizeBytes,
      {
        capturedAt: image.capturedAt,
        photoLatitude: image.photoLatitude,
        photoLongitude: image.photoLongitude,
      },
    );
    if (!urlResult.ok) {
      await waypointImageDao.updateUploadState(image.id, 'FAILED');
      return err(urlResult.error);
    }

    const uploadResult = await remoteWaypointImageDataSource.uploadToStorage(
      urlResult.value.putUrl,
      image.localUri,
      metadataResult.value.contentType,
    );

    if (uploadResult.ok) {
      const completeResult = await remoteWaypointImageDataSource.completeUpload(
        image.waypointId,
        image.id,
        urlResult.value.objectKey,
        metadataResult.value.contentType,
        metadataResult.value.sizeBytes,
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

async function getLocalImageUploadMetadata(
  localUri: string,
): Promise<Result<{ contentType: string; sizeBytes: number }>> {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    return err('Local image file does not exist.');
  }

  const size = 'size' in info ? info.size : undefined;
  if (typeof size !== 'number' || size <= 0) {
    return err('Local image size is not available.');
  }

  const contentType = localImageContentType(localUri);
  if (!contentType.ok) return contentType;

  return ok({
    contentType: contentType.value,
    sizeBytes: size,
  });
}
