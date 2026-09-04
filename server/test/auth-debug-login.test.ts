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

test('local login allows only the two configured existing accounts', async () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalEnabled = process.env.ENABLE_DEBUG_LOGIN;
  process.env.NODE_ENV = 'development';
  process.env.ENABLE_DEBUG_LOGIN = 'true';

  const database = {
    user: {
      findUnique: async ({ where }: { where: { email: string } }) => where.email === 'scaichat@gmail.com'
        ? { id: 'admin-1', email: where.email, displayName: 'sc aiChat', role: 'admin' }
        : null,
    },
    refreshToken: {
      create: async () => ({ token: 'local-refresh-token' }),
    },
  };

  try {
    const service = new AuthService(database as unknown as DatabaseService);
    const result = await service.loginWithLocalAccount('scaichat');

    assert.equal(result.user.email, 'scaichat@gmail.com');
    assert.equal(result.user.role, 'admin');
    await assert.rejects(
      service.loginWithLocalAccount('someone-else'),
      /Unknown local account/,
    );
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalEnabled === undefined) delete process.env.ENABLE_DEBUG_LOGIN;
    else process.env.ENABLE_DEBUG_LOGIN = originalEnabled;
  }
});
