import assert from 'node:assert/strict';
import test from 'node:test';
import type { Trip, TripStatus } from '../../src/core/domain/model/trip';
import { isTripVisibleInArchive } from '../../src/core/domain/trips/tripArchivePolicy';

function tripWithStatus(status: TripStatus): Trip {
  return {
    id: 1,
    clientTripId: `trip-${status.toLowerCase()}`,
    ownerUserId: 'user-1',
    title: 'Test trip',
    description: null,
    startedAt: new Date('2026-08-26T08:00:00.000Z'),
    endedAt: status === 'COMPLETED' ? new Date('2026-08-26T09:00:00.000Z') : null,
    status,
    processingVersion: 1,
    syncState: 'PENDING',
  };
}

test('Trips archive shows completed trips', () => {
  assert.equal(isTripVisibleInArchive(tripWithStatus('COMPLETED')), true);
});

test('Trips archive hides active and paused recordings', () => {
  assert.equal(isTripVisibleInArchive(tripWithStatus('RECORDING')), false);
  assert.equal(isTripVisibleInArchive(tripWithStatus('PAUSED')), false);
});
