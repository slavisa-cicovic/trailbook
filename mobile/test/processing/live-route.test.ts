import assert from 'node:assert/strict';
import test from 'node:test';

import type { RawLocationSample } from '../../src/core/domain/model/rawSamples';
import {
  buildDisplayRoutePoints,
  buildDisplayRouteSnapshot,
} from '../../src/core/domain/processing/displayRouteBuilder';

const START = new Date('2026-08-11T10:00:00.000Z');

function point(seconds: number, latitude: number, accuracyM = 5): RawLocationSample {
  return {
    tripId: 'live-trip',
    timestamp: new Date(START.getTime() + seconds * 1000),
    latitude,
    longitude: 19.8,
    accuracyM,
    provider: 'fused',
  };
}

test('delayed out-of-order batches produce the same immutable live route snapshot', () => {
  const chronological = [
    point(0, 45),
    point(3, 45.0001),
    point(6, 45.0002),
    point(9, 45.0003),
    point(12, 45.0004),
  ];
  const delayedWithNoise = [
    point(9, 45.0003),
    point(3, 45.0001),
    point(6, 47, 100),
    point(0, 45),
    point(6, 45.0002),
    point(3, 45.0001),
    point(12, 45.0004),
  ];

  const expected = buildDisplayRoutePoints('live-trip', chronological);
  const actual = buildDisplayRoutePoints('live-trip', delayedWithNoise);

  assert.notStrictEqual(actual, expected);
  assert.deepEqual(actual, expected);
  assert.deepEqual(actual.map((item) => item.timestamp.getTime()), [
    0, 3, 6, 9, 12,
  ].map((seconds) => START.getTime() + seconds * 1000));

  const snapshot = buildDisplayRouteSnapshot('live-trip', delayedWithNoise);
  assert.deepEqual(snapshot.diagnostics, {
    received: 7,
    duplicates: 1,
    rejected: 2,
    accepted: 5,
    displayed: 5,
  });
});
