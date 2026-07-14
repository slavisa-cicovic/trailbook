import { err, type Result } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { requireCloudPremium } from '@/core/domain/access/mobileAccessPolicy';

export async function createTripShareLink(
  clientTripId: string,
): Promise<Result<{ shareUrl: string; pin: string }>> {
  const access = await requireCloudPremium();
  if (!access.ok) return access;
  const tripResult = await tripRepository.getTripByClientId(clientTripId);
  if (!tripResult.ok) return err(tripResult.error);
  if (!tripResult.value) return err('Trip not found');
  if (tripResult.value.syncState !== 'SYNCED') {
    return err('Sync the trip before sharing it.');
  }

  return tripRepository.createShareLink(clientTripId);
}
