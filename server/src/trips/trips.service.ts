import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { UsersService } from "../users/users.service";
import { MediaStorageService } from "./media-storage.service";
import type { SaveTripEditDto } from "./dto/save-trip-edit.dto";
import type { ShareTripDto } from "./dto/share-trip.dto";
import type { SyncTripDto } from "./dto/sync-trip.dto";
import type { UpdateTripDto } from "./dto/update-trip.dto";

@Injectable()
export class TripsService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(MediaStorageService) private readonly mediaStorageService: MediaStorageService,
  ) {}

  private parseDateOrFallback(value: string | null | undefined, fallback: string | Date) {
    if (!value) {
      return new Date(fallback);
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return new Date(fallback);
    }

    return parsed;
  }

  private calculateDistanceMeters(
    points: Array<{
      latitude: number;
      longitude: number;
    }>,
  ) {
    if (points.length < 2) {
      return 0;
    }

    const toRadians = (value: number) => (value * Math.PI) / 180;
    let total = 0;

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];

      const latitudeDelta = toRadians(current.latitude - previous.latitude);
      const longitudeDelta = toRadians(current.longitude - previous.longitude);
      const latitudeA = toRadians(previous.latitude);
      const latitudeB = toRadians(current.latitude);

      const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) ** 2;

      total += 2 * 6371000 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }

    return total;
  }

  private dedupeByLocalId<T extends { localId: string }>(items: T[]) {
    const seen = new Set<string>();
    const deduped: T[] = [];

    for (const item of items) {
      if (seen.has(item.localId)) {
        continue;
      }

      seen.add(item.localId);
      deduped.push(item);
    }

    return deduped;
  }

  private validateTripEditInput(input: SaveTripEditDto) {
    if (!input?.trip || typeof input.trip.title !== "string" || input.trip.title.trim().length === 0) {
      throw new BadRequestException("Trip title is required.");
    }

    if (!Array.isArray(input.segments) || !Array.isArray(input.points) || !Array.isArray(input.waypoints)) {
      throw new BadRequestException("Trip edit payload is invalid.");
    }

    for (const segment of input.segments) {
      if (!segment.localId || !segment.startedAt) {
        throw new BadRequestException("Each segment must have a localId and startedAt.");
      }
    }

    for (const point of input.points) {
      if (!point.localId || !point.recordedAt) {
        throw new BadRequestException("Each point must have a localId and recordedAt.");
      }
    }

    for (const waypoint of input.waypoints) {
      if (!waypoint.localId || !waypoint.recordedAt || !waypoint.title) {
        throw new BadRequestException("Each waypoint must have a localId, title, and recordedAt.");
      }
    }
  }

  private toOwnedTripSummary(
    trip: {
      id: string;
      title: string;
      description: string | null;
      recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
      startedAt: Date;
      endedAt: Date | null;
      updatedAt: Date;
      segments: Array<{ id: string }>;
      waypoints: Array<{ deletedAt: Date | null }>;
    },
  ) {
    return {
      trip: {
        description: trip.description,
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        id: trip.id,
        recordingProfile: trip.recordingProfile,
        segmentCount: trip.segments.length,
        startedAt: trip.startedAt.toISOString(),
        title: trip.title,
        updatedAt: trip.updatedAt.toISOString(),
        waypointCount: trip.waypoints.filter((waypoint) => waypoint.deletedAt === null).length,
      },
    };
  }

  private toOwnedTripDetail(
    trip: {
      id: string;
      localSourceId: string;
      ownerDeviceId: string;
      ownerUserId: string;
      createdAt: Date;
      description: string | null;
      endedAt: Date | null;
      recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
      startedAt: Date;
      title: string;
      updatedAt: Date;
      deletedAt: Date | null;
      attachments: Array<{
        id: string;
        localSourceId: string;
        waypointId: string;
        waypointLocalSourceId: string;
        mimeType: string | null;
        fileSizeBytes: number | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        storageKey: string | null;
      }>;
      points: Array<{
        id: string;
        localSourceId: string;
        latitude: number;
        longitude: number;
        recordedAt: Date;
        accuracy: number | null;
        altitude: number | null;
        speed: number | null;
        segmentId: string | null;
      }>;
      segments: Array<{
        id: string;
        localSourceId: string;
        recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane";
        startedAt: Date;
        endedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
      waypoints: Array<{
        id: string;
        localSourceId: string;
        category:
          | "generic"
          | "departure"
          | "fuel"
          | "border"
          | "port"
          | "ferry"
          | "restaurant"
          | "cafe"
          | "viewpoint"
          | "monument"
          | "beach";
        latitude: number;
        longitude: number;
        title: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        segmentId: string | null;
      }>;
    },
  ) {
    return {
      trip: {
        createdAt: trip.createdAt.toISOString(),
        deletedAt: trip.deletedAt ? trip.deletedAt.toISOString() : null,
        description: trip.description,
        deviceId: trip.ownerDeviceId,
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        id: trip.id,
        localId: trip.localSourceId,
        recordingProfile: trip.recordingProfile,
        startedAt: trip.startedAt.toISOString(),
        title: trip.title,
        updatedAt: trip.updatedAt.toISOString(),
        attachments: trip.attachments
          .filter((attachment) => attachment.deletedAt === null && attachment.storageKey !== null)
          .map((attachment) => ({
            createdAt: attachment.createdAt.toISOString(),
            fileSizeBytes: attachment.fileSizeBytes,
            id: attachment.id,
            localId: attachment.localSourceId,
            mimeType: attachment.mimeType,
            updatedAt: attachment.updatedAt.toISOString(),
            waypointId: attachment.waypointId,
            waypointLocalId: attachment.waypointLocalSourceId,
          })),
        points: trip.points.map((point) => ({
          accuracy: point.accuracy,
          altitude: point.altitude,
          id: point.id,
          latitude: point.latitude,
          localId: point.localSourceId,
          longitude: point.longitude,
          recordedAt: point.recordedAt.toISOString(),
          segmentId: point.segmentId,
          speed: point.speed,
        })),
        segments: trip.segments.map((segment) => ({
          createdAt: segment.createdAt.toISOString(),
          endedAt: segment.endedAt ? segment.endedAt.toISOString() : null,
          id: segment.id,
          localId: segment.localSourceId,
          recordingProfile: segment.recordingProfile,
          startedAt: segment.startedAt.toISOString(),
          updatedAt: segment.updatedAt.toISOString(),
        })),
        waypoints: trip.waypoints
          .filter((waypoint) => waypoint.deletedAt === null)
          .map((waypoint) => ({
            category: waypoint.category,
            createdAt: waypoint.createdAt.toISOString(),
            id: waypoint.id,
            latitude: waypoint.latitude,
            localId: waypoint.localSourceId,
            longitude: waypoint.longitude,
            note: waypoint.note,
            segmentId: waypoint.segmentId,
            title: waypoint.title,
            updatedAt: waypoint.updatedAt.toISOString(),
          })),
      },
    };
  }

  async syncTrip(ownerUserId: string, payload: SyncTripDto) {
    const dedupedSegments = this.dedupeByLocalId(payload.segments);
    const dedupedPoints = this.dedupeByLocalId(payload.points);
    const dedupedWaypoints = this.dedupeByLocalId(payload.waypoints);
    const dedupedAttachments = this.dedupeByLocalId(payload.attachments);

    const trip = await this.databaseService.$transaction(async (tx) => {
      const upsertedTrip = await tx.trip.upsert({
        where: {
          ownerUserId_localSourceId: {
            ownerUserId,
            localSourceId: payload.localId,
          },
        },
        create: {
          ownerUserId,
          ownerDeviceId: payload.deviceId,
          localSourceId: payload.localId,
          title: payload.title.trim(),
          description: payload.description?.trim() || null,
          recordingProfile: payload.recordingProfile,
          startedAt: new Date(payload.startedAt),
          endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
          createdAt: new Date(payload.createdAt),
          updatedAt: new Date(payload.updatedAt),
          deletedAt: payload.deletedAt ? new Date(payload.deletedAt) : null,
        },
        update: {
          ownerDeviceId: payload.deviceId,
          title: payload.title.trim(),
          description: payload.description?.trim() || null,
          recordingProfile: payload.recordingProfile,
          startedAt: new Date(payload.startedAt),
          endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
          createdAt: new Date(payload.createdAt),
          updatedAt: new Date(payload.updatedAt),
          deletedAt: payload.deletedAt ? new Date(payload.deletedAt) : null,
        },
      });

      await tx.tripPoint.deleteMany({ where: { tripId: upsertedTrip.id } });
      await tx.waypoint.deleteMany({ where: { tripId: upsertedTrip.id } });
      await tx.tripSegment.deleteMany({ where: { tripId: upsertedTrip.id } });

      const segmentIdByLocalId = new Map<string, string>();
      const waypointIdByLocalId = new Map<string, string>();

      for (const segment of dedupedSegments) {
        const createdSegment = await tx.tripSegment.create({
          data: {
            tripId: upsertedTrip.id,
            localSourceId: segment.localId,
            recordingProfile: segment.recordingProfile,
            startedAt: new Date(segment.startedAt),
            endedAt: segment.endedAt ? new Date(segment.endedAt) : null,
            createdAt: new Date(segment.createdAt),
            updatedAt: new Date(segment.updatedAt),
          },
        });

        segmentIdByLocalId.set(segment.localId, createdSegment.id);
      }

      for (const point of dedupedPoints) {
        await tx.tripPoint.create({
          data: {
            tripId: upsertedTrip.id,
            segmentId: point.segmentLocalId ? (segmentIdByLocalId.get(point.segmentLocalId) ?? null) : null,
            localSourceId: point.localId,
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: new Date(point.recordedAt),
            accuracy: point.accuracy,
            altitude: point.altitude,
            speed: point.speed,
          },
        });
      }

      for (const waypoint of dedupedWaypoints) {
        const createdWaypoint = await tx.waypoint.create({
          data: {
            tripId: upsertedTrip.id,
            segmentId: waypoint.segmentLocalId ? (segmentIdByLocalId.get(waypoint.segmentLocalId) ?? null) : null,
            localSourceId: waypoint.localId,
            category: waypoint.category,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            title: waypoint.title,
            note: waypoint.note,
            createdAt: new Date(waypoint.createdAt),
            updatedAt: new Date(waypoint.updatedAt),
            deletedAt: waypoint.deletedAt ? new Date(waypoint.deletedAt) : null,
          },
        });

        waypointIdByLocalId.set(waypoint.localId, createdWaypoint.id);
      }

      const attachmentLocalIds = dedupedAttachments.map((attachment) => attachment.localId);

      if (attachmentLocalIds.length > 0) {
        await tx.waypointAttachment.deleteMany({
          where: {
            tripId: upsertedTrip.id,
            localSourceId: {
              notIn: attachmentLocalIds,
            },
          },
        });
      } else {
        await tx.waypointAttachment.deleteMany({
          where: {
            tripId: upsertedTrip.id,
          },
        });
      }

      for (const attachment of dedupedAttachments) {
        const waypointId = waypointIdByLocalId.get(attachment.waypointLocalId);

        if (!waypointId) {
          continue;
        }

        await tx.waypointAttachment.upsert({
          where: {
            tripId_localSourceId: {
              tripId: upsertedTrip.id,
              localSourceId: attachment.localId,
            },
          },
          create: {
            tripId: upsertedTrip.id,
            waypointId,
            ownerUserId,
            localSourceId: attachment.localId,
            waypointLocalSourceId: attachment.waypointLocalId,
            type: attachment.type,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSize,
            createdAt: this.parseDateOrFallback(attachment.createdAt, payload.updatedAt),
            updatedAt: this.parseDateOrFallback(attachment.updatedAt, payload.updatedAt),
            deletedAt: attachment.deletedAt
              ? this.parseDateOrFallback(attachment.deletedAt, payload.updatedAt)
              : null,
          },
          update: {
            waypointId,
            waypointLocalSourceId: attachment.waypointLocalId,
            type: attachment.type,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSize,
            updatedAt: this.parseDateOrFallback(attachment.updatedAt, payload.updatedAt),
            deletedAt: attachment.deletedAt
              ? this.parseDateOrFallback(attachment.deletedAt, payload.updatedAt)
              : null,
          },
        });
      }

      return upsertedTrip;
    });

    return {
      tripId: trip.id,
      tripLocalId: payload.localId,
      syncedAt: new Date().toISOString(),
    };
  }

  async getTripOverview(ownerUserId: string, fromInput?: string, toInput?: string) {
    let from: Date | null = null;
    let to: Date | null = null;

    if (fromInput || toInput) {
      if (!fromInput || !toInput) {
        throw new BadRequestException('Query parameters "from" and "to" must be provided together.');
      }

      from = new Date(fromInput);
      to = new Date(toInput);

      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new BadRequestException('Query parameters "from" and "to" must be valid ISO dates.');
      }

      if (from.getTime() >= to.getTime()) {
        throw new BadRequestException('Query parameter "from" must be earlier than "to".');
      }
    }

    const trips = await this.databaseService.trip.findMany({
      where: {
        ownerUserId,
        deletedAt: null,
        ...(from && to
          ? {
              startedAt: {
                gte: from,
                lt: to,
              },
            }
          : {}),
      },
      include: {
        waypoints: {
          where: {
            deletedAt: null,
          },
          select: {
            id: true,
          },
        },
        attachments: {
          where: {
            deletedAt: null,
            type: "photo",
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    const summary = trips.reduce(
      (accumulator, trip) => {
        accumulator.trips += 1;
        accumulator.waypoints += trip.waypoints.length;
        accumulator.photos += trip.attachments.length;
        return accumulator;
      },
      {
        trips: 0,
        waypoints: 0,
        photos: 0,
      },
    );

    return {
      range: {
        from: from ? from.toISOString() : null,
        to: to ? to.toISOString() : null,
      },
      summary,
      trips: trips.map((trip) => ({
        id: trip.id,
        title: trip.title,
        recordingProfile: trip.recordingProfile,
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        updatedAt: trip.updatedAt.toISOString(),
        waypointCount: trip.waypoints.length,
        photoCount: trip.attachments.length,
      })),
    };
  }

  async listOwnedTrips(ownerUserId: string) {
    const trips = await this.databaseService.trip.findMany({
      where: {
        ownerUserId,
        deletedAt: null,
      },
      include: {
        segments: true,
        waypoints: true,
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    return {
      trips: trips.map((trip) => this.toOwnedTripSummary(trip).trip),
    };
  }

  async getOwnedTrip(ownerUserId: string, tripId: string) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
      include: {
        attachments: {
          orderBy: { createdAt: "asc" },
        },
        points: {
          orderBy: { recordedAt: "asc" },
        },
        segments: {
          orderBy: { startedAt: "asc" },
        },
        waypoints: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!trip || trip.ownerUserId !== ownerUserId || trip.deletedAt !== null) {
      throw new NotFoundException("Trip not found.");
    }

    return this.toOwnedTripDetail(trip);
  }

  async getTripDetail(ownerUserId: string, tripId: string) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
      include: {
        attachments: {
          where: {
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
        },
        points: {
          orderBy: { recordedAt: "asc" },
        },
        segments: {
          orderBy: { startedAt: "asc" },
        },
        waypoints: {
          where: {
            deletedAt: null,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!trip || trip.ownerUserId !== ownerUserId || trip.deletedAt !== null) {
      throw new NotFoundException("Trip not found.");
    }

    const photoAttachments = trip.attachments.filter((attachment) => attachment.type === "photo");
    const photoCountByWaypointId = new Map<string, number>();

    for (const attachment of photoAttachments) {
      photoCountByWaypointId.set(
        attachment.waypointId,
        (photoCountByWaypointId.get(attachment.waypointId) ?? 0) + 1,
      );
    }

    const distanceMeters = this.calculateDistanceMeters(trip.points);

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        description: trip.description,
        recordingProfile: trip.recordingProfile,
        startedAt: trip.startedAt.toISOString(),
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        updatedAt: trip.updatedAt.toISOString(),
        syncStatus: "synced" as const,
      },
      summary: {
        distanceMeters,
        waypointCount: trip.waypoints.length,
        photoCount: photoAttachments.length,
        segmentCount: trip.segments.length,
      },
      points: trip.points.map((point) => ({
        localId: point.localSourceId,
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAt: point.recordedAt.toISOString(),
        segmentLocalId:
          trip.segments.find((segment) => segment.id === point.segmentId)?.localSourceId ?? null,
        accuracy: point.accuracy,
        altitude: point.altitude,
        speed: point.speed,
      })),
      segments: trip.segments.map((segment) => {
        const segmentPoints = trip.points.filter((point) => point.segmentId === segment.id);

        return {
          localId: segment.localSourceId,
          recordingProfile: segment.recordingProfile,
          startedAt: segment.startedAt.toISOString(),
          endedAt: segment.endedAt ? segment.endedAt.toISOString() : null,
          distanceMeters: this.calculateDistanceMeters(segmentPoints),
        };
      }),
      waypoints: trip.waypoints.map((waypoint) => ({
        localId: waypoint.localSourceId,
        category: waypoint.category,
        title: waypoint.title,
        note: waypoint.note,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        recordedAt: waypoint.createdAt.toISOString(),
        photoCount: photoCountByWaypointId.get(waypoint.id) ?? 0,
        segmentLocalId:
          trip.segments.find((segment) => segment.id === waypoint.segmentId)?.localSourceId ?? null,
      })),
      pauses: [],
    };
  }

  async updateTrip(ownerUserId: string, tripId: string, input: UpdateTripDto) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || trip.ownerUserId !== ownerUserId || trip.deletedAt !== null) {
      throw new NotFoundException("Trip not found.");
    }

    const title = input.title?.trim();
    const description = input.description?.trim();

    if (title === undefined && description === undefined) {
      throw new BadRequestException("At least one trip field must be provided.");
    }

    if (title !== undefined && title.length === 0) {
      throw new BadRequestException("Trip title must not be empty.");
    }

    const updatedTrip = await this.databaseService.trip.update({
      where: { id: tripId },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      trip: {
        id: updatedTrip.id,
        title: updatedTrip.title,
        description: updatedTrip.description,
        recordingProfile: updatedTrip.recordingProfile,
        startedAt: updatedTrip.startedAt.toISOString(),
        endedAt: updatedTrip.endedAt ? updatedTrip.endedAt.toISOString() : null,
        updatedAt: updatedTrip.updatedAt.toISOString(),
        syncStatus: "synced" as const,
      },
    };
  }

  async saveTripEdit(ownerUserId: string, tripId: string, input: SaveTripEditDto) {
    this.validateTripEditInput(input);

    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
      include: {
        segments: true,
        waypoints: true,
      },
    });

    if (!trip || trip.ownerUserId !== ownerUserId || trip.deletedAt !== null) {
      throw new NotFoundException("Trip not found.");
    }

    const dedupedSegments = this.dedupeByLocalId(input.segments);
    const dedupedPoints = this.dedupeByLocalId(input.points);
    const dedupedWaypoints = this.dedupeByLocalId(input.waypoints);
    const now = new Date();

    await this.databaseService.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: tripId },
        data: {
          title: input.trip.title.trim(),
          description: input.trip.description?.trim() || null,
          updatedAt: now,
        },
      });

      const segmentIdByLocalId = new Map<string, string>();

      for (const segment of dedupedSegments) {
        const savedSegment = await tx.tripSegment.upsert({
          where: {
            tripId_localSourceId: {
              tripId,
              localSourceId: segment.localId,
            },
          },
          create: {
            tripId,
            localSourceId: segment.localId,
            recordingProfile: segment.recordingProfile,
            startedAt: new Date(segment.startedAt),
            endedAt: segment.endedAt ? new Date(segment.endedAt) : null,
            createdAt: new Date(segment.startedAt),
            updatedAt: now,
          },
          update: {
            recordingProfile: segment.recordingProfile,
            startedAt: new Date(segment.startedAt),
            endedAt: segment.endedAt ? new Date(segment.endedAt) : null,
            updatedAt: now,
          },
        });

        segmentIdByLocalId.set(segment.localId, savedSegment.id);
      }

      for (const waypoint of dedupedWaypoints) {
        await tx.waypoint.upsert({
          where: {
            tripId_localSourceId: {
              tripId,
              localSourceId: waypoint.localId,
            },
          },
          create: {
            tripId,
            segmentId: waypoint.segmentLocalId ? (segmentIdByLocalId.get(waypoint.segmentLocalId) ?? null) : null,
            localSourceId: waypoint.localId,
            category: waypoint.category,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            title: waypoint.title.trim(),
            note: waypoint.note?.trim() || null,
            createdAt: new Date(waypoint.recordedAt),
            updatedAt: now,
            deletedAt: null,
          },
          update: {
            segmentId: waypoint.segmentLocalId ? (segmentIdByLocalId.get(waypoint.segmentLocalId) ?? null) : null,
            category: waypoint.category,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            title: waypoint.title.trim(),
            note: waypoint.note?.trim() || null,
            updatedAt: now,
            deletedAt: null,
          },
        });
      }

      await tx.waypoint.deleteMany({
        where: {
          tripId,
          localSourceId: {
            notIn: dedupedWaypoints.map((waypoint) => waypoint.localId),
          },
        },
      });

      await tx.tripPoint.deleteMany({
        where: { tripId },
      });

      for (const point of dedupedPoints) {
        await tx.tripPoint.create({
          data: {
            tripId,
            segmentId: point.segmentLocalId ? (segmentIdByLocalId.get(point.segmentLocalId) ?? null) : null,
            localSourceId: point.localId,
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: new Date(point.recordedAt),
            accuracy: point.accuracy ?? null,
            altitude: point.altitude ?? null,
            speed: point.speed ?? null,
          },
        });
      }

      await tx.tripSegment.deleteMany({
        where: {
          tripId,
          localSourceId: {
            notIn: dedupedSegments.map((segment) => segment.localId),
          },
        },
      });
    });

    return this.getTripDetail(ownerUserId, tripId);
  }

  async shareTrip(ownerUserId: string, tripId: string, input: ShareTripDto) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || trip.ownerUserId !== ownerUserId) {
      throw new NotFoundException("Trip not found.");
    }

    const recipient = await this.usersService.findByEmail(input.recipientEmail);

    if (!recipient) {
      throw new BadRequestException("Recipient account does not exist.");
    }

    if (recipient.id === ownerUserId) {
      throw new BadRequestException("You cannot share a trip with yourself.");
    }

    const share = await this.databaseService.tripShare.upsert({
      where: {
        tripId_recipientUserId: {
          tripId,
          recipientUserId: recipient.id,
        },
      },
      create: {
        tripId,
        ownerUserId,
        recipientUserId: recipient.id,
        status: "active",
      },
      update: {
        status: "active",
        revokedAt: null,
      },
      include: {
        recipient: true,
      },
    });

    return {
      shareId: share.id,
      recipient: {
        email: share.recipient.email,
        id: share.recipient.id,
        displayName: share.recipient.displayName,
      },
      status: share.status,
      tripId,
    };
  }

  async listShareRecipients(ownerUserId: string) {
    const shares = await this.databaseService.tripShare.findMany({
      where: {
        ownerUserId,
      },
      include: {
        recipient: true,
      },
      distinct: ["recipientUserId"],
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      recipients: shares.map((share) => ({
        displayName: share.recipient.displayName,
        email: share.recipient.email,
        id: share.recipient.id,
      })),
    };
  }

  async listTripShares(ownerUserId: string, tripId: string) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || trip.ownerUserId !== ownerUserId) {
      throw new NotFoundException("Trip not found.");
    }

    const shares = await this.databaseService.tripShare.findMany({
      where: {
        tripId,
        ownerUserId,
      },
      include: {
        recipient: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      shares: shares.map((share) => ({
        createdAt: share.createdAt.toISOString(),
        id: share.id,
        recipient: {
          displayName: share.recipient.displayName,
          email: share.recipient.email,
          id: share.recipient.id,
        },
        revokedAt: share.revokedAt ? share.revokedAt.toISOString() : null,
        status: share.status,
      })),
    };
  }

  async revokeTripShare(ownerUserId: string, tripId: string, shareId: string) {
    const share = await this.databaseService.tripShare.findUnique({
      where: { id: shareId },
    });

    if (!share || share.tripId !== tripId || share.ownerUserId !== ownerUserId) {
      throw new NotFoundException("Trip share not found.");
    }

    await this.databaseService.tripShare.update({
      where: { id: shareId },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async listSharedTrips(recipientUserId: string) {
    const shares = await this.databaseService.tripShare.findMany({
      where: {
        recipientUserId,
        status: "active",
      },
      include: {
        owner: true,
        trip: {
          include: {
            segments: true,
            waypoints: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      sharedTrips: shares.map((share) => ({
        shareId: share.id,
        sharedAt: share.createdAt.toISOString(),
        owner: {
          displayName: share.owner.displayName,
          email: share.owner.email,
          id: share.owner.id,
        },
        trip: {
          id: share.trip.id,
          title: share.trip.title,
          description: share.trip.description,
          recordingProfile: share.trip.recordingProfile,
          startedAt: share.trip.startedAt.toISOString(),
          endedAt: share.trip.endedAt ? share.trip.endedAt.toISOString() : null,
          updatedAt: share.trip.updatedAt.toISOString(),
          segmentCount: share.trip.segments.length,
          waypointCount: share.trip.waypoints.filter((waypoint) => waypoint.deletedAt === null).length,
        },
      })),
    };
  }

  async getSharedTrip(recipientUserId: string, shareId: string) {
    const share = await this.databaseService.tripShare.findUnique({
      where: { id: shareId },
      include: {
        owner: true,
        trip: {
          include: {
            attachments: {
              orderBy: { createdAt: "asc" },
            },
            points: {
              orderBy: { recordedAt: "asc" },
            },
            segments: {
              orderBy: { startedAt: "asc" },
            },
            waypoints: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!share || share.recipientUserId !== recipientUserId || share.status !== "active") {
      throw new NotFoundException("Shared trip not found.");
    }

    return {
      owner: {
        displayName: share.owner.displayName,
        email: share.owner.email,
        id: share.owner.id,
      },
      shareId: share.id,
      sharedAt: share.createdAt.toISOString(),
      trip: {
        createdAt: share.trip.createdAt.toISOString(),
        description: share.trip.description,
        endedAt: share.trip.endedAt ? share.trip.endedAt.toISOString() : null,
        id: share.trip.id,
        recordingProfile: share.trip.recordingProfile,
        startedAt: share.trip.startedAt.toISOString(),
        title: share.trip.title,
        updatedAt: share.trip.updatedAt.toISOString(),
        attachments: share.trip.attachments
          .filter((attachment) => attachment.deletedAt === null && attachment.storageKey !== null)
          .map((attachment) => ({
            createdAt: attachment.createdAt.toISOString(),
            fileSizeBytes: attachment.fileSizeBytes,
            id: attachment.id,
            mimeType: attachment.mimeType,
            updatedAt: attachment.updatedAt.toISOString(),
            waypointId: attachment.waypointId,
          })),
        points: share.trip.points.map((point) => ({
          accuracy: point.accuracy,
          altitude: point.altitude,
          id: point.id,
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: point.recordedAt.toISOString(),
          segmentId: point.segmentId,
          speed: point.speed,
        })),
        segments: share.trip.segments.map((segment) => ({
          createdAt: segment.createdAt.toISOString(),
          endedAt: segment.endedAt ? segment.endedAt.toISOString() : null,
          id: segment.id,
          recordingProfile: segment.recordingProfile,
          startedAt: segment.startedAt.toISOString(),
          updatedAt: segment.updatedAt.toISOString(),
        })),
        waypoints: share.trip.waypoints
          .filter((waypoint) => waypoint.deletedAt === null)
          .map((waypoint) => ({
            category: waypoint.category,
            createdAt: waypoint.createdAt.toISOString(),
            id: waypoint.id,
            latitude: waypoint.latitude,
            longitude: waypoint.longitude,
            note: waypoint.note,
            segmentId: waypoint.segmentId,
            title: waypoint.title,
            updatedAt: waypoint.updatedAt.toISOString(),
          })),
      },
    };
  }

  async uploadTripAttachment(
    ownerUserId: string,
    tripId: string,
    attachmentLocalId: string,
    file: {
      buffer: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    } | null,
  ) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException("Attachment file is required.");
    }

    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
    });

    if (!trip || trip.ownerUserId !== ownerUserId) {
      throw new NotFoundException("Trip not found.");
    }

    const attachment = await this.databaseService.waypointAttachment.findUnique({
      where: {
        tripId_localSourceId: {
          tripId,
          localSourceId: attachmentLocalId,
        },
      },
    });

    if (!attachment || attachment.ownerUserId !== ownerUserId) {
      throw new NotFoundException("Attachment metadata not found.");
    }

    const storedFile = await this.mediaStorageService.storeTripAttachment({
      attachmentId: attachment.id,
      mimeType: file.mimetype ?? attachment.mimeType,
      originalFilename: file.originalname ?? null,
      tripId,
      fileBuffer: file.buffer,
    });

    const updatedAttachment = await this.databaseService.waypointAttachment.update({
      where: { id: attachment.id },
      data: {
        storageKey: storedFile.storageKey,
        originalFilename: file.originalname ?? attachment.originalFilename,
        mimeType: file.mimetype ?? attachment.mimeType,
        fileSizeBytes: file.size ?? attachment.fileSizeBytes,
        updatedAt: new Date(),
      },
    });

    return {
      attachmentId: updatedAttachment.id,
      attachmentLocalId: updatedAttachment.localSourceId,
      waypointId: updatedAttachment.waypointId,
    };
  }

  async getAttachmentContent(consumerUserId: string, attachmentId: string) {
    const attachment = await this.databaseService.waypointAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        trip: {
          include: {
            shares: {
              where: { status: "active" },
            },
          },
        },
      },
    });

    if (!attachment || attachment.deletedAt !== null || !attachment.storageKey) {
      throw new NotFoundException("Attachment not found.");
    }

    const hasAccess =
      attachment.ownerUserId === consumerUserId ||
      attachment.trip.shares.some((share) => share.recipientUserId === consumerUserId);

    if (!hasAccess) {
      throw new ForbiddenException("You do not have access to this attachment.");
    }

    const absolutePath = await this.mediaStorageService.resolveStoragePath(attachment.storageKey);

    return {
      absolutePath,
      mimeType: attachment.mimeType,
    };
  }
}
