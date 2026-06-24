import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';

export async function deleteLocalTrips(isRecording: boolean): Promise<Result<void>> {
  try {
    if (isRecording) {
      return err('Cannot delete while a trip is recording');
    }

    const rawResult = await rawCaptureRepository.deleteAllRawData();
    if (!rawResult.ok) return err(rawResult.error);

    // deleteAllLocalData() also deletes all photo files via photoStorage
    const localResult = await tripRepository.deleteAllLocalData();
    if (!localResult.ok) return err(localResult.error);

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
