import assert from 'node:assert/strict';
import test from 'node:test';

import { mergeAndFinalize } from '../../src/core/domain/processing/segmentMerger';
import type { GeoPoint } from '../../src/core/domain/processing/types';

const START = new Date('2026-07-20T10:00:00.000Z');
const STEP_SECONDS = 30;

function at(minutes: number) {
  return new Date(START.getTime() + minutes * 60_000);
}

function segment(
  startMinutes: number,
  endMinutes: number,
  type: 'BIKE' | 'DRIVE' | 'STATIONARY',
) {
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

test('does not treat one zero-speed sample as a valid mode-change stop', () => {
  const result = mergeAndFinalize(
    'stopped-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 6.2, (minute) => (minute === 5 ? 0 : 6.2)),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('reclassifies a short DRIVE bridge at a realistic downhill cycling speed', () => {
  const result = mergeAndFinalize(
    'fast-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 10),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('keeps a continuous DRIVE bridge at implausible cycling speed', () => {
  const result = mergeAndFinalize(
    'vehicle-trip',
    [
      segment(0, 5, 'BIKE'),
      segment(5, 10, 'DRIVE'),
      segment(10, 15, 'BIKE'),
    ],
    routePoints(15, 22),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('allows BIKE to DRIVE transition after a stationary period of at least 20 seconds', () => {
  const result = mergeAndFinalize(
    'bike-to-drive-after-stop',
    [
      segment(0, 5, 'BIKE'),
      {
        startTime: at(5),
        endTime: new Date(at(5).getTime() + 20_000),
        type: 'STATIONARY',
      },
      {
        startTime: new Date(at(5).getTime() + 20_000),
        endTime: at(10),
        type: 'DRIVE',
      },
    ],
    routePoints(10, 10, (minute) => (minute === 5 ? 0 : 10)),
  );

  assert.deepEqual(
    result.map((item) => item.segmentType),
    ['BIKE', 'STATIONARY', 'DRIVE'],
  );
});

test('keeps a long delivery dwell stationary despite walking-sized accumulated movement', () => {
  const result = mergeAndFinalize(
    'delivery-stop',
    [
      segment(0, 5, 'DRIVE'),
      segment(5, 15, 'STATIONARY'),
      segment(15, 20, 'DRIVE'),
    ],
    routePoints(20, 1),
  );

  assert.deepEqual(result.map((item) => item.segmentType), [
    'DRIVE',
    'STATIONARY',
    'DRIVE',
  ]);
});

test('rejects BIKE to DRIVE transition after a stationary period shorter than 20 seconds', () => {
  const stopStart = at(5);
  const stopEnd = new Date(stopStart.getTime() + 19_000);
  const result = mergeAndFinalize(
    'bike-to-drive-after-short-stop',
    [
      segment(0, 5, 'BIKE'),
      { startTime: stopStart, endTime: stopEnd, type: 'STATIONARY' },
      { startTime: stopEnd, endTime: at(10), type: 'DRIVE' },
    ],
    routePoints(10, 10, (minute) => (minute === 5 ? 0 : 10)),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['BIKE']);
});

test('rejects DRIVE to BIKE transition without a stationary period', () => {
  const result = mergeAndFinalize(
    'drive-to-bike-without-stop',
    [segment(0, 5, 'DRIVE'), segment(5, 10, 'BIKE')],
    routePoints(10, 8),
  );

  assert.deepEqual(result.map((item) => item.segmentType), ['DRIVE']);
});
