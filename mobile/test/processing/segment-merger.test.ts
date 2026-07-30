import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeAndFinalize } from '../../src/core/domain/processing/segmentMerger';
import type { GeoPoint } from '../../src/core/domain/processing/types';

const START = new Date('2026-07-20T10:00:00.000Z');
const STEP_SECONDS = 30;

function at(minutes: number) {
  return new Date(START.getTime() + minutes * 60_000);
}

function segment(startMinutes: number, endMinutes: number, type: 'BIKE' | 'DRIVE') {
  return {
    startTime: at(startMinutes),
    endTime: at(endMinutes),
    type,
  };
}

function routePoints(
  durationMinutes: number,
  movementSpeedMps: number,
  reportedSpeedAtMinute: (minute: number) => number = () => movementSpeedMps,
): GeoPoint[] {
  const points: GeoPoint[] = [];
  let latitude = 45;
  const latitudeDegreesPerMeter = 180 / (Math.PI * 6_371_000);

  for (
    let elapsedSeconds = 0;
    elapsedSeconds <= durationMinutes * 60;
    elapsedSeconds += STEP_SECONDS
  ) {
    const minute = elapsedSeconds / 60;
    points.push({
      timestamp: new Date(START.getTime() + elapsedSeconds * 1000),
      latitude,
      longitude: 19.8,
      speedMps: reportedSpeedAtMinute(minute),
      altitudeM: 100,
    });
    latitude += movementSpeedMps * STEP_SECONDS * latitudeDegreesPerMeter;
  }

  return points;
}

test('reclassifies a continuous cycling-speed DRIVE bridge between BIKE segments', () => {
  const result = mergeAndFinalize(
    'bike-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 6.2),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('reclassifies a fragmented continuous DRIVE run inside a bike ride', () => {
  const result = mergeAndFinalize(
    'fragmented-bike-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 6, 'DRIVE'),
      segment(6, 7, 'DRIVE'),
      segment(7, 12, 'BIKE'),
    ],
    routePoints(12, 6.8),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('keeps DRIVE when a stop is observed at a mode boundary', () => {
  const result = mergeAndFinalize(
    'stopped-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 6.2, (minute) => (minute === 5 ? 0 : 6.2)),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE', 'DRIVE', 'BIKE']);
});

test('keeps a continuous DRIVE bridge whose speed is too high for cycling', () => {
  const result = mergeAndFinalize(
    'fast-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 10),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE', 'DRIVE', 'BIKE']);
});
