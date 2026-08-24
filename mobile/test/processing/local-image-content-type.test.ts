import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localImageContentType } from '../../src/core/domain/media/localImageContentType';

test('accepts web-renderable local image formats', () => {
  assert.deepEqual(localImageContentType('file:///photo.JPG'), { ok: true, value: 'image/jpeg' });
  assert.deepEqual(localImageContentType('file:///photo.png'), { ok: true, value: 'image/png' });
  assert.deepEqual(localImageContentType('file:///photo.webp?cache=1'), { ok: true, value: 'image/webp' });
});

test('rejects HEIC and HEIF instead of uploading non-web-renderable bytes', () => {
  const heic = localImageContentType('file:///photo.heic');
  const heif = localImageContentType('file:///photo.HEIF');
  assert.equal(heic.ok, false);
  assert.equal(heif.ok, false);
});
