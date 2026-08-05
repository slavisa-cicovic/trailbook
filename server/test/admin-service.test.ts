import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { AuthenticatedUser } from "../src/auth/auth.service";
import type { DatabaseService } from "../src/database/database.service";
import { AdminService } from "../src/admin/admin.service";

const admin: AuthenticatedUser = {
  displayName: "Admin",
  email: "admin@example.com",
  id: "admin-1",
  role: "admin",
};

describe("AdminService tester Premium", () => {
  test("previews eligible and missing users without writing", async () => {
    let transactionCalled = false;
    const service = createService(
      [{ email: "found@example.com", id: "user-1", purchaseAccess: null }],
      () => { transactionCalled = true; },
    );

    const result = await service.grantTesterPremium(admin, {
      emails: ["FOUND@example.com", "missing@example.com"],
      expiresAt: futureDate(),
    });

    assert.equal(result.applied, false);
    assert.deepEqual(result.eligible, ["found@example.com"]);
    assert.deepEqual(result.missing, ["missing@example.com"]);
    assert.equal(transactionCalled, false);
  });

  test("does not replace an existing store purchase", async () => {
    const service = createService([{
      email: "paid@example.com",
      id: "user-1",
      purchaseAccess: {
        planCode: "premium_monthly",
        provider: "google",
        subscriptionStatus: "active",
      },
    }]);

    const result = await service.grantTesterPremium(admin, {
      apply: true,
      emails: ["paid@example.com"],
      expiresAt: futureDate(),
    });

    assert.equal(result.eligible.length, 0);
    assert.equal(result.conflicts.length, 1);
  });

  test("applies a temporary grant to eligible users", async () => {
    let writes = 0;
    const service = createService(
      [{ email: "tester@example.com", id: "user-1", purchaseAccess: null }],
      (operations) => { writes = operations.length; },
    );

    const result = await service.grantTesterPremium(admin, {
      apply: true,
      emails: ["tester@example.com"],
      expiresAt: futureDate(),
    });

    assert.equal(result.applied, true);
    assert.equal(writes, 1);
  });
});

function createService(
  users: Array<{ email: string; id: string; purchaseAccess: null | {
    planCode: string;
    provider: string | null;
    subscriptionStatus: string;
  } }>,
  onTransaction: (operations: unknown[]) => void = () => undefined,
) {
  const database = {
    purchaseAccess: {
      upsert: (input: unknown) => input,
    },
    user: {
      findMany: async () => users,
    },
    $transaction: async (operations: unknown[]) => {
      onTransaction(operations);
      return operations;
    },
  } as unknown as DatabaseService;

  return new AdminService(database);
}

function futureDate() {
  return new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString();
}
