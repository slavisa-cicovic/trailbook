import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';
import { uploadWaypointImages } from './UploadWaypointImagesUseCase';

export async function uploadTrip(clientTripId: string): Promise<Result<void>> {
  if (await authRepository.isDemo()) {
    await tripRepository.updateSyncState(clientTripId, 'FAILED');
    return err('Demo user cannot sync trips. Log in with a real account.');
  }

  const bundleResult = await tripRepository.getTripBundle(clientTripId);
  if (!bundleResult.ok) {
    await tripRepository.updateSyncState(clientTripId, 'FAILED');
    return err(bundleResult.error);
  }
  if (!bundleResult.value) {
    await tripRepository.updateSyncState(clientTripId, 'FAILED');
    return err('Trip bundle is missing.');
  }

  const uploadResult = await remoteTripDataSource.uploadTrip(bundleResult.value);

  if (uploadResult.ok) {
    const imageUploadResult = await uploadWaypointImages(clientTripId);
    if (!imageUploadResult.ok) {
      await tripRepository.updateSyncState(clientTripId, 'FAILED');
      return err(imageUploadResult.error);
    }

    await tripRepository.updateSyncState(clientTripId, 'SYNCED');
    await tripRepository.acceptReprocessing(clientTripId);
    return ok(undefined);
  } else {
    await tripRepository.updateSyncState(clientTripId, 'FAILED');
    return err(uploadResult.error);
  }
}
