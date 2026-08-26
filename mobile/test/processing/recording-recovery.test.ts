import assert from 'node:assert/strict';
import test from 'node:test';
import type { RawSessionEvent } from '../../src/core/domain/model/rawSamples';
import type { Trip, TripStatus } from '../../src/core/domain/model/trip';
import { recordingRecoveryState } from '../../src/core/domain/recording/recordingRecovery';

function trip(status: TripStatus, endedAt: Date | null = null): Trip {
  return {
    id: 1,
    clientTripId: 'trip-1',
    ownerUserId: 'user-1',
    title: 'Trip',
    description: null,
    startedAt: new Date('2026-08-26T08:00:00Z'),
    endedAt,
    status,
    processingVersion: 17,
    syncState: 'PENDING',
  };
}

function event(type: RawSessionEvent['type']): RawSessionEvent {
  return { tripId: 'trip-1', timestamp: new Date('2026-08-26T09:00:00Z'), type };
}

test('never revives a completed or ended trip from a stale secure marker', () => {
  assert.equal(recordingRecoveryState(trip('COMPLETED'), event('RECORDING_STARTED')), 'inactive');
  assert.equal(
    recordingRecoveryState(trip('RECORDING', new Date('2026-08-26T09:00:00Z')), null),
    'inactive',
  );
});

test('a committed stop event wins over a stale recording row', () => {
  assert.equal(recordingRecoveryState(trip('RECORDING'), event('RECORDING_STOPPED')), 'inactive');
});

test('pause and resume lifecycle events recover the intended capture state', () => {
  assert.equal(recordingRecoveryState(trip('RECORDING'), event('RECORDING_PAUSED')), 'paused');
  assert.equal(recordingRecoveryState(trip('PAUSED'), event('RECORDING_RESUMED')), 'recording');
  assert.equal(recordingRecoveryState(trip('PAUSED'), null), 'paused');
});
