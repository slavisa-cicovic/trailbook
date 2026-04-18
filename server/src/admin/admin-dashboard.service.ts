import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

export interface AdminDashboardMetrics {
  range: {
    from: string;
    to: string;
  };
  overview: {
    totalUsers: number;
    newUsers: number;
    tripsCreated: number;
    totalTripPoints: number;
    averageTripPointsPerTrip: number;
    photosCreated: number;
    totalPhotoBytes: number;
  };
}

@Injectable()
export class AdminDashboardService {
  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  private parseRequiredDate(value: string | undefined, field: "from" | "to") {
    if (!value) {
      throw new BadRequestException(`Query parameter "${field}" is required.`);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Query parameter "${field}" must be a valid ISO date.`);
    }

    return parsed;
  }

  async getDashboardMetrics(fromInput: string | undefined, toInput: string | undefined): Promise<AdminDashboardMetrics> {
    const from = this.parseRequiredDate(fromInput, "from");
    const to = this.parseRequiredDate(toInput, "to");

    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException('Query parameter "from" must be earlier than "to".');
    }

    const tripRangeWhere = {
      createdAt: {
        gte: from,
        lt: to,
      },
    } as const;

    const photoRangeWhere = {
      createdAt: {
        gte: from,
        lt: to,
      },
      deletedAt: null,
      type: "photo" as const,
    };

    const [totalUsers, newUsers, tripsCreated, totalTripPoints, photoAggregate] = await Promise.all([
      this.databaseService.user.count(),
      this.databaseService.user.count({
        where: {
          createdAt: {
            gte: from,
            lt: to,
          },
        },
      }),
      this.databaseService.trip.count({
        where: tripRangeWhere,
      }),
      this.databaseService.tripPoint.count({
        where: {
          trip: tripRangeWhere,
        },
      }),
      this.databaseService.waypointAttachment.aggregate({
        where: photoRangeWhere,
        _count: {
          _all: true,
        },
        _sum: {
          fileSizeBytes: true,
        },
      }),
    ]);

    return {
      range: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      overview: {
        totalUsers,
        newUsers,
        tripsCreated,
        totalTripPoints,
        averageTripPointsPerTrip: tripsCreated > 0 ? totalTripPoints / tripsCreated : 0,
        photosCreated: photoAggregate._count._all,
        totalPhotoBytes: photoAggregate._sum.fileSizeBytes ?? 0,
      },
    };
  }
}
