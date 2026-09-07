import assert from 'node:assert/strict';
import test from 'node:test';

import {
  persistableLocalPhotoUri,
  resolvedLocalPhotoUri,
} from '../../src/core/data/local/localPhotoUri';

test('stores waypoint photo paths without an iOS container UUID', () => {
  assert.equal(
    persistableLocalPhotoUri(
      'file:///old/Application/OLD/Documents/waypoint_photos/waypoint-1/image-1.jpg',
    ),
    'waypoint_photos/waypoint-1/image-1.jpg',
  );
});

test('rebases a legacy waypoint photo URI onto the current document directory', () => {
  assert.equal(
    resolvedLocalPhotoUri(
      'file:///old/Application/OLD/Documents/waypoint_photos/waypoint-1/image-1.jpg',
      'file:///new/Application/NEW/Documents/',
    ),
    'file:///new/Application/NEW/Documents/waypoint_photos/waypoint-1/image-1.jpg',
  );
});

test('leaves non-waypoint and remote URIs unchanged', () => {
  assert.equal(
    resolvedLocalPhotoUri('https://example.com/image.jpg', 'file:///new/Documents/'),
    'https://example.com/image.jpg',
  );
});
