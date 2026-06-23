import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { process, CURRENT_PROCESSING_VERSION } from '@/core/domain/processing';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';

export async function reprocessTrip(clientTripId: string): Promise<Result<void>> {
  try {
    const bundleResult = await rawCaptureRepository.getTripBundle(clientTripId);
    if (!bundleResult.ok) return err(bundleResult.error);
    if (!bundleResult.value) return err('Trip bundle not found');

    const segments = process(bundleResult.value, CURRENT_PROCESSING_VERSION);
    const replaceResult = await tripRepository.replaceSegments(clientTripId, segments);
    if (!replaceResult.ok) return err(replaceResult.error);

    const versionResult = await tripRepository.updateProcessingVersion(clientTripId, CURRENT_PROCESSING_VERSION);
    if (!versionResult.ok) return err(versionResult.error);

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
