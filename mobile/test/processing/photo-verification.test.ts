import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPhotoMetadata } from '../../src/core/domain/photo/photoVerification';

const waypointCoordinates = { latitude: 44.98, longitude: 19.82 };
const waypointCreatedAt = new Date('2026-09-07T10:00:00Z');

test('photo verification accepts nearby coordinates and creation time', () => {
  const result = verifyPhotoMetadata({
    capturedAt: new Date('2026-09-07T10:14:00Z'),
    photoCoordinates: { latitude: 44.9805, longitude: 19.8205 },
    waypointCoordinates,
    waypointCreatedAt,
  });
  assert.equal(result.location, 'match');
  assert.equal(result.time, 'match');
  assert.equal(result.severity, 'verified');
});

test('photo verification reports confirmed mismatch separately from unavailable data', () => {
  const mismatch = verifyPhotoMetadata({
    capturedAt: new Date('2026-09-07T10:16:00Z'),
    photoCoordinates: { latitude: 45.08, longitude: 19.82 },
    waypointCoordinates,
    waypointCreatedAt,
  });
  assert.equal(mismatch.location, 'mismatch');
  assert.equal(mismatch.time, 'mismatch');
  assert.equal(mismatch.severity, 'mismatch');

  const unavailable = verifyPhotoMetadata({
    capturedAt: null,
    photoCoordinates: null,
    waypointCoordinates,
    waypointCreatedAt,
  });
  assert.equal(unavailable.location, 'unavailable');
  assert.equal(unavailable.time, 'unavailable');
  assert.equal(unavailable.severity, 'unavailable');
});
