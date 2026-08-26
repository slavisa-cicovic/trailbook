import assert from 'node:assert/strict';
import test from 'node:test';
import {
  databaseNameForSecurityMode,
  databaseSecurityModeForApplicationId,
} from '../../src/core/db/databaseSecurityPolicy';

test('keeps the ordinary local flavor inspectable', () => {
  assert.equal(databaseSecurityModeForApplicationId('com.slavisacicovic.trailbook.local'), 'plaintext');
  assert.equal(databaseNameForSecurityMode('plaintext'), 'trailbook.db');
});

test('requires encryption for localEncrypted, test and production', () => {
  assert.equal(
    databaseSecurityModeForApplicationId('com.slavisacicovic.trailbook.local.encrypted'),
    'encrypted',
  );
  assert.equal(databaseSecurityModeForApplicationId('com.slavisacicovic.trailbook.test'), 'encrypted');
  assert.equal(databaseSecurityModeForApplicationId('com.slavisacicovic.trailbook'), 'encrypted');
  assert.equal(databaseNameForSecurityMode('encrypted'), 'trailbook-encrypted.db');
});
