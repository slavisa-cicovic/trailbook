import * as FileSystem from 'expo-file-system/legacy';
import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import * as waypointDao from '@/core/data/local/waypointDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';

export async function deleteWaypoint(waypointId: string): Promise<Result<void>> {
  try {
    const images = await waypointImageDao.getForWaypoint(waypointId);

    // Delete local photo files
    for (const img of images) {
      if (img.localUri) {
        await FileSystem.deleteAsync(img.localUri, { idempotent: true });
      }
    }

    // Delete the photo directory for this waypoint
    const dir = `${FileSystem.documentDirectory}waypoint_photos/${waypointId}/`;
    await FileSystem.deleteAsync(dir, { idempotent: true });

    await waypointImageDao.deleteAllForTrip([waypointId]);
    await waypointDao.deleteWaypoint(waypointId);

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
