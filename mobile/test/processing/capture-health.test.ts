import assert from 'node:assert/strict';
import test from 'node:test';

import { captureHealthFromLocations } from '../../src/feature/recording/captureHealth';

const START = new Date('2026-08-10T14:35:24.000Z');
const at = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

test('distinguishes sustained rejected fixes from missing callbacks', () => {
  assert.equal(captureHealthFromLocations({
    nowMs: at(3).getTime(),
    firstLocationAt: null,
    lastLocationAt: null,
    lastAcceptedLocationAt: null,
  }), 'starting');

  assert.equal(captureHealthFromLocations({
    nowMs: at(3).getTime(),
    firstLocationAt: START,
    lastLocationAt: at(3),
    lastAcceptedLocationAt: null,
  }), 'inaccurate');
});

test('reports stale raw callbacks before evaluating accuracy', () => {
  assert.equal(captureHealthFromLocations({
    nowMs: at(10).getTime(),
    firstLocationAt: START,
    lastLocationAt: at(3),
    lastAcceptedLocationAt: null,
  }), 'delayed');
});

test('returns healthy while acceptable fixes continue', () => {
  assert.equal(captureHealthFromLocations({
    nowMs: at(4).getTime(),
    firstLocationAt: START,
    lastLocationAt: at(4),
    lastAcceptedLocationAt: at(4),
  }), 'healthy');
});
