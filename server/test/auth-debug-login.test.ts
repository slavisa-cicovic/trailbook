import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AuthService } from '../src/auth/auth.service';
import type { DatabaseService } from '../src/database/database.service';

async function rejectsDebugLogin(environment: string | undefined, enabled: string | undefined) {
  const originalEnvironment = process.env.NODE_ENV;
  const originalEnabled = process.env.ENABLE_DEBUG_LOGIN;
  if (environment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = environment;
  if (enabled === undefined) delete process.env.ENABLE_DEBUG_LOGIN;
  else process.env.ENABLE_DEBUG_LOGIN = enabled;

  try {
    const service = new AuthService({} as DatabaseService);
    await assert.rejects(
      service.loginWithSocial({ provider: 'debug', idToken: 'debug-login:user@example.com' }),
      /Debug login is disabled/,
    );
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalEnabled === undefined) delete process.env.ENABLE_DEBUG_LOGIN;
    else process.env.ENABLE_DEBUG_LOGIN = originalEnabled;
  }
}

test('debug login requires an explicit server flag', async () => {
  await rejectsDebugLogin('development', undefined);
});

test('debug login remains disabled in production when explicitly enabled', async () => {
  await rejectsDebugLogin('production', 'true');
});
