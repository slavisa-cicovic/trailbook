import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';
import { uploadWaypointImages } from './UploadWaypointImagesUseCase';

export async function uploadTrip(clientTripId: string): Promise<void> {
  if (await authRepository.isDemo()) return;

  const bundleResult = await tripRepository.getTripBundle(clientTripId);
  if (!bundleResult.ok || !bundleResult.value) return;

  const uploadResult = await remoteTripDataSource.uploadTrip(bundleResult.value);

  if (uploadResult.ok) {
    await tripRepository.updateSyncState(clientTripId, 'SYNCED');
    await uploadWaypointImages(clientTripId);
  } else {
    await tripRepository.updateSyncState(clientTripId, 'FAILED');
  }
}
