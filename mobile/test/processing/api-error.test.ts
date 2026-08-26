import assert from 'node:assert/strict';
import test from 'node:test';
import {
  apiNetworkErrorMessage,
  apiResponseErrorMessage,
  NETWORK_ERROR_MESSAGE,
  SERVER_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from '../../src/core/data/remote/apiError';

test('replaces unauthorized server details with a session message', async () => {
  const response = new Response(
    JSON.stringify({ message: 'Invalid or expired refresh token', statusCode: 401 }),
    { status: 401 },
  );

  assert.equal(await apiResponseErrorMessage(response), SESSION_EXPIRED_MESSAGE);
});

test('keeps safe validation messages without exposing the HTTP response', async () => {
  const response = new Response(JSON.stringify({ message: ['Title is required'] }), {
    status: 400,
  });

  assert.equal(await apiResponseErrorMessage(response), 'Title is required');
});

test('uses friendly messages for server and network failures', async () => {
  assert.equal(
    await apiResponseErrorMessage(new Response('internal details', { status: 503 })),
    SERVER_ERROR_MESSAGE,
  );
  assert.equal(apiNetworkErrorMessage(), NETWORK_ERROR_MESSAGE);
});
