import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";
import { PAID_ENTITLEMENTS } from "../purchases/purchase-catalog";

interface RawTripPointCount {
  totalTripPoints: bigint | number | null;
}

@Injectable()
export class AdminService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getDashboardMetrics(user: AuthenticatedUser, input: { from?: string; to?: string }) {
    this.requireAdmin(user);

    const range = this.parseRange(input);
    const [totalUsers, newUsers, tripsCreated, photoStats, tripPointRows] = await Promise.all([
      this.database.user.count(),
      this.database.user.count({
        where: {
          createdAt: { gte: range.from, lt: range.to },
        },
      }),
      this.database.trip.count({
        where: {
          createdAt: { gte: range.from, lt: range.to },
          deletedAt: null,
        },
      }),
      this.database.waypointImage.aggregate({
        _count: { _all: true },
        _sum: { sizeBytes: true },
        where: {
          createdAt: { gte: range.from, lt: range.to },
          uploadStatus: { not: "deleted" },
        },
      }),
      this.database.$queryRaw<RawTripPointCount[]>`
        SELECT COALESCE(
          SUM(
            CASE
              WHEN jsonb_typeof(raw_bundle->'raw'->'locations') = 'array'
                THEN jsonb_array_length(raw_bundle->'raw'->'locations')
              ELSE 0
            END
          ),
          0
        ) AS "totalTripPoints"
        FROM trips
        WHERE created_at >= ${range.from}
          AND created_at < ${range.to}
          AND deleted_at IS NULL
      `,
    ]);

    const totalTripPoints = Number(tripPointRows[0]?.totalTripPoints ?? 0);

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      overview: {
        totalUsers,
        newUsers,
        tripsCreated,
        totalTripPoints,
        averageTripPointsPerTrip: tripsCreated > 0 ? totalTripPoints / tripsCreated : 0,
        photosCreated: photoStats._count._all,
        totalPhotoBytes: photoStats._sum.sizeBytes ?? 0,
      },
    };
  }

  async grantTesterPremium(
    user: AuthenticatedUser,
    input: { apply?: boolean; emails?: unknown; expiresAt?: unknown },
  ) {
    this.requireAdmin(user);

    const emails = this.parseEmails(input.emails);
    const expiresAt = this.parseTesterPremiumExpiry(input.expiresAt);
    const users = await this.database.user.findMany({
      include: { purchaseAccess: true },
      where: { email: { in: emails, mode: "insensitive" } },
    });
    const usersByEmail = new Map(users.map((candidate) => [candidate.email.toLowerCase(), candidate]));
    const missing = emails.filter((email) => !usersByEmail.has(email));
    const conflicts = users
      .filter((candidate) => candidate.purchaseAccess && candidate.purchaseAccess.planCode !== "premium_test")
      .map((candidate) => ({
        email: candidate.email,
        planCode: candidate.purchaseAccess!.planCode,
        provider: candidate.purchaseAccess!.provider,
        subscriptionStatus: candidate.purchaseAccess!.subscriptionStatus,
      }));
    const conflictEmails = new Set(conflicts.map((conflict) => conflict.email.toLowerCase()));
    const eligible = users.filter((candidate) => !conflictEmails.has(candidate.email.toLowerCase()));

    if (input.apply === true && eligible.length > 0) {
      await this.database.$transaction(
        eligible.map((candidate) =>
          this.database.purchaseAccess.upsert({
            create: {
              autoRenewEnabled: false,
              currentPeriodEndsAt: expiresAt,
              entitlements: [...PAID_ENTITLEMENTS],
              environment: "production",
              planCode: "premium_test",
              provider: null,
              subscriptionStatus: "active",
              userId: candidate.id,
              verifiedAt: new Date(),
            },
            update: {
              autoRenewEnabled: false,
              currentPeriodEndsAt: expiresAt,
              entitlements: [...PAID_ENTITLEMENTS],
              environment: "production",
              revokedAt: null,
              subscriptionStatus: "active",
              verifiedAt: new Date(),
            },
            where: { userId: candidate.id },
          }),
        ),
      );
    }

    return {
      applied: input.apply === true,
      eligible: eligible.map((candidate) => candidate.email),
      expiresAt: expiresAt.toISOString(),
      conflicts,
      missing,
      requested: emails.length,
    };
  }

  private parseRange(input: { from?: string; to?: string }) {
    const from = input.from ? new Date(input.from) : null;
    const to = input.to ? new Date(input.to) : null;

    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()) {
      throw new BadRequestException("Valid from/to range is required.");
    }

    return { from, to };
  }

  private parseEmails(value: unknown) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
      throw new BadRequestException("Provide between 1 and 100 tester email addresses.");
    }

    const emails = [...new Set(value.map((item) => typeof item === "string" ? item.trim().toLowerCase() : ""))];
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emails.some((email) => !emailPattern.test(email))) {
      throw new BadRequestException("Every tester email address must be valid.");
    }
    return emails;
  }

  private parseTesterPremiumExpiry(value: unknown) {
    const expiresAt = typeof value === "string" ? new Date(value) : new Date(Number.NaN);
    const now = Date.now();
    if (
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt.getTime() <= now ||
      expiresAt.getTime() > now + 60 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException("Tester Premium expiry must be within the next 60 days.");
    }
    return expiresAt;
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin role required.");
    }
  }
}
