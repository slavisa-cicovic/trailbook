import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import { AdminService } from "../src/admin/admin.service";

describe("AdminService dashboard metrics", () => {
  test("counts current active subscribers by recurring plan", async () => {
    let subscriberFilter: unknown;
    const database = {
      $queryRaw: async () => [{ totalTripPoints: 28 }],
      purchaseAccess: {
        groupBy: async (input: unknown) => {
          subscriberFilter = input;
          return [
            { planCode: "premium_monthly", _count: { _all: 1 } },
            { planCode: "premium_yearly", _count: { _all: 1 } },
          ];
        },
      },
      trip: { count: async () => 7 },
      user: {
        count: async (input?: unknown) => (input ? 2 : 10),
      },
      waypointImage: {
        aggregate: async () => ({
          _count: { _all: 5 },
          _sum: { sizeBytes: 1024 },
        }),
      },
    } as unknown as DatabaseService;
    const service = new AdminService(database);

    const result = await service.getDashboardMetrics(
      { displayName: "Admin", email: "admin@example.com", id: "admin-1", role: "admin" },
      { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    );

    assert.equal(result.overview.activeSubscribers, 2);
    assert.equal(result.overview.activeMonthlySubscribers, 1);
    assert.equal(result.overview.activeYearlySubscribers, 1);
    assert.equal(result.overview.newSubscribers, 2);
    assert.equal(result.overview.tripsCreated, 7);
    assert.equal(result.overview.averageTripPointsPerTrip, 4);
    const subscriberQuery = subscriberFilter as {
      by: string[];
      _count: { _all: boolean };
      where: {
        planCode: { in: string[] };
        subscriptionStatus: string;
        revokedAt: null;
        currentPeriodEndsAt: { gt: unknown };
      };
    };
    assert.deepEqual(subscriberQuery.by, ["planCode"]);
    assert.deepEqual(subscriberQuery._count, { _all: true });
    assert.deepEqual(subscriberQuery.where.planCode, { in: ["premium_monthly", "premium_yearly"] });
    assert.equal(subscriberQuery.where.subscriptionStatus, "active");
    assert.equal(subscriberQuery.where.revokedAt, null);
    assert.ok(subscriberQuery.where.currentPeriodEndsAt.gt instanceof Date);
  });
});
