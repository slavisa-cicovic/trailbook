import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { clearPurchaseAccessCache } from '@/feature/purchases/purchaseAccessCache';
import { removePendingAppleTransactionsForUser } from '@/feature/purchases/pendingAppleTransactions';

export async function deleteAccount(
  userId: string,
  isRecording: boolean,
): Promise<Result<void>> {
  if (isRecording) {
    return err('Stop the current recording before deleting your account.');
  }

  const remoteResult = await authRepository.deleteAccount();
  if (!remoteResult.ok) return remoteResult;

  const localResult = await tripRepository.deleteAllLocalData();
  await Promise.all([
    clearPurchaseAccessCache(),
    removePendingAppleTransactionsForUser(userId),
  ]);

  if (!localResult.ok) {
    console.warn('Account deleted, but local trip cleanup failed:', localResult.error);
  }
  return ok(undefined);
}
