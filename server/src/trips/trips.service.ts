import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { UsersService } from "../users/users.service";
import { MediaStorageService } from "./media-storage.service";
import type { SaveTripEditDto } from "./dto/save-trip-edit.dto";
import type { ShareTripDto } from "./dto/share-trip.dto";
import type {
  SyncTripBundleDto,
  SyncTripDto,
  SyncTripGroupsDto,
  SyncTripPointsChunkDto,
  SyncTripStatsSnapshotDto,
} from "./dto/sync-trip.dto";
import type { UpdateTripDto } from "./dto/update-trip.dto";

@Injectable()
export class TripsService {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(MediaStorageService) private readonly mediaStorageService: MediaStorageService,
  ) {}

  private isTripDiagnosticsEnabled() {
    return process.env.ENABLE_TRIP_DIAGNOSTICS === "true";
  }

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

  private async lockTripMutation(tx: Prisma.TransactionClient, tripId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trip-sync:${tripId}`})::bigint)`;
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  private getRawBundle(rawBundle: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
    return this.isRecord(rawBundle) ? rawBundle : null;
  }

  private getRawBundleArray(rawBundle: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const value = rawBundle[key];

    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => this.isRecord(item)) : [];
  }

  private getStringValue(value: unknown): string | null {
    return typeof value === "string" ? value : null;
  }

  private getNumberValue(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  private getBundleWaypointCount(rawBundle: unknown): number | null {
    if (!this.isRecord(rawBundle)) {
      return null;
    }

    const waypoints = rawBundle.waypoints;

    return Array.isArray(waypoints) ? waypoints.length : null;
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

  private getBundlePointCount(rawBundle: unknown): number | null {
    if (!rawBundle || typeof rawBundle !== "object") {
      return null;
    }

    const locations = (rawBundle as { locations?: unknown }).locations;

    return Array.isArray(locations) ? locations.length : null;
  }

  private getBundleDistanceMeters(rawBundle: unknown): number | null {
    if (!rawBundle || typeof rawBundle !== "object") {
      return null;
    }

    const segments = (rawBundle as { segments?: unknown }).segments;

    if (!Array.isArray(segments)) {
      return null;
    }

    return segments.reduce((total, segment) => {
      if (!segment || typeof segment !== "object") {
        return total;
      }

      const distanceM = (segment as { distanceM?: unknown }).distanceM;

      return typeof distanceM === "number" && Number.isFinite(distanceM) ? total + distanceM : total;
    }, 0);
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
      recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
      startedAt: Date;
      endedAt: Date | null;
      updatedAt: Date;
      pointCount: number | null;
      distanceMeters: number | null;
      statsUpdatedAt: Date | null;
      rawBundle?: Prisma.JsonValue | null;
    },
  ) {
    const rawBundle = this.getRawBundle(trip.rawBundle);

    if (!rawBundle) {
      return null;
    }

    return {
      trip: {
        description: trip.description,
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        id: trip.id,
        pointCount: this.getBundlePointCount(rawBundle),
        distanceMeters: this.getBundleDistanceMeters(rawBundle),
        statsUpdatedAt: trip.statsUpdatedAt ? trip.statsUpdatedAt.toISOString() : null,
        recordingProfile: trip.recordingProfile,
        segmentCount: this.getRawBundleArray(rawBundle, "segments").length,
        startedAt: trip.startedAt.toISOString(),
        title: trip.title,
        updatedAt: trip.updatedAt.toISOString(),
        waypointCount: this.getBundleWaypointCount(rawBundle) ?? 0,
      },
    };
  }

  private getBundleSegmentLocalId(tripLocalId: string, segment: Record<string, unknown>, index: number): string {
    return this.getStringValue(segment.localId) ?? `core-segment-${tripLocalId}-${index + 1}`;
  }

  private getBundleSegmentType(segment: Record<string, unknown>): "walk" | "bike" | "drive" | "boat" | "plane" | "stationary" {
    const type = this.getStringValue(segment.segmentType);

    if (type === "walk" || type === "bike" || type === "drive" || type === "boat" || type === "plane") {
      return type;
    }

    return "stationary";
  }

  private findBundleSegmentForTimestamp(
    timestamp: string,
    segments: Array<Record<string, unknown>>,
  ): { index: number; segment: Record<string, unknown> } | null {
    const timestampMs = new Date(timestamp).getTime();

    if (!Number.isFinite(timestampMs)) {
      return null;
    }

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const startedAt = this.getStringValue(segment.startedAt);
      const endedAt = this.getStringValue(segment.endedAt);

      if (!startedAt || !endedAt) {
        continue;
      }

      const startedAtMs = new Date(startedAt).getTime();
      const endedAtMs = new Date(endedAt).getTime();

      if (Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && timestampMs >= startedAtMs && timestampMs <= endedAtMs) {
        return { index, segment };
      }
    }

    return null;
  }

  private getOwnedTripDetailFromRawBundle(
    trip: Parameters<TripsService["toOwnedTripDetail"]>[0],
    rawBundle: Record<string, unknown>,
  ) {
    const bundleSegments = this.getRawBundleArray(rawBundle, "segments");
    const bundleLocations = this.getRawBundleArray(rawBundle, "locations");
    const bundleWaypoints = this.getRawBundleArray(rawBundle, "waypoints");
    const waypointImages = this.getRawBundleArray(rawBundle, "waypointImages");
    const pointCount = this.getBundlePointCount(rawBundle) ?? trip.pointCount ?? null;
    const distanceMeters = this.getBundleDistanceMeters(rawBundle) ?? trip.distanceMeters ?? null;
    const segments = bundleSegments.map((segment, index) => {
      const startedAt = this.getStringValue(segment.startedAt) ?? trip.startedAt.toISOString();
      const endedAt = this.getStringValue(segment.endedAt);
      const segmentLocalId = this.getBundleSegmentLocalId(trip.localSourceId, segment, index);

      return {
        createdAt: startedAt,
        distanceMeters: this.getNumberValue(segment.distanceM),
        durationMs: endedAt ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime()) : null,
        endedAt,
        id: segmentLocalId,
        localId: segmentLocalId,
        pointCount: bundleLocations.filter((location) => {
          const timestamp = this.getStringValue(location.timestamp);
          const matched = timestamp ? this.findBundleSegmentForTimestamp(timestamp, bundleSegments) : null;

          return matched?.index === index;
        }).length,
        recordingProfile: this.getBundleSegmentType(segment),
        startedAt,
        statsUpdatedAt: trip.statsUpdatedAt ? trip.statsUpdatedAt.toISOString() : null,
        updatedAt: trip.updatedAt.toISOString(),
      };
    });
    const points = bundleLocations.map((location, index) => {
      const timestamp = this.getStringValue(location.timestamp) ?? trip.startedAt.toISOString();
      const matchedSegment = this.findBundleSegmentForTimestamp(timestamp, bundleSegments);
      const segmentLocalId = matchedSegment
        ? this.getBundleSegmentLocalId(trip.localSourceId, matchedSegment.segment, matchedSegment.index)
        : null;

      return {
        accuracy: this.getNumberValue(location.accuracyM),
        altitude: this.getNumberValue(location.altitudeM),
        id: this.getStringValue(location.id) ?? `bundle-point-${trip.localSourceId}-${index + 1}`,
        latitude: this.getNumberValue(location.latitude) ?? 0,
        localId: this.getStringValue(location.id) ?? `bundle-point-${trip.localSourceId}-${index + 1}`,
        longitude: this.getNumberValue(location.longitude) ?? 0,
        recordedAt: timestamp,
        segmentId: segmentLocalId,
        speed: this.getNumberValue(location.speedMps),
      };
    });
    const rawEvents = bundleLocations.map((location, index) => {
      const timestamp = this.getStringValue(location.timestamp) ?? trip.startedAt.toISOString();
      const matchedSegment = this.findBundleSegmentForTimestamp(timestamp, bundleSegments);
      const segmentLocalId = matchedSegment
        ? this.getBundleSegmentLocalId(trip.localSourceId, matchedSegment.segment, matchedSegment.index)
        : null;
      const localId = this.getStringValue(location.id) ?? `bundle-raw-${trip.localSourceId}-${index + 1}`;

      return {
        acceptedTripPointLocalId: `bundle-point-${trip.localSourceId}-${index + 1}`,
        accuracy: this.getNumberValue(location.accuracyM),
        activeSegmentLocalId: segmentLocalId,
        altitude: this.getNumberValue(location.altitudeM),
        batchId: "bundle",
        batchIndex: index,
        callbackSource: this.getStringValue(location.provider) ?? "background",
        id: localId,
        latitude: this.getNumberValue(location.latitude) ?? 0,
        localId,
        longitude: this.getNumberValue(location.longitude) ?? 0,
        origin: "device",
        processedAt: trip.updatedAt.toISOString(),
        processingDecision: "restored-from-raw-bundle",
        processingStatus: "accepted",
        receivedAt: timestamp,
        recordedAt: timestamp,
        segmentLocalId,
        sessionStartedAt: trip.startedAt.toISOString(),
        speed: this.getNumberValue(location.speedMps),
      };
    });
    const waypoints = bundleWaypoints.map((waypoint, index) => ({
      category: this.getStringValue(waypoint.type) ?? "generic",
      createdAt: this.getStringValue(waypoint.createdAt) ?? trip.createdAt.toISOString(),
      id: this.getStringValue(waypoint.id) ?? `bundle-waypoint-${trip.localSourceId}-${index + 1}`,
      latitude: this.getNumberValue(waypoint.latitude) ?? 0,
      localId: this.getStringValue(waypoint.id) ?? `bundle-waypoint-${trip.localSourceId}-${index + 1}`,
      longitude: this.getNumberValue(waypoint.longitude) ?? 0,
      note: this.getStringValue(waypoint.note),
      segmentId: null,
      title: this.getStringValue(waypoint.title) ?? "Waypoint",
      updatedAt: this.getStringValue(waypoint.updatedAt) ?? trip.updatedAt.toISOString(),
    }));
    const attachments = trip.attachments
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
      }));
    const bundleAttachments = waypointImages
      .map((image, index) => {
        const waypointId = this.getStringValue(image.waypointId);
        const id = this.getStringValue(image.id) ?? `bundle-image-${trip.localSourceId}-${index + 1}`;

        if (!waypointId) {
          return null;
        }

        return {
          createdAt: this.getStringValue(image.createdAt) ?? trip.createdAt.toISOString(),
          fileSizeBytes: null,
          id,
          localId: id,
          mimeType: this.getStringValue(image.mimeType),
          updatedAt: this.getStringValue(image.createdAt) ?? trip.updatedAt.toISOString(),
          waypointId,
          waypointLocalId: waypointId,
        };
      })
      .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null);

    return {
      trip: {
        createdAt: trip.createdAt.toISOString(),
        deletedAt: trip.deletedAt ? trip.deletedAt.toISOString() : null,
        description: trip.description,
        deviceId: trip.ownerDeviceId,
        endedAt: trip.endedAt ? trip.endedAt.toISOString() : null,
        id: trip.id,
        localId: trip.localSourceId,
        recordingConfig: trip.recordingConfigJson ?? null,
        recordingProfile: trip.recordingProfile,
        batteryStartLevelPercent: trip.batteryStartLevelPercent ?? null,
        batteryStartState: trip.batteryStartState ?? null,
        batteryEndLevelPercent: trip.batteryEndLevelPercent ?? null,
        batteryEndState: trip.batteryEndState ?? null,
        pointCount,
        distanceMeters,
        statsUpdatedAt: trip.statsUpdatedAt ? trip.statsUpdatedAt.toISOString() : null,
        startedAt: trip.startedAt.toISOString(),
        title: trip.title,
        updatedAt: trip.updatedAt.toISOString(),
        attachments: attachments.length > 0 ? attachments : bundleAttachments,
        points,
        rawEvents,
        segments,
        waypoints,
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
      recordingProfile: "walk" | "bike" | "drive" | "boat" | "plane" | "stationary";
      startedAt: Date;
      title: string;
      updatedAt: Date;
      deletedAt: Date | null;
      recordingConfigJson?: Prisma.JsonValue | null;
      batteryStartLevelPercent?: number | null;
      batteryStartState?: string | null;
      batteryEndLevelPercent?: number | null;
      batteryEndState?: string | null;
      pointCount?: number | null;
      distanceMeters?: number | null;
      statsUpdatedAt?: Date | null;
      rawBundle?: Prisma.JsonValue | null;
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
    const rawBundle = this.getRawBundle(trip.rawBundle);

    if (!rawBundle) {
      throw new NotFoundException("Trip raw bundle not found.");
    }

    return this.getOwnedTripDetailFromRawBundle(trip, rawBundle);
  }

  async syncTrip(ownerUserId: string, payload: SyncTripDto) {
    const dedupedSegments = this.dedupeByLocalId(payload.segments);
    const dedupedPoints = this.dedupeByLocalId(payload.points ?? []);
    const shouldSyncRawEvents = Array.isArray(payload.rawEvents);
    const dedupedRawEvents = this.dedupeByLocalId(payload.rawEvents ?? []);
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
          recordingConfigJson: payload.recordingConfig
            ? (payload.recordingConfig as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          batteryStartLevelPercent: payload.batteryStartLevelPercent ?? null,
          batteryStartState: payload.batteryStartState ?? null,
          batteryEndLevelPercent: payload.batteryEndLevelPercent ?? null,
          batteryEndState: payload.batteryEndState ?? null,
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
          recordingConfigJson: payload.recordingConfig
            ? (payload.recordingConfig as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          batteryStartLevelPercent: payload.batteryStartLevelPercent ?? null,
          batteryStartState: payload.batteryStartState ?? null,
          batteryEndLevelPercent: payload.batteryEndLevelPercent ?? null,
          batteryEndState: payload.batteryEndState ?? null,
          startedAt: new Date(payload.startedAt),
          endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
          createdAt: new Date(payload.createdAt),
          updatedAt: new Date(payload.updatedAt),
          deletedAt: payload.deletedAt ? new Date(payload.deletedAt) : null,
        },
      });

      await this.lockTripMutation(tx, upsertedTrip.id);

      await tx.tripPoint.deleteMany({ where: { tripId: upsertedTrip.id } });
      if (shouldSyncRawEvents) {
        await tx.rawLocationEvent.deleteMany({ where: { tripId: upsertedTrip.id } });
      }
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

      if (shouldSyncRawEvents) {
        for (const rawEvent of dedupedRawEvents) {
          await tx.rawLocationEvent.create({
            data: {
              tripId: upsertedTrip.id,
              localSourceId: rawEvent.localId,
              sessionStartedAt: rawEvent.sessionStartedAt ? new Date(rawEvent.sessionStartedAt) : null,
              activeSegmentLocalSourceId: rawEvent.activeSegmentLocalId,
              batchId: rawEvent.batchId,
              batchIndex: rawEvent.batchIndex,
              callbackSource: rawEvent.callbackSource,
              origin: rawEvent.origin,
              receivedAt: new Date(rawEvent.receivedAt),
              recordedAt: new Date(rawEvent.recordedAt),
              latitude: rawEvent.latitude,
              longitude: rawEvent.longitude,
              accuracy: rawEvent.accuracy,
              altitude: rawEvent.altitude,
              speed: rawEvent.speed,
              processingStatus: rawEvent.processingStatus,
              processingDecision: rawEvent.processingDecision,
              processedAt: rawEvent.processedAt ? new Date(rawEvent.processedAt) : null,
              acceptedTripPointLocalSourceId: rawEvent.acceptedTripPointLocalId,
              segmentLocalSourceId: rawEvent.segmentLocalId,
            },
          });
        }
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

      if (this.isTripDiagnosticsEnabled() && payload.diagnostics) {
        await tx.tripDiagnostics.upsert({
          where: {
            tripId_deviceId: {
              tripId: upsertedTrip.id,
              deviceId: payload.deviceId,
            },
          },
          create: {
            tripId: upsertedTrip.id,
            deviceId: payload.deviceId,
            platform: payload.diagnostics.platform,
            recordingMode: payload.diagnostics.recordingMode,
            callbackCount: payload.diagnostics.callbackCount,
            decisionCount: payload.diagnostics.decisionCount,
            accepted: payload.diagnostics.accepted,
            acceptedAfterLongGap: payload.diagnostics.acceptedAfterLongGap ?? 0,
            foregroundCallbacks: payload.diagnostics.foregroundCallbacks,
            backgroundCallbacks: payload.diagnostics.backgroundCallbacks,
            foregroundAccepted: payload.diagnostics.foregroundAccepted,
            backgroundAccepted: payload.diagnostics.backgroundAccepted,
            foregroundRejected: payload.diagnostics.foregroundRejected,
            backgroundRejected: payload.diagnostics.backgroundRejected,
            duplicateTimestamp: payload.diagnostics.duplicateTimestamp,
            duplicateCoordinates: payload.diagnostics.duplicateCoordinates,
            sessionDuplicateRecordedAt: payload.diagnostics.sessionDuplicateRecordedAt,
            rejectedByAccuracy: payload.diagnostics.rejectedByAccuracy,
            rejectedByMinMovement: payload.diagnostics.rejectedByMinMovement,
            rejectedByJumpDistance: payload.diagnostics.rejectedByJumpDistance,
            rejectedByImpliedSpeed: payload.diagnostics.rejectedByImpliedSpeed,
            maxCallbackGapMs: payload.diagnostics.maxCallbackGapMs,
            maxRecordedGapMs: payload.diagnostics.maxRecordedGapMs,
            maxSilentGapMs: payload.diagnostics.maxSilentGapMs ?? 0,
            silentGapCount: payload.diagnostics.silentGapCount ?? 0,
            accuracyHistogramJson: payload.diagnostics.accuracyHistogram as unknown as Prisma.InputJsonValue,
            recentEventsJson: payload.diagnostics.recentEvents as unknown as Prisma.InputJsonValue,
          },
          update: {
            platform: payload.diagnostics.platform,
            recordingMode: payload.diagnostics.recordingMode,
            callbackCount: payload.diagnostics.callbackCount,
            decisionCount: payload.diagnostics.decisionCount,
            accepted: payload.diagnostics.accepted,
            acceptedAfterLongGap: payload.diagnostics.acceptedAfterLongGap ?? 0,
            foregroundCallbacks: payload.diagnostics.foregroundCallbacks,
            backgroundCallbacks: payload.diagnostics.backgroundCallbacks,
            foregroundAccepted: payload.diagnostics.foregroundAccepted,
            backgroundAccepted: payload.diagnostics.backgroundAccepted,
            foregroundRejected: payload.diagnostics.foregroundRejected,
            backgroundRejected: payload.diagnostics.backgroundRejected,
            duplicateTimestamp: payload.diagnostics.duplicateTimestamp,
            duplicateCoordinates: payload.diagnostics.duplicateCoordinates,
            sessionDuplicateRecordedAt: payload.diagnostics.sessionDuplicateRecordedAt,
            rejectedByAccuracy: payload.diagnostics.rejectedByAccuracy,
            rejectedByMinMovement: payload.diagnostics.rejectedByMinMovement,
            rejectedByJumpDistance: payload.diagnostics.rejectedByJumpDistance,
            rejectedByImpliedSpeed: payload.diagnostics.rejectedByImpliedSpeed,
            maxCallbackGapMs: payload.diagnostics.maxCallbackGapMs,
            maxRecordedGapMs: payload.diagnostics.maxRecordedGapMs,
            maxSilentGapMs: payload.diagnostics.maxSilentGapMs ?? 0,
            silentGapCount: payload.diagnostics.silentGapCount ?? 0,
            accuracyHistogramJson: payload.diagnostics.accuracyHistogram as unknown as Prisma.InputJsonValue,
            recentEventsJson: payload.diagnostics.recentEvents as unknown as Prisma.InputJsonValue,
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

  async syncTripBundle(ownerUserId: string, payload: SyncTripBundleDto) {
    if (!payload.clientTripId.trim()) {
      throw new BadRequestException("clientTripId is required.");
    }

    if (!payload.title.trim()) {
      throw new BadRequestException("title is required.");
    }

    const updatedAt = this.parseDateOrFallback(payload.updatedAt, new Date());
    const pointCount = this.getBundlePointCount(payload.rawBundle);
    const distanceMeters = this.getBundleDistanceMeters(payload.rawBundle);

    const trip = await this.databaseService.trip.upsert({
      where: {
        ownerUserId_localSourceId: {
          ownerUserId,
          localSourceId: payload.clientTripId,
        },
      },
      create: {
        createdAt: updatedAt,
        deletedAt: null,
        description: payload.description?.trim() || null,
        distanceMeters,
        endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
        localSourceId: payload.clientTripId,
        ownerDeviceId: "bundle",
        ownerUserId,
        pointCount,
        processingVersion: payload.processingVersion,
        rawBundle: payload.rawBundle as Prisma.InputJsonValue,
        recordingConfigJson: Prisma.JsonNull,
        recordingProfile: "walk",
        startedAt: new Date(payload.startedAt),
        statsUpdatedAt: updatedAt,
        status: payload.status,
        title: payload.title.trim(),
        updatedAt,
      },
      update: {
        deletedAt: null,
        description: payload.description?.trim() || null,
        distanceMeters,
        endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
        pointCount,
        processingVersion: payload.processingVersion,
        rawBundle: payload.rawBundle as Prisma.InputJsonValue,
        startedAt: new Date(payload.startedAt),
        statsUpdatedAt: updatedAt,
        status: payload.status,
        title: payload.title.trim(),
        updatedAt,
      },
    });

    return {
      processingVersion: payload.processingVersion,
      syncedAt: new Date().toISOString(),
      tripId: trip.id,
      tripLocalId: trip.localSourceId,
    };
  }

  async syncTripPoints(ownerUserId: string, tripId: string, payload: SyncTripPointsChunkDto) {
    const dedupedPoints = this.dedupeByLocalId(payload.points ?? []);

    const result = await this.databaseService.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: {
          id: tripId,
          ownerUserId,
        },
        select: {
          id: true,
          localSourceId: true,
        },
      });

      if (!trip) {
        throw new NotFoundException("Trip not found.");
      }

      await this.lockTripMutation(tx, trip.id);

      const segments = await tx.tripSegment.findMany({
        where: {
          tripId,
        },
        select: {
          id: true,
          localSourceId: true,
        },
      });
      const segmentIdByLocalId = new Map(segments.map((segment) => [segment.localSourceId, segment.id]));

      for (const point of dedupedPoints) {
        await tx.tripPoint.upsert({
          where: {
            tripId_localSourceId: {
              tripId,
              localSourceId: point.localId,
            },
          },
          create: {
            tripId,
            segmentId: point.segmentLocalId ? (segmentIdByLocalId.get(point.segmentLocalId) ?? null) : null,
            localSourceId: point.localId,
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: new Date(point.recordedAt),
            accuracy: point.accuracy,
            altitude: point.altitude,
            speed: point.speed,
          },
          update: {
            segmentId: point.segmentLocalId ? (segmentIdByLocalId.get(point.segmentLocalId) ?? null) : null,
            latitude: point.latitude,
            longitude: point.longitude,
            recordedAt: new Date(point.recordedAt),
            accuracy: point.accuracy,
            altitude: point.altitude,
            speed: point.speed,
          },
        });
      }

      return {
        accepted: dedupedPoints.length,
        tripLocalId: trip.localSourceId,
      };
    });

    return {
      ...result,
      syncedAt: new Date().toISOString(),
      tripId,
    };
  }

  async syncTripStats(ownerUserId: string, tripId: string, payload: SyncTripStatsSnapshotDto) {
    const result = await this.databaseService.$transaction(async (tx) => {
      const trip = await tx.trip.findFirst({
        where: {
          id: tripId,
          ownerUserId,
        },
        select: {
          id: true,
          localSourceId: true,
        },
      });

      if (!trip) {
        throw new NotFoundException("Trip not found.");
      }

      await this.lockTripMutation(tx, trip.id);

      if (payload.tripStats) {
        await tx.trip.update({
          where: { id: tripId },
          data: {
            pointCount: payload.tripStats.pointCount,
            distanceMeters: payload.tripStats.distanceMeters,
            statsUpdatedAt: this.parseDateOrFallback(payload.tripStats.updatedAt, new Date()),
          },
        });
      }

      const segments = await tx.tripSegment.findMany({
        where: {
          tripId,
        },
        select: {
          id: true,
          localSourceId: true,
        },
      });
      const segmentIdByLocalId = new Map(segments.map((segment) => [segment.localSourceId, segment.id]));
      let segmentStatsUpdated = 0;

      for (const segmentStats of payload.segmentStats ?? []) {
        const segmentId = segmentIdByLocalId.get(segmentStats.segmentLocalId);

        if (!segmentId) {
          continue;
        }

        await tx.tripSegment.update({
          where: { id: segmentId },
          data: {
            pointCount: segmentStats.pointCount,
            distanceMeters: segmentStats.distanceMeters,
            durationMs: segmentStats.durationMs,
            statsUpdatedAt: this.parseDateOrFallback(segmentStats.updatedAt, new Date()),
          },
        });
        segmentStatsUpdated += 1;
      }

      return {
        segmentStatsUpdated,
        tripLocalId: trip.localSourceId,
      };
    });

    return {
      ...result,
      syncedAt: new Date().toISOString(),
      tripId,
    };
  }

  async syncTripGroups(ownerUserId: string, payload: SyncTripGroupsDto) {
    if (!Array.isArray(payload.groups) || !Array.isArray(payload.members)) {
      throw new BadRequestException("Trip group sync payload is invalid.");
    }

    const dedupedGroups = this.dedupeByLocalId(payload.groups);
    const dedupedMembers = this.dedupeByLocalId(payload.members);
    const syncedAt = new Date().toISOString();

    const result = await this.databaseService.$transaction(async (tx) => {
      const groupLocalIds = Array.from(
        new Set([
          ...dedupedGroups.map((group) => group.localId),
          ...dedupedMembers.map((member) => member.groupLocalId),
        ]),
      );
      const tripLocalIds = Array.from(new Set(dedupedMembers.map((member) => member.tripLocalId)));
      const existingGroups = groupLocalIds.length
        ? await tx.tripGroup.findMany({
            where: {
              ownerUserId,
              localSourceId: {
                in: groupLocalIds,
              },
            },
            select: {
              id: true,
              localSourceId: true,
            },
          })
        : [];
      const ownedTrips = tripLocalIds.length
        ? await tx.trip.findMany({
            where: {
              ownerUserId,
              localSourceId: {
                in: tripLocalIds,
              },
            },
            select: {
              id: true,
              localSourceId: true,
            },
          })
        : [];
      const groupByLocalId = new Map(existingGroups.map((group) => [group.localSourceId, group]));
      const tripByLocalId = new Map(ownedTrips.map((trip) => [trip.localSourceId, trip]));
      const syncedGroups: Array<{ groupId: string; localId: string }> = [];
      const syncedMembers: Array<{ localId: string; memberId: string }> = [];

      for (const group of dedupedGroups) {
        const title = group.title.trim();

        if (title.length === 0 && group.deletedAt === null) {
          throw new BadRequestException("Trip group title is required.");
        }

        const upsertedGroup = await tx.tripGroup.upsert({
          where: {
            ownerUserId_localSourceId: {
              ownerUserId,
              localSourceId: group.localId,
            },
          },
          create: {
            ownerUserId,
            localSourceId: group.localId,
            title: title || "Untitled group",
            description: group.description?.trim() || null,
            createdAt: this.parseDateOrFallback(group.createdAt, group.updatedAt),
            updatedAt: this.parseDateOrFallback(group.updatedAt, syncedAt),
            deletedAt: group.deletedAt ? this.parseDateOrFallback(group.deletedAt, syncedAt) : null,
          },
          update: {
            title: title || "Untitled group",
            description: group.description?.trim() || null,
            updatedAt: this.parseDateOrFallback(group.updatedAt, syncedAt),
            deletedAt: group.deletedAt ? this.parseDateOrFallback(group.deletedAt, syncedAt) : null,
          },
          select: {
            id: true,
            localSourceId: true,
          },
        });

        groupByLocalId.set(group.localId, upsertedGroup);
        syncedGroups.push({
          groupId: upsertedGroup.id,
          localId: group.localId,
        });
      }

      for (const member of dedupedMembers) {
        const group = groupByLocalId.get(member.groupLocalId);
        const trip = tripByLocalId.get(member.tripLocalId);

        if (!group || !trip) {
          throw new BadRequestException("Trip group member references an unknown owned group or trip.");
        }

        const upsertedMember = await tx.tripGroupMember.upsert({
          where: {
            ownerUserId_localSourceId: {
              ownerUserId,
              localSourceId: member.localId,
            },
          },
          create: {
            ownerUserId,
            groupId: group.id,
            groupLocalSourceId: member.groupLocalId,
            tripId: trip.id,
            tripLocalSourceId: member.tripLocalId,
            localSourceId: member.localId,
            sortOrder: member.sortOrder,
            createdAt: this.parseDateOrFallback(member.createdAt, member.updatedAt),
            updatedAt: this.parseDateOrFallback(member.updatedAt, syncedAt),
            deletedAt: member.deletedAt ? this.parseDateOrFallback(member.deletedAt, syncedAt) : null,
          },
          update: {
            groupId: group.id,
            groupLocalSourceId: member.groupLocalId,
            tripId: trip.id,
            tripLocalSourceId: member.tripLocalId,
            sortOrder: member.sortOrder,
            updatedAt: this.parseDateOrFallback(member.updatedAt, syncedAt),
            deletedAt: member.deletedAt ? this.parseDateOrFallback(member.deletedAt, syncedAt) : null,
          },
          select: {
            id: true,
            localSourceId: true,
          },
        });

        syncedMembers.push({
          localId: member.localId,
          memberId: upsertedMember.id,
        });
      }

      return {
        groups: syncedGroups,
        members: syncedMembers,
      };
    });

    return {
      ...result,
      syncedAt,
    };
  }

  async listTripGroups(ownerUserId: string) {
    const groups = await this.databaseService.tripGroup.findMany({
      where: {
        ownerUserId,
      },
      include: {
        members: {
          include: {
            trip: {
              select: {
                ownerUserId: true,
              },
            },
          },
          orderBy: [
            {
              sortOrder: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return {
      groups: groups.map((group) => ({
        createdAt: group.createdAt.toISOString(),
        deletedAt: group.deletedAt ? group.deletedAt.toISOString() : null,
        description: group.description,
        id: group.id,
        localId: group.localSourceId,
        title: group.title,
        updatedAt: group.updatedAt.toISOString(),
      })),
      members: groups.flatMap((group) =>
        group.members
          .filter((member) => member.ownerUserId === ownerUserId && member.trip.ownerUserId === ownerUserId)
          .map((member) => ({
            createdAt: member.createdAt.toISOString(),
            deletedAt: member.deletedAt ? member.deletedAt.toISOString() : null,
            groupId: member.groupId,
            groupLocalId: member.groupLocalSourceId,
            id: member.id,
            localId: member.localSourceId,
            sortOrder: member.sortOrder,
            tripId: member.tripId,
            tripLocalId: member.tripLocalSourceId,
            updatedAt: member.updatedAt.toISOString(),
          })),
      ),
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
      orderBy: {
        startedAt: "desc",
      },
    });

    return {
      trips: trips
        .map((trip) => this.toOwnedTripSummary(trip)?.trip ?? null)
        .filter((trip): trip is NonNullable<typeof trip> => trip !== null),
    };
  }

  async getOwnedTrip(ownerUserId: string, tripId: string) {
    const trip = await this.databaseService.trip.findUnique({
      where: { id: tripId },
      include: {
        attachments: {
          orderBy: { createdAt: "asc" },
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

    const rawBundle = this.getRawBundle(trip.rawBundle);

    if (rawBundle) {
      const ownedDetail = this.getOwnedTripDetailFromRawBundle(trip, rawBundle).trip;
      const photoCountByWaypointLocalId = new Map<string, number>();

      for (const attachment of ownedDetail.attachments) {
        photoCountByWaypointLocalId.set(
          attachment.waypointLocalId,
          (photoCountByWaypointLocalId.get(attachment.waypointLocalId) ?? 0) + 1,
        );
      }

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
          distanceMeters: ownedDetail.distanceMeters ?? 0,
          waypointCount: ownedDetail.waypoints.length,
          photoCount: ownedDetail.attachments.length,
          segmentCount: ownedDetail.segments.length,
        },
        points: ownedDetail.points.map((point) => ({
          localId: point.localId,
          latitude: point.latitude,
          longitude: point.longitude,
          recordedAt: point.recordedAt,
          segmentLocalId: point.segmentId,
          accuracy: point.accuracy,
          altitude: point.altitude,
          speed: point.speed,
        })),
        segments: ownedDetail.segments.map((segment) => ({
          localId: segment.localId,
          recordingProfile: segment.recordingProfile,
          startedAt: segment.startedAt,
          endedAt: segment.endedAt,
          distanceMeters: segment.distanceMeters ?? 0,
        })),
        waypoints: ownedDetail.waypoints.map((waypoint) => ({
          localId: waypoint.localId,
          category: waypoint.category,
          title: waypoint.title,
          note: waypoint.note,
          latitude: waypoint.latitude,
          longitude: waypoint.longitude,
          recordedAt: waypoint.createdAt,
          photoCount: photoCountByWaypointLocalId.get(waypoint.localId) ?? 0,
          segmentLocalId: waypoint.segmentId,
        })),
        pauses: [],
      };
    }

    throw new NotFoundException("Trip raw bundle not found.");
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
          pointCount: share.trip.pointCount,
          distanceMeters: share.trip.distanceMeters,
          statsUpdatedAt: share.trip.statsUpdatedAt ? share.trip.statsUpdatedAt.toISOString() : null,
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
        pointCount: share.trip.pointCount,
        distanceMeters: share.trip.distanceMeters,
        statsUpdatedAt: share.trip.statsUpdatedAt ? share.trip.statsUpdatedAt.toISOString() : null,
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
          pointCount: segment.pointCount,
          distanceMeters: segment.distanceMeters,
          durationMs: segment.durationMs,
          statsUpdatedAt: segment.statsUpdatedAt ? segment.statsUpdatedAt.toISOString() : null,
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

    const content = await this.mediaStorageService.getTripAttachment(attachment.storageKey);

    return {
      body: content.body,
      contentLength: content.contentLength ?? attachment.fileSizeBytes,
      mimeType: attachment.mimeType ?? content.contentType,
    };
  }
}
