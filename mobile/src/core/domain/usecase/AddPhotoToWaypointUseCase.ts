import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import type { ImageSource } from '@/core/domain/model/waypoint';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { dbEvents } from '@/core/db/events';
import { randomUuid } from '@/core/common/uuid';

export async function addPhotoToWaypoint(
  waypointId: string,
  uri: string,
  source: ImageSource,
  capturedAt: Date | null,
): Promise<Result<void>> {
  try {
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
    dbEvents.emit('waypoints:changed');
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
