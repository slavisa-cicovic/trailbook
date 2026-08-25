import assert from 'node:assert/strict';
import test from 'node:test';

import type { RawLocationSample } from '../../src/core/domain/model/rawSamples';
import type { Segment } from '../../src/core/domain/model/segment';
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

test('completed route omits samples that belong to stationary segments', () => {
  const samples = [
    point(0, 45),
    point(30, 45.0001),
    point(60, 45.0002),
    point(90, 45.0001),
    point(120, 45.0003),
    point(150, 45.0001),
    point(180, 45.0002),
    point(210, 45.0003),
  ];
  const segments: Segment[] = [
    {
      tripId: 'live-trip',
      index: 0,
      segmentType: 'WALK',
      startedAt: samples[0].timestamp,
      endedAt: samples[1].timestamp,
      distanceM: 10,
    },
    {
      tripId: 'live-trip',
      index: 1,
      segmentType: 'STATIONARY',
      startedAt: samples[2].timestamp,
      endedAt: samples[5].timestamp,
      distanceM: 0,
    },
    {
      tripId: 'live-trip',
      index: 2,
      segmentType: 'WALK',
      startedAt: samples[6].timestamp,
      endedAt: samples[7].timestamp,
      distanceM: 10,
    },
  ];

  const snapshot = buildDisplayRouteSnapshot('live-trip', samples, segments);

  assert.deepEqual(
    snapshot.points.map((item) => item.timestamp),
    [samples[0], samples[1], samples[6], samples[7]].map((item) => item.timestamp),
  );
  assert.equal(snapshot.diagnostics.accepted, 8);
  assert.equal(snapshot.diagnostics.displayed, 4);
});
