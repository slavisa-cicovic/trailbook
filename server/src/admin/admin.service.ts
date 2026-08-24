import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.service";
import { DatabaseService } from "../database/database.service";

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

  private parseRange(input: { from?: string; to?: string }) {
    const from = input.from ? new Date(input.from) : null;
    const to = input.to ? new Date(input.to) : null;

    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from.getTime() >= to.getTime()) {
      throw new BadRequestException("Valid from/to range is required.");
    }

    return { from, to };
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== "admin") {
      throw new ForbiddenException("Admin role required.");
    }
  }
}
