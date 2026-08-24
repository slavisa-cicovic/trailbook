import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldConnectGeoPoints,
  splitLocationsOnRouteGaps,
} from '../../src/core/domain/processing/locationCleaner';
import type { GeoPoint } from '../../src/core/domain/processing/types';

const START = new Date('2026-08-11T05:25:31.000Z');

function point(seconds: number, latitude: number): GeoPoint {
  return {
    timestamp: new Date(START.getTime() + seconds * 1000),
    latitude,
    longitude: 19.8,
    altitudeM: undefined,
    speedMps: undefined,
  };
}

test('splits every uncertain gap longer than one minute even when endpoints are close', () => {
  const before = point(0, 45);
  const after = point(61, 45.0001);

  assert.equal(shouldConnectGeoPoints(before, after, 'WALK'), false);
  assert.deepEqual(
    splitLocationsOnRouteGaps([before, after], 'WALK').map((group) => group.length),
    [1, 1],
  );
});

test('does not draw a walking zigzag whose implied speed is implausible', () => {
  const before = point(0, 45);
  const unrelatedBlock = point(30, 45.002);

  assert.equal(shouldConnectGeoPoints(before, unrelatedBlock, 'WALK'), false);
  assert.equal(shouldConnectGeoPoints(before, unrelatedBlock, 'DRIVE'), true);
});

test('keeps plausible continuous walking points connected', () => {
  assert.equal(shouldConnectGeoPoints(point(0, 45), point(30, 45.0005), 'WALK'), true);
});
