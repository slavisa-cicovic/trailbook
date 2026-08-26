import type { Trip } from '@/core/domain/model/trip';

export function isTripVisibleInArchive(trip: Trip): boolean {
  return trip.status === 'COMPLETED';
}
