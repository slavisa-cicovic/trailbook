import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { UsersService } from "../users/users.service";
import { MediaStorageService } from "./media-storage.service";
import type { ShareTripDto } from "./dto/share-trip.dto";
import type { SyncTripDto } from "./dto/sync-trip.dto";

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

  async syncTrip(ownerUserId: string, payload: SyncTripDto) {
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

      for (const segment of payload.segments) {
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

      for (const point of payload.points) {
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

      for (const waypoint of payload.waypoints) {
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

      const attachmentLocalIds = payload.attachments.map((attachment) => attachment.localId);

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

      for (const attachment of payload.attachments) {
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
