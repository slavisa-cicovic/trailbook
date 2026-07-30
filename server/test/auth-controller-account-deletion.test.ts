import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from '../src/auth/auth.controller';
import type { AccountDeletionService } from '../src/auth/account-deletion.service';
import type { AuthService } from '../src/auth/auth.service';
import type { AuthenticatedUser } from '../src/auth/auth.types';

const USER: AuthenticatedUser = {
  id: 'f7449668-ee44-4cf3-89bc-75ef8fe51813',
  email: 'delete-me@example.com',
  displayName: 'Delete Me',
  role: 'user',
};

describe('AuthController account deletion', () => {
  test('requires an explicit DELETE confirmation', async () => {
    let authenticationCalls = 0;
    let deletionCalls = 0;
    const controller = createController({
      requireAuthenticatedUser: async () => {
        authenticationCalls += 1;
        return USER;
      },
      deleteAccount: async () => {
        deletionCalls += 1;
      },
    });

    await assert.rejects(
      controller.deleteAccount(
        { confirmation: 'delete' },
        {} as Request,
        createResponse(),
      ),
      BadRequestException,
    );

    assert.equal(authenticationCalls, 0);
    assert.equal(deletionCalls, 0);
  });

  test('deletes the authenticated account and clears the session cookie', async () => {
    let authenticationCalls = 0;
    const deletedUserIds: string[] = [];
    const clearedCookies: Array<{ name: string; options: { path: string } }> = [];
    const response = createResponse(clearedCookies);
    const controller = createController({
      requireAuthenticatedUser: async () => {
        authenticationCalls += 1;
        return USER;
      },
      deleteAccount: async (userId) => {
        deletedUserIds.push(userId);
      },
    });

    await controller.deleteAccount(
      { confirmation: 'DELETE' },
      {} as Request,
      response,
    );

    assert.equal(authenticationCalls, 1);
    assert.deepEqual(deletedUserIds, [USER.id]);
    assert.deepEqual(clearedCookies, [
      {
        name: 'trailbook_session',
        options: { path: '/' },
      },
    ]);
  });
});

function createController({
  requireAuthenticatedUser,
  deleteAccount,
}: {
  requireAuthenticatedUser: (request: Request) => Promise<AuthenticatedUser>;
  deleteAccount: (userId: string) => Promise<void>;
}): AuthController {
  const authService = {
    requireAuthenticatedUser,
    getSessionCookieName: () => 'trailbook_session',
  } as unknown as AuthService;
  const accountDeletionService = {
    deleteAccount,
  } as unknown as AccountDeletionService;

  return new AuthController(authService, accountDeletionService);
}

function createResponse(
  clearedCookies: Array<{ name: string; options: { path: string } }> = [],
): Response {
  return {
    clearCookie: (name: string, options: { path: string }) => {
      clearedCookies.push({ name, options });
    },
  } as unknown as Response;
}
