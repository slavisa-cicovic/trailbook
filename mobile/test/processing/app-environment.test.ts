import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appEnvironmentForApplicationId,
  oauthSchemeForApplicationId,
} from '../../src/core/config/appEnvironmentId';

test('maps Android flavor application IDs to isolated environments', () => {
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook.local'), 'local');
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook.local.encrypted'), 'local');
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook.test'), 'test');
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook'), 'prod');
});

test('keeps each installed flavor OAuth callback isolated', () => {
  assert.equal(oauthSchemeForApplicationId('com.slavisacicovic.trailbook.local'), 'trailbook-local');
  assert.equal(
    oauthSchemeForApplicationId('com.slavisacicovic.trailbook.local.encrypted'),
    'trailbook-local-encrypted',
  );
  assert.equal(oauthSchemeForApplicationId('com.slavisacicovic.trailbook.test'), 'trailbook-test');
  assert.equal(oauthSchemeForApplicationId('com.slavisacicovic.trailbook'), 'trailbook');
});
