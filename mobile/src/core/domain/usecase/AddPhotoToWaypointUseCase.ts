import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import type { ImageSource } from '@/core/domain/model/waypoint';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as tripDao from '@/core/data/local/tripDao';
import { dbEvents } from '@/core/db/events';
import { randomUuid } from '@/core/common/uuid';
import { authorizeTripPhotos } from '@/core/domain/access/mobileAccessPolicy';

export async function addPhotoToWaypoint(
  waypointId: string,
  uri: string,
  source: ImageSource,
  capturedAt: Date | null,
): Promise<Result<void>> {
  try {
    const waypoint = await waypointDao.getById(waypointId);
    if (!waypoint) {
      return err('Waypoint not found.');
    }
    const access = await authorizeTripPhotos(waypoint.tripId, 1);
    if (!access.ok) return access;

    const dir = `${FileSystem.documentDirectory}waypoint_photos/${waypointId}/`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const ext = uri.split('.').pop() ?? 'jpg';
    const localUri = `${dir}${randomUuid()}.${ext}`;
    await FileSystem.copyAsync({ from: uri, to: localUri });
    await waypointImageDao.insert({
      id: randomUuid(),
      waypointId,
      source,
      localUri,
      capturedAt,
      objectKey: null,
      uploadState: 'PENDING',
    });
    await tripDao.updateSyncState(waypoint.tripId, 'PENDING');
    dbEvents.emit('waypoints:changed');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
