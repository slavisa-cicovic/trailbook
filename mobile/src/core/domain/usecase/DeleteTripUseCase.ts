import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';

export async function flushPendingTripDeletions(): Promise<Result<number>> {
  if (await authRepository.isDemo()) {
    return ok(0);
  }

  const pendingResult = await tripRepository.getPendingRemoteDeletionIds();
  if (!pendingResult.ok) return err(pendingResult.error);

  let completed = 0;
  for (const clientTripId of pendingResult.value) {
    const deleteResult = await remoteTripDataSource.deleteTrip(clientTripId);
    if (!deleteResult.ok) return err(deleteResult.error);

    const completeResult = await tripRepository.completeRemoteDeletion(clientTripId);
    if (!completeResult.ok) return err(completeResult.error);
    completed += 1;
  }

  return ok(completed);
}

export async function deleteTrip(clientTripId: string): Promise<Result<void>> {
  const isDemo = await authRepository.isDemo();
  const localResult = await tripRepository.deleteTripAndQueueRemoteDeletion(clientTripId);
  if (!localResult.ok) return err(localResult.error);

  if (isDemo) {
    return tripRepository.completeRemoteDeletion(clientTripId);
  }

  const flushResult = await flushPendingTripDeletions();
  if (!flushResult.ok) {
    // Local deletion has succeeded. The durable outbox will retry the server deletion.
    return ok(undefined);
  }

  return ok(undefined);
}
