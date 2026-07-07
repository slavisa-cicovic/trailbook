import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';
import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';

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

function getContentType(localUri: string): string {
  const extension = localUri.split('?')[0]?.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
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

  return ok({
    contentType: getContentType(localUri),
    sizeBytes: size,
  });
}
