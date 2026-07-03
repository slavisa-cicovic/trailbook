import { err, type Result } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';

export async function createTripShareLink(
  clientTripId: string,
): Promise<Result<{ shareUrl: string; pin: string }>> {
  const tripResult = await tripRepository.getTripByClientId(clientTripId);
  if (!tripResult.ok) return err(tripResult.error);
  if (!tripResult.value) return err('Trip not found');
  if (tripResult.value.syncState !== 'SYNCED') {
    return err('Sync the trip before sharing it.');
  }

  return tripRepository.createShareLink(clientTripId);
}
