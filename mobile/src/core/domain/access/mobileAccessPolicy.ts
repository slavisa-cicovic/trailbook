import { err, ok, type Result } from '@/core/common/result';
import * as localTestTripDao from '@/core/data/local/localTestTripDao';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { purchaseRepository } from '@/core/data/repository/PurchaseRepositoryImpl';
import type { PurchaseAccess } from '@/core/domain/model/purchase';
import { hasPremiumAccess } from '@/core/domain/model/purchase';
import { useAuthStore } from '@/feature/auth/authStore';
import { usePurchaseStore } from '@/feature/purchases/purchaseStore';

const DAY_MS = 24 * 60 * 60 * 1000;
export const PREMIUM_REQUIRED = 'PREMIUM_ENTITLEMENT_REQUIRED';
export const LOCAL_TEST_TRIP_ALREADY_USED = 'LOCAL_TEST_TRIP_ALREADY_USED';
export const LOCAL_TEST_TRIP_PHOTO_LIMIT = 'LOCAL_TEST_TRIP_PHOTO_LIMIT';

export type TripAccessMode = 'premium' | 'test_trip';

export function accessErrorMessage(error: string): string {
  if (error.includes(LOCAL_TEST_TRIP_ALREADY_USED)) {
    return 'Your local test trip has been used. Premium is required to record another trip.';
  }
  if (error.includes(LOCAL_TEST_TRIP_PHOTO_LIMIT)) {
    return 'The local test trip supports up to three photos. Premium is required for more.';
  }
  if (error.includes(PREMIUM_REQUIRED)) {
    return 'An active Trailbook Premium subscription is required.';
  }
  return error;
}

export function isPremiumAccessError(error: string): boolean {
  return (
    error.includes(PREMIUM_REQUIRED) ||
    error.includes(LOCAL_TEST_TRIP_ALREADY_USED) ||
    error.includes(LOCAL_TEST_TRIP_PHOTO_LIMIT) ||
    /(?:active )?Trailbook Premium subscription is required/i.test(error) ||
    /Premium is required/i.test(error)
  );
}

function bypassAllowed() {
  const role = useAuthStore.getState().role;
  return (
    (role === 'admin' || role === 'test_user') &&
    (__DEV__ || process.env.EXPO_PUBLIC_ENABLE_FAKE_PURCHASES === 'true')
  );
}

function validOfflinePremium(
  access: PurchaseAccess | null,
  verifiedAt: string | null,
): boolean {
  if (!hasPremiumAccess(access) || !verifiedAt) return false;
  if (
    access.subscriptionStatus !== 'active' &&
    access.subscriptionStatus !== 'canceled' &&
    access.subscriptionStatus !== 'in_grace_period' &&
    access.subscriptionStatus !== 'lifetime'
  ) {
    return false;
  }
  if (
    access.currentPeriodEndsAt &&
    new Date(access.currentPeriodEndsAt).getTime() <= Date.now()
  ) {
    return false;
  }
  const maxAge = access.planCode === 'premium_yearly' ? 30 * DAY_MS : 7 * DAY_MS;
  return Date.now() - new Date(verifiedAt).getTime() <= maxAge;
}

export function hasLocalPremiumAccess(): boolean {
  if (bypassAllowed()) return true;
  const { access, verifiedAt } = usePurchaseStore.getState();
  return validOfflinePremium(access, verifiedAt);
}

export async function authorizeTripStart(
  clientTripId: string,
): Promise<Result<TripAccessMode>> {
  if (hasLocalPremiumAccess()) return ok('premium');
  const auth = useAuthStore.getState();
  if (auth.status !== 'authenticated' || !auth.userId) {
    return err(PREMIUM_REQUIRED);
  }

  const allowance = await purchaseRepository.consumeLocalTestTripAllowance(
    clientTripId,
  );
  if (!allowance.ok) {
    return err(
      allowance.error.includes(LOCAL_TEST_TRIP_ALREADY_USED)
        ? LOCAL_TEST_TRIP_ALREADY_USED
        : allowance.error,
    );
  }
  await localTestTripDao.save(
    auth.userId,
    clientTripId,
    allowance.value.usedAt ?? new Date().toISOString(),
  );
  return ok('test_trip');
}

async function isCurrentUsersTestTrip(clientTripId: string): Promise<boolean> {
  const { status, userId } = useAuthStore.getState();
  if (status !== 'authenticated' || !userId) return false;
  const localTripId = await localTestTripDao.getTripClientId(userId);
  if (localTripId) return localTripId === clientTripId;

  const allowance = await purchaseRepository.getLocalTestTripAllowance();
  if (!allowance.ok || !allowance.value.tripClientId) return false;
  await localTestTripDao.save(
    userId,
    allowance.value.tripClientId,
    allowance.value.usedAt ?? new Date().toISOString(),
  );
  return allowance.value.tripClientId === clientTripId;
}

export async function authorizeTripContent(
  clientTripId: string,
): Promise<Result<TripAccessMode>> {
  if (hasLocalPremiumAccess()) return ok('premium');
  return (await isCurrentUsersTestTrip(clientTripId))
    ? ok('test_trip')
    : err(PREMIUM_REQUIRED);
}

export async function authorizeTripPhotos(
  clientTripId: string,
  additions: number,
): Promise<Result<TripAccessMode>> {
  const access = await authorizeTripContent(clientTripId);
  if (!access.ok || access.value === 'premium') return access;
  const currentCount = await waypointImageDao.countForTrip(clientTripId);
  return currentCount + additions <= 3
    ? access
    : err(LOCAL_TEST_TRIP_PHOTO_LIMIT);
}

export async function requireCloudPremium(): Promise<Result<void>> {
  if (bypassAllowed()) return ok(undefined);
  const requestedUserId = useAuthStore.getState().userId;
  if (!requestedUserId) return err(PREMIUM_REQUIRED);
  const result = await purchaseRepository.getCurrentAccess();
  if (!result.ok) return err(result.error);
  if (useAuthStore.getState().userId !== requestedUserId) {
    return err(PREMIUM_REQUIRED);
  }
  usePurchaseStore.getState().setAccess(result.value, requestedUserId);
  return hasPremiumAccess(result.value)
    ? ok(undefined)
    : err(PREMIUM_REQUIRED);
}
