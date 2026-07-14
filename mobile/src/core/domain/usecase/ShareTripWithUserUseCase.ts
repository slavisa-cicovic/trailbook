import { err, type Result } from '@/core/common/result';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { requireCloudPremium } from '@/core/domain/access/mobileAccessPolicy';

export async function shareTripWithUser(
  clientTripId: string,
  email: string,
): Promise<Result<{ recipientEmail: string }>> {
  const access = await requireCloudPremium();
  if (!access.ok) return access;
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return err('Email is required.');

  const tripResult = await tripRepository.getTripByClientId(clientTripId);
  if (!tripResult.ok) return err(tripResult.error);
  if (!tripResult.value) return err('Trip not found');
  if (tripResult.value.syncState !== 'SYNCED') {
    return err('Sync the trip before sharing it with another user.');
  }

  return tripRepository.shareWithUser(clientTripId, normalizedEmail);
}
