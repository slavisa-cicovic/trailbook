import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_RECORDING_MUTATION_ERROR,
  recordingAllowsTripMutation,
} from '../../src/core/domain/recording/recordingMutationPolicy';

test('trip deletion and sync are allowed when no recording is active', () => {
  assert.deepEqual(recordingAllowsTripMutation(null), { ok: true, value: undefined });
});

test('trip deletion and sync are rejected while any recording is active', () => {
  assert.deepEqual(recordingAllowsTripMutation('active-trip-id'), {
    ok: false,
    error: ACTIVE_RECORDING_MUTATION_ERROR,
  });
});
