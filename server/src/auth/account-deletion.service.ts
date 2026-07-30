import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { TripBundleDto } from "../trips/dto/sync-trip.dto";

@Injectable()
export class AccountDeletionService {
  private readonly bucket = this.getRequiredEnv("S3_BUCKET");
  private readonly s3Client = new S3Client({
    credentials: this.getOptionalS3Credentials(),
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: this.getBooleanEnv("S3_FORCE_PATH_STYLE", false),
    region: process.env.S3_REGION?.trim() || "us-east-1",
  });

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async deleteAccount(userId: string) {
    const trips = await this.database.trip.findMany({
      select: { rawBundle: true },
      where: { userId },
    });
    const waypointIds = this.collectWaypointIds(trips.map((trip) => trip.rawBundle));
    const images =
      waypointIds.length === 0
        ? []
        : await this.database.waypointImage.findMany({
            select: { objectKey: true },
            where: { waypointId: { in: waypointIds } },
          });

    await this.deleteStoredObjects(images.map((image) => image.objectKey));

    await this.database.$transaction(async (transaction) => {
      if (waypointIds.length > 0) {
        await transaction.waypointImage.deleteMany({
          where: { waypointId: { in: waypointIds } },
        });
      }
      await transaction.user.delete({ where: { id: userId } });
    });
  }

  private collectWaypointIds(rawBundles: unknown[]) {
    const ids = new Set<string>();
    for (const rawBundle of rawBundles) {
      const bundle = rawBundle as Partial<TripBundleDto> | null;
      if (!Array.isArray(bundle?.waypoints)) continue;
      for (const waypoint of bundle.waypoints) {
        if (typeof waypoint?.id === "string" && waypoint.id) ids.add(waypoint.id);
      }
    }
    return [...ids];
  }

  private async deleteStoredObjects(objectKeys: string[]) {
    const uniqueKeys = [...new Set(objectKeys.filter(Boolean))];
    for (let index = 0; index < uniqueKeys.length; index += 1_000) {
      const batch = uniqueKeys.slice(index, index + 1_000);
      const result = await this.s3Client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
      if (result.Errors?.length) {
        throw new InternalServerErrorException(
          "Account photos could not be completely removed from storage.",
        );
      }
    }
  }

  private getRequiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured.`);
    }
    return value;
  }

  private getOptionalS3Credentials() {
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
    if (!accessKeyId && !secretAccessKey) return undefined;
    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        "Both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured, or neither when using IAM role credentials.",
      );
    }
    return { accessKeyId, secretAccessKey };
  }

  private getBooleanEnv(name: string, fallback: boolean) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) return fallback;
    return value === "1" || value === "true" || value === "yes";
  }
}
