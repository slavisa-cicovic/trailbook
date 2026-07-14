import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import type { WaypointCategory, ImageSource } from '../model/waypoint';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { randomUuid } from '@/core/common/uuid';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import {
  authorizeTripContent,
  authorizeTripPhotos,
} from '@/core/domain/access/mobileAccessPolicy';

export interface AddWaypointParams {
  tripId: string;
  title: string;
  description: string | null;
  category: WaypointCategory;
  photos: Array<{
    uri: string;
    source: ImageSource;
    capturedAt: Date | null;
  }>;
}

async function copyPhotoToStorage(
  waypointId: string,
  imageId: string,
  sourceUri: string,
): Promise<string> {
  const dir = `${FileSystem.documentDirectory}waypoint_photos/${waypointId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${imageId}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function addWaypoint(params: AddWaypointParams): Promise<Result<string>> {
  try {
    const contentAccess = await authorizeTripContent(params.tripId);
    if (!contentAccess.ok) return contentAccess;
    const photoAccess = await authorizeTripPhotos(
      params.tripId,
      params.photos.length,
    );
    if (!photoAccess.ok) return photoAccess;

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    const waypointId = randomUuid();
    const now = new Date();

    await waypointDao.insertWaypoint({
      id: waypointId,
      tripId: params.tripId,
      title: params.title,
      description: params.description,
      category: params.category,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      createdAt: now,
      updatedAt: now,
    });

    for (const photo of params.photos) {
      const imageId = randomUuid();
      const localUri = await copyPhotoToStorage(waypointId, imageId, photo.uri);
      await waypointImageDao.insert({
        id: imageId,
        waypointId,
        source: photo.source,
        localUri,
        capturedAt: photo.capturedAt,
        objectKey: null,
        uploadState: 'PENDING',
      });
    }

    return ok(waypointId);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
