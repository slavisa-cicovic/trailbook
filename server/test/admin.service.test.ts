import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import { AdminService } from "../src/admin/admin.service";

describe("AdminService dashboard metrics", () => {
  test("counts new production subscribers in the selected range", async () => {
    let subscriberFilter: unknown;
    const database = {
      $queryRaw: async () => [{ totalTripPoints: 28 }],
      purchaseAccess: {
        count: async (input: unknown) => {
          subscriberFilter = input;
          return 3;
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

    assert.equal(result.overview.newSubscribers, 3);
    assert.equal(result.overview.tripsCreated, 7);
    assert.equal(result.overview.averageTripPointsPerTrip, 4);
    assert.deepEqual(subscriberFilter, {
      where: {
        createdAt: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lt: new Date("2026-10-01T00:00:00.000Z"),
        },
        environment: "production",
        planCode: { in: ["premium_monthly", "premium_yearly"] },
        provider: { in: ["apple", "google"] },
      },
    });
  });
});
