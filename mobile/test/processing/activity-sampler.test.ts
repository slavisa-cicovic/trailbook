import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActivitySampleFromSpeed } from '../../src/core/data/activity/activitySampler';

const ACTIVITY_IN_VEHICLE = 0;
const ACTIVITY_ON_BICYCLE = 1;

test('keeps common cycling speeds classified as bicycle activity', () => {
  const sample = buildActivitySampleFromSpeed(
    'bike-trip',
    6.5,
    new Date('2026-07-20T10:00:00.000Z'),
  );

  assert.equal(sample.results[0]?.activityType, ACTIVITY_ON_BICYCLE);
});

test('classifies speeds above the cycling threshold as vehicle activity', () => {
  const sample = buildActivitySampleFromSpeed(
    'drive-trip',
    7.5,
    new Date('2026-07-20T10:00:00.000Z'),
  );

  assert.equal(sample.results[0]?.activityType, ACTIVITY_IN_VEHICLE);
});
