import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyIntervals } from '../../src/core/domain/processing/activityClassifier';
import type { RawActivitySample } from '../../src/core/domain/model/rawSamples';
import type { GeoPoint } from '../../src/core/domain/processing/types';

const START = new Date('2026-08-05T11:26:40.000Z');

function point(seconds: number, speedMps: number): GeoPoint {
  return {
    timestamp: new Date(START.getTime() + seconds * 1000),
    latitude: 45 + seconds * 0.00001,
    longitude: 19.8,
    speedMps,
    altitudeM: 100,
  };
}

function bicycleActivity(seconds: number, confidence = 60): RawActivitySample {
  return {
    tripId: 'borkovac',
    timestamp: new Date(START.getTime() + seconds * 1000),
    results: [{ activityType: 1, confidence }],
  };
}

test('keeps motion-confirmed cycling above the speed-only DRIVE threshold', () => {
  const intervals = classifyIntervals(
    [point(0, 10), point(3, 10)],
    [bicycleActivity(0)],
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['BIKE']);
});

test('rejects a bicycle hint at implausible cycling speed', () => {
  const intervals = classifyIntervals(
    [point(0, 22), point(3, 22)],
    [bicycleActivity(0)],
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['DRIVE']);
});
