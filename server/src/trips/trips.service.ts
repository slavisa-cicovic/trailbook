import { createHash, randomBytes, randomInt } from "node:crypto";

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { TripBundleDto, TripListItemDto } from "./dto/sync-trip.dto";
import { WaypointImagesService } from "./waypoint-images.service";

interface SharedWaypointImageDto {
  getUrl: string;
  imageId: string;
  objectKey: string;
}

type SharedImagesByWaypointIdDto = Record<string, SharedWaypointImageDto[]>;

export interface SharedTripListItemDto {
  clientTripId: string;
  title: string;
  description: string | null;
  startedAt: string;
  endedAt: string | null;
  owner: {
    displayName: string;
    email: string;
  };
  waypointCount: number;
  photoCount: number;
  distanceM: number;
}

export interface SharedTripDetailDto {
  bundle: TripBundleDto;
  imagesByWaypointId: SharedImagesByWaypointIdDto;
  owner: {
    displayName: string;
    email: string;
  };
}

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

      await this.database.trip.update({
        data: {
          description: bundle.trip.description ?? null,
          endedAt: bundle.trip.endedAt ? new Date(bundle.trip.endedAt) : null,
          processingVersion: bundle.trip.processingVersion,
          rawBundle: bundle as never,
          startedAt: new Date(bundle.trip.startedAt),
          status: bundle.trip.status,
          title: bundle.trip.title,
          updatedAt: new Date(),
        },
        where: { id: existingTrip.id },
      });

      return false;
    }

    await this.database.trip.create({
      data: {
        clientTripId: bundle.trip.clientTripId,
        description: bundle.trip.description ?? null,
        endedAt: bundle.trip.endedAt ? new Date(bundle.trip.endedAt) : null,
        processingVersion: bundle.trip.processingVersion,
        rawBundle: bundle as never,
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

    return trips.map((trip: {
      clientTripId: string;
      endedAt: Date | null;
      startedAt: Date;
      title: string;
    }) => ({
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

  async shareWithUser(
    clientTripId: string,
    ownerUserId: string,
    recipientEmail: string,
  ): Promise<{ recipientUserId: string; recipientEmail: string }> {
    const normalizedEmail = recipientEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException("Recipient email is required.");
    }

    const trip = await this.database.trip.findUnique({
      select: { deletedAt: true, id: true, userId: true },
      where: { clientTripId },
    });
    if (!trip || trip.deletedAt) {
      throw new NotFoundException(`Trip not found: ${clientTripId}`);
    }
    if (trip.userId !== ownerUserId) {
      throw new ForbiddenException("Access denied");
    }

    const recipient = await this.database.user.findUnique({
      select: { email: true, id: true },
      where: { email: normalizedEmail },
    });
    if (!recipient) {
      throw new NotFoundException("Recipient user not found.");
    }
    if (recipient.id === ownerUserId) {
      throw new BadRequestException("You cannot share a trip with yourself.");
    }

    await this.database.tripUserShare.upsert({
      create: {
        clientTripId,
        ownerUserId,
        recipientUserId: recipient.id,
      },
      update: {
        ownerUserId,
        revokedAt: null,
      },
      where: {
        clientTripId_recipientUserId: {
          clientTripId,
          recipientUserId: recipient.id,
        },
      },
    });

    return { recipientEmail: recipient.email, recipientUserId: recipient.id };
  }

  async listSharedWithUser(userId: string): Promise<SharedTripListItemDto[]> {
    const shares = await this.database.tripUserShare.findMany({
      include: {
        owner: { select: { displayName: true, email: true } },
        trip: {
          select: {
            clientTripId: true,
            deletedAt: true,
            description: true,
            endedAt: true,
            rawBundle: true,
            startedAt: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      where: { recipientUserId: userId, revokedAt: null },
    });

    return Promise.all(shares
      .filter((share) => !share.trip.deletedAt)
      .map(async (share) => {
        const bundle = share.trip.rawBundle as unknown as Partial<TripBundleDto>;
        const segments = bundle.segments ?? [];
        const waypoints = bundle.waypoints ?? [];
        const imagesByWaypointId = await this.getImagesByWaypointId({
          ...bundle,
          waypoints,
        } as TripBundleDto);

        return {
          clientTripId: share.trip.clientTripId,
          description: share.trip.description,
          distanceM: segments.reduce((total, segment) => total + (segment.distanceM ?? 0), 0),
          endedAt: share.trip.endedAt?.toISOString() ?? null,
          owner: share.owner,
          photoCount: Object.values(imagesByWaypointId).reduce(
            (total, images) => total + images.length,
            0,
          ),
          startedAt: share.trip.startedAt.toISOString(),
          title: share.trip.title,
          waypointCount: waypoints.length,
        };
      }));
  }

  async getSharedWithUser(clientTripId: string, userId: string): Promise<SharedTripDetailDto> {
    const share = await this.database.tripUserShare.findFirst({
      include: {
        owner: { select: { displayName: true, email: true } },
        trip: {
          select: {
            deletedAt: true,
            rawBundle: true,
          },
        },
      },
      where: { clientTripId, recipientUserId: userId, revokedAt: null },
    });

    if (!share || share.trip.deletedAt) {
      throw new NotFoundException("Shared trip not found.");
    }

    const bundle = share.trip.rawBundle as unknown as TripBundleDto;
    return {
      bundle,
      imagesByWaypointId: await this.getImagesByWaypointId(bundle),
      owner: share.owner,
    };
  }

  async createShareLink(
    clientTripId: string,
    userId: string,
  ): Promise<{ shareUrl: string; token: string; pin: string }> {
    const trip = await this.database.trip.findUnique({
      select: {
        id: true,
        deletedAt: true,
        sharePinHash: true,
        shareToken: true,
        userId: true,
      },
      where: { clientTripId },
    });

    if (!trip || trip.deletedAt) {
      throw new NotFoundException(`Trip not found: ${clientTripId}`);
    }

    if (trip.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    const token = trip.shareToken ?? randomBytes(24).toString("base64url");
    const pin = generateSharePin();
    await this.database.trip.update({
      data: {
        shareEnabled: true,
        sharePinHash: hashSharePin(pin),
        sharedAt: new Date(),
        shareToken: token,
      },
      where: { id: trip.id },
    });

    return {
      pin,
      shareUrl: `${getShareBaseUrl()}/shared/trips/${token}`,
      token,
    };
  }

  async getShared(token: string, pin: string): Promise<TripBundleDto> {
    if (!/^\d{6}$/.test(pin)) {
      throw new ForbiddenException("Invalid share PIN");
    }

    const trip = await this.database.trip.findUnique({
      select: {
        deletedAt: true,
        rawBundle: true,
        shareEnabled: true,
        sharePinHash: true,
      },
      where: { shareToken: token },
    });

    if (!trip || trip.deletedAt || !trip.shareEnabled || !trip.sharePinHash) {
      throw new NotFoundException("Shared trip not found");
    }

    if (trip.sharePinHash !== hashSharePin(pin)) {
      throw new ForbiddenException("Invalid share PIN");
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

  private async getImagesByWaypointId(bundle: TripBundleDto): Promise<SharedImagesByWaypointIdDto> {
    const entries = await Promise.all(
      bundle.waypoints.map(async (waypoint) => {
        const images = await this.waypointImagesService.getImages(waypoint.id);
        return [waypoint.id, images] as const;
      }),
    );

    return Object.fromEntries(entries);
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

function getShareBaseUrl(): string {
  const webAppUrl = process.env.WEB_APP_URL?.trim();
  if (!webAppUrl) {
    throw new BadRequestException("WEB_APP_URL is not configured.");
  }

  return webAppUrl.replace(/\/+$/, "");
}

function generateSharePin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function hashSharePin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}
