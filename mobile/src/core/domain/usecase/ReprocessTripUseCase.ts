import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { process, CURRENT_PROCESSING_VERSION } from '@/core/domain/processing';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { requireNoActiveRecording } from '@/core/domain/recording/recordingMutationGuard';

export async function reprocessTrip(clientTripId: string): Promise<Result<void>> {
  try {
    const recordingGuard = await requireNoActiveRecording();
    if (!recordingGuard.ok) return recordingGuard;

    const bundleResult = await rawCaptureRepository.getTripBundle(clientTripId);
    if (!bundleResult.ok) return err(bundleResult.error);
    if (!bundleResult.value) return err('Trip bundle not found');

    const segments = process(bundleResult.value, CURRENT_PROCESSING_VERSION);
    const applyResult = await tripRepository.applyReprocessing(
      clientTripId,
      segments,
      CURRENT_PROCESSING_VERSION,
    );
    if (!applyResult.ok) return err(applyResult.error);

    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function undoReprocessing(clientTripId: string): Promise<Result<void>> {
  const recordingGuard = await requireNoActiveRecording();
  if (!recordingGuard.ok) return recordingGuard;

  return tripRepository.undoReprocessing(clientTripId);
}
