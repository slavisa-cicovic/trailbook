import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { TripBundleDto, TripListItemDto } from "./dto/sync-trip.dto";
import { WaypointImagesService } from "./waypoint-images.service";

@Injectable()
export class TripsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(WaypointImagesService) private readonly waypointImagesService: WaypointImagesService,
  ) {}

  async save(userId: string, bundle: TripBundleDto) {
    this.assertValidBundle(bundle);

    const existingTrip = await this.database.trip.findUnique({
      select: { id: true, userId: true },
      where: { clientTripId: bundle.trip.clientTripId },
    });

    if (existingTrip) {
      if (existingTrip.userId !== userId) {
        throw new ForbiddenException("Trip belongs to another user.");
      }

      return false;
    }

    await this.database.trip.create({
      data: {
        clientTripId: bundle.trip.clientTripId,
        description: bundle.trip.description ?? null,
        endedAt: bundle.trip.endedAt ? new Date(bundle.trip.endedAt) : null,
        processingVersion: bundle.trip.processingVersion,
        rawBundle: bundle as unknown as Prisma.InputJsonValue,
        startedAt: new Date(bundle.trip.startedAt),
        status: bundle.trip.status,
        title: bundle.trip.title,
        userId,
      },
    });

    return true;
  }

  async listForUser(userId: string): Promise<TripListItemDto[]> {
    const trips = await this.database.trip.findMany({
      orderBy: { startedAt: "desc" },
      select: {
        clientTripId: true,
        endedAt: true,
        startedAt: true,
        title: true,
      },
      where: { deletedAt: null, userId },
    });

    return trips.map((trip) => ({
      clientTripId: trip.clientTripId,
      endedAt: trip.endedAt?.toISOString() ?? null,
      startedAt: trip.startedAt.toISOString(),
      title: trip.title,
    }));
  }

  async get(clientTripId: string, userId: string): Promise<TripBundleDto> {
    const trip = await this.database.trip.findUnique({
      where: { clientTripId },
    });

    if (!trip || trip.deletedAt) {
      throw new NotFoundException(`Trip not found: ${clientTripId}`);
    }

    if (trip.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return trip.rawBundle as unknown as TripBundleDto;
  }

  async delete(clientTripId: string, userId: string): Promise<void> {
    const trip = await this.database.trip.findUnique({
      select: { id: true, rawBundle: true, userId: true },
      where: { clientTripId },
    });

    if (!trip) {
      return;
    }
    if (trip.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const bundle = trip.rawBundle as unknown as Partial<TripBundleDto>;
    const waypointIds = (bundle.waypoints ?? []).map((waypoint) => waypoint.id);
    await this.waypointImagesService.deleteImagesForWaypoints(waypointIds);
    await this.database.trip.update({
      data: { deletedAt: new Date() },
      where: { id: trip.id },
    });
  }

  private assertValidBundle(bundle: TripBundleDto) {
    if (!bundle?.trip?.clientTripId?.trim()) {
      throw new BadRequestException("trip.clientTripId is required.");
    }

    if (!bundle.trip.title?.trim()) {
      throw new BadRequestException("trip.title is required.");
    }

    if (!bundle.trip.startedAt) {
      throw new BadRequestException("trip.startedAt is required.");
    }

    if (!bundle.trip.status?.trim()) {
      throw new BadRequestException("trip.status is required.");
    }

    if (!bundle.captureMeta) {
      throw new BadRequestException("captureMeta is required.");
    }

    if (!bundle.raw) {
      throw new BadRequestException("raw is required.");
    }

    bundle.raw.locations ??= [];
    bundle.raw.activities ??= [];
    bundle.raw.devices ??= [];
    bundle.raw.events ??= [];
    bundle.waypoints ??= [];
    bundle.segments ??= [];
  }
}
