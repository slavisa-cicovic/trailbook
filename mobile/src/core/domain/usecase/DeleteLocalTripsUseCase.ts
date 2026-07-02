import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';

export async function deleteLocalTrips(isRecording: boolean): Promise<Result<void>> {
  try {
    if (isRecording) {
      return err('Cannot delete while a trip is recording');
    }

    // Deletes only local data owned by the currently active local user.
    const localResult = await tripRepository.deleteAllLocalData();
    if (!localResult.ok) return err(localResult.error);

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
