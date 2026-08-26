import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyRestoreSummary, restoreSummaryMessage } from '../../src/core/domain/restore/restoreSummary';

test('formats a complete restore including idempotently retained photos', () => {
  const summary = emptyRestoreSummary();
  summary.restoredTrips = 7;
  summary.restoredPhotos = 2;
  summary.existingPhotos = 3;
  assert.equal(
    restoreSummaryMessage(summary),
    'Restore complete. 7 trips and 2 photos restored. 3 photos already existed on this device.',
  );
});

test('formats a partial restore with deduplicated understandable reasons', () => {
  const summary = emptyRestoreSummary();
  summary.restoredTrips = 7;
  summary.restoredPhotos = 12;
  summary.failedPhotos = 3;
  summary.failedPhotoLists = 1;
  summary.groupsFailed = true;
  summary.issues = [
    { kind: 'photo', reason: 'The photo is no longer available.' },
    { kind: 'photo', reason: 'The photo is no longer available.' },
    { kind: 'photo-list', reason: 'Trailbook server is temporarily unavailable.' },
    { kind: 'groups', reason: 'Trailbook server is temporarily unavailable.' },
  ];
  assert.equal(
    restoreSummaryMessage(summary),
    'Restore completed with some problems.\n7 trips and 12 photos restored.\n' +
      '3 photos could not be restored; photos for 1 waypoint could not be checked; trip groups could not be restored.\n' +
      'Reason: The photo is no longer available. Trailbook server is temporarily unavailable.',
  );
});
