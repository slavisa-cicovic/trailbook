import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import type { Request } from "express";

import type { AuthService, AuthenticatedUser } from "../src/auth/auth.service";
import type { PurchaseApplicationService } from "../src/purchases/purchase-application.service";
import { TripsController } from "../src/trips/trips.controller";
import type { TripsService } from "../src/trips/trips.service";

const USER: AuthenticatedUser = {
  displayName: "Test User",
  email: "test@example.com",
  id: "user-1",
  role: "user",
};

describe("TripsController premium enforcement", () => {
  test("does not list cloud trips when entitlement is denied", async () => {
    let listCalled = false;
    const controller = createController({
      listForUser: async () => {
        listCalled = true;
        return [];
      },
      requirePremium: async () => {
        throw new ForbiddenException({ code: "PREMIUM_ENTITLEMENT_REQUIRED" });
      },
    });

    await assert.rejects(controller.list({} as Request), (error: unknown) => {
      return error instanceof ForbiddenException && error.getStatus() === 403;
    });
    assert.equal(listCalled, false);
  });

  test("lists cloud trips after entitlement succeeds", async () => {
    let listCalled = false;
    const controller = createController({
      listForUser: async () => {
        listCalled = true;
        return [];
      },
      requirePremium: async () => undefined,
    });

    await controller.list({} as Request);

    assert.equal(listCalled, true);
  });
});

function createController(input: {
  listForUser(): Promise<[]>;
  requirePremium(): Promise<void>;
}) {
  const authService = {
    requireAuthenticatedUser: async () => USER,
  } as unknown as AuthService;
  const purchaseApplication = {
    requirePremium: input.requirePremium,
  } as unknown as PurchaseApplicationService;
  const tripsService = {
    listForUser: input.listForUser,
  } as unknown as TripsService;
  return new TripsController(authService, purchaseApplication, tripsService);
}
