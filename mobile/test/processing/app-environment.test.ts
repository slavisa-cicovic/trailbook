import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appEnvironmentForApplicationId } from '../../src/core/config/appEnvironmentId';

test('maps Android flavor application IDs to isolated environments', () => {
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook.local'), 'local');
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook.test'), 'test');
  assert.equal(appEnvironmentForApplicationId('com.slavisacicovic.trailbook'), 'prod');
});
