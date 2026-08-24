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

function vehicleActivity(seconds: number, confidence = 70): RawActivitySample {
  return {
    tripId: 'razvoz-robe',
    timestamp: new Date(START.getTime() + seconds * 1000),
    results: [{ activityType: 0, confidence }],
  };
}

function walkingActivity(seconds: number, confidence = 75): RawActivitySample {
  return {
    tripId: 'activity-continuity',
    timestamp: new Date(START.getTime() + seconds * 1000),
    results: [{ activityType: 7, confidence }],
  };
}

function activitySequence(
  startSeconds: number,
  count: number,
  factory: (seconds: number) => RawActivitySample,
): RawActivitySample[] {
  return Array.from({ length: count }, (_, index) => factory(startSeconds + index * 3));
}

function movingPoints(durationSeconds: number, speedMps: number): GeoPoint[] {
  return Array.from(
    { length: durationSeconds / 3 + 1 },
    (_, index) => point(index * 3, speedMps),
  );
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

test('retroactively corrects the documented Razvoz robe false-positive bicycle run', () => {
  const bicycle = activitySequence(0, 32, (seconds) => bicycleActivity(seconds, 60));
  const vehicle = activitySequence(96, 39, (seconds) => vehicleActivity(seconds, 70));
  const intervals = classifyIntervals(
    movingPoints(213, 8.17),
    [...bicycle, ...vehicle],
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['DRIVE']);
});

test('keeps a consistently motion-confirmed fast bicycle run', () => {
  const intervals = classifyIntervals(
    movingPoints(120, 12.5),
    activitySequence(0, 40, (seconds) => bicycleActivity(seconds, 70)),
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['BIKE']);
});

test('preserves a genuine bicycle to vehicle transition separated by a 20 second stop', () => {
  const bikePoints = Array.from({ length: 21 }, (_, index) => point(index * 3, 8));
  const stopAnchor = { ...bikePoints.at(-1)!, speedMps: 0 };
  const stopEnd = {
    ...stopAnchor,
    timestamp: new Date(START.getTime() + 80_000),
  };
  const drivePoints = Array.from({ length: 21 }, (_, index) => {
    const seconds = 83 + index * 3;
    return {
      ...point(seconds, 10),
      latitude: stopEnd.latitude + (index + 1) * 0.00003,
    };
  });
  const points = [...bikePoints.slice(0, -1), stopAnchor, stopEnd, ...drivePoints];
  const activities = [
    ...activitySequence(0, 20, (seconds) => bicycleActivity(seconds, 70)),
    {
      tripId: 'mode-change',
      timestamp: new Date(START.getTime() + 60_000),
      results: [{ activityType: 3, confidence: 90 }],
    },
    ...activitySequence(83, 21, (seconds) => vehicleActivity(seconds, 80)),
  ];

  const intervals = classifyIntervals(points, activities);
  assert.deepEqual(intervals.map((interval) => interval.type), [
    'BIKE',
    'STATIONARY',
    'DRIVE',
  ]);
});

test('keeps established DRIVE across ambiguous alternating bicycle and walking evidence', () => {
  const intervals = classifyIntervals(
    movingPoints(60, 4),
    [
      ...activitySequence(0, 8, (seconds) => vehicleActivity(seconds, 80)),
      ...activitySequence(24, 8, (seconds) => bicycleActivity(seconds, 60)),
      ...activitySequence(48, 5, (seconds) => walkingActivity(seconds, 75)),
    ],
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['DRIVE']);
});

test('keeps established DRIVE across a short isolated walking false positive', () => {
  const intervals = classifyIntervals(
    movingPoints(50, 4),
    [
      ...activitySequence(0, 8, (seconds) => vehicleActivity(seconds, 80)),
      ...activitySequence(24, 9, (seconds) => walkingActivity(seconds, 90)),
    ],
  );

  assert.deepEqual(intervals.map((interval) => interval.type), ['DRIVE']);
});

test('allows dominant walking evidence to replace an established DRIVE mode after a stop', () => {
  const points = movingPoints(120, 1.5);
  const intervals = classifyIntervals(points, [
    ...activitySequence(0, 10, (seconds) => vehicleActivity(seconds, 80)),
    ...activitySequence(30, 30, (seconds) => walkingActivity(seconds, 90)),
    bicycleActivity(117, 60),
  ]);

  assert.deepEqual(intervals.map((interval) => interval.type), ['DRIVE', 'WALK']);
});
