import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type HeadObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { DatabaseService } from "../database/database.service";
import type { TripBundleDto } from "./dto/sync-trip.dto";

interface RequestUploadInput {
  contentType: string;
  imageId: string;
  sizeBytes: number | null;
  waypointId: string;
}

interface CompleteUploadInput {
  contentType: string | null;
  imageId: string;
  sizeBytes: number | null;
  storageKey: string | null;
  waypointId: string;
}

@Injectable()
export class WaypointImagesService {
  private readonly bucket = this.getRequiredEnv("S3_BUCKET");
  private readonly credentials = {
    accessKeyId: this.getRequiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: this.getRequiredEnv("S3_SECRET_ACCESS_KEY"),
  };
  private readonly forcePathStyle = this.getBooleanEnv("S3_FORCE_PATH_STYLE", false);
  private readonly maxSizeBytes = this.getNumberEnv("MEDIA_UPLOAD_MAX_SIZE_BYTES", 10 * 1024 * 1024);
  private readonly allowedContentTypes = this.getListEnv("MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES", [
    "image/jpeg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/webp",
  ]);
  private readonly region = process.env.S3_REGION?.trim() || "us-east-1";
  private readonly s3Client = new S3Client({
    credentials: this.credentials,
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: this.forcePathStyle,
    region: this.region,
  });
  private readonly publicS3Client = new S3Client({
    credentials: this.credentials,
    endpoint:
      process.env.S3_PUBLIC_ENDPOINT?.trim() ||
      process.env.S3_ENDPOINT?.trim() ||
      undefined,
    forcePathStyle: this.forcePathStyle,
    region: this.region,
  });

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async requestUpload(userId: string, input: RequestUploadInput) {
    const contentType = this.normalizeContentType(input.contentType);
    this.assertValidImageId(input.imageId);
    this.assertAllowedUpload(contentType, input.sizeBytes);
    await this.assertWaypointOwnedByUser(userId, input.waypointId);

    const objectKey = this.createObjectKey(input.imageId);

    const putUrl = await getSignedUrl(
      this.publicS3Client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: contentType,
        Key: objectKey,
      }),
      { expiresIn: 15 * 60 },
    );

    await this.database.waypointImage.upsert({
      create: {
        contentType,
        id: input.imageId,
        imageUuid: input.imageId,
        objectKey,
        sizeBytes: input.sizeBytes,
        uploadStatus: "pending",
        waypointId: input.waypointId,
      },
      update: {
        contentType,
        lastUploadError: null,
        objectKey,
        sizeBytes: input.sizeBytes,
        uploadStatus: "pending",
        waypointId: input.waypointId,
      },
      where: { id: input.imageId },
    });

    return {
      objectKey,
      putUrl,
    };
  }

  async completeUpload(userId: string, input: CompleteUploadInput) {
    this.assertValidImageId(input.imageId);
    await this.assertWaypointOwnedByUser(userId, input.waypointId);

    const image = await this.database.waypointImage.findFirst({
      where: { id: input.imageId, waypointId: input.waypointId },
    });
    if (!image) {
      throw new NotFoundException("Image upload request was not found.");
    }

    const expectedObjectKey = this.createObjectKey(input.imageId);
    if (image.objectKey !== expectedObjectKey || (input.storageKey && input.storageKey !== expectedObjectKey)) {
      await this.markUploadFailed(input.imageId, "Storage key does not match image context.");
      throw new BadRequestException("Storage key does not match image context.");
    }

    const expectedContentType = this.normalizeContentType(input.contentType ?? image.contentType ?? "");
    this.assertAllowedUpload(expectedContentType, input.sizeBytes ?? image.sizeBytes ?? null);

    let head: HeadObjectCommandOutput;
    try {
      head = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: expectedObjectKey,
        }),
      );
    } catch {
      await this.markUploadFailed(input.imageId, "Uploaded image object validation failed.");
      throw new NotFoundException("Uploaded image object was not found.");
    }

    const actualContentType = this.normalizeContentType(head.ContentType ?? "");
    if (actualContentType && actualContentType !== expectedContentType) {
      await this.markUploadFailed(input.imageId, "Uploaded image content type does not match presigned metadata.");
      throw new BadRequestException("Uploaded image content type does not match presigned metadata.");
    }

    const expectedSizeBytes = input.sizeBytes ?? image.sizeBytes;
    if (typeof expectedSizeBytes === "number" && head.ContentLength !== expectedSizeBytes) {
      await this.markUploadFailed(input.imageId, "Uploaded image size does not match presigned metadata.");
      throw new BadRequestException("Uploaded image size does not match presigned metadata.");
    }

    const now = new Date();
    await this.database.waypointImage.update({
      data: {
        contentType: expectedContentType,
        lastUploadError: null,
        objectKey: expectedObjectKey,
        remoteVerifiedAt: now,
        sizeBytes: input.sizeBytes ?? image.sizeBytes,
        uploadedAt: now,
        uploadStatus: "uploaded",
      },
      where: { id: input.imageId },
    });

    return { objectKey: expectedObjectKey };
  }

  async getImages(waypointId: string) {
    const images = await this.database.waypointImage.findMany({
      orderBy: { createdAt: "asc" },
      where: { uploadStatus: "uploaded", waypointId },
    });

    const availableImages = [];

    for (const image of images) {
      try {
        await this.s3Client.send(
          new HeadObjectCommand({
            Bucket: this.bucket,
            Key: image.objectKey,
          }),
        );
      } catch {
        await this.database.waypointImage.delete({ where: { id: image.id } });
        continue;
      }

      availableImages.push({
        getUrl: await getSignedUrl(
          this.publicS3Client,
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: image.objectKey,
          }),
          { expiresIn: 60 * 60 },
        ),
        imageId: image.id,
        objectKey: image.objectKey,
      });
    }

    return availableImages;
  }

  async deleteImage(userId: string, waypointId: string, imageId: string) {
    await this.assertWaypointOwnedByUser(userId, waypointId);
    const image = await this.database.waypointImage.findFirst({
      where: { id: imageId, waypointId },
    });
    if (!image) {
      return;
    }

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: image.objectKey,
      }),
    );
    await this.database.waypointImage.update({
      data: { uploadStatus: "deleted" },
      where: { id: image.id },
    });
  }

  async deleteImagesForWaypoints(waypointIds: string[]) {
    if (waypointIds.length === 0) {
      return;
    }

    const images = await this.database.waypointImage.findMany({
      where: { waypointId: { in: waypointIds } },
    });

    for (const image of images) {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: image.objectKey,
        }),
      );
    }

    await this.database.waypointImage.updateMany({
      data: { uploadStatus: "deleted" },
      where: { waypointId: { in: waypointIds } },
    });
  }

  async assertWaypointOwnedByUser(userId: string, waypointId: string) {
    const trips = await this.database.trip.findMany({
      select: { rawBundle: true },
      where: { deletedAt: null, userId },
    });

    for (const trip of trips) {
      const bundle = trip.rawBundle as unknown as Partial<TripBundleDto>;
      if ((bundle.waypoints ?? []).some((waypoint) => waypoint.id === waypointId)) {
        return;
      }
    }

    throw new ForbiddenException("Waypoint does not belong to the authenticated user.");
  }

  private createObjectKey(imageUuid: string) {
    return `media/images/${imageUuid}`;
  }

  private assertValidImageId(imageId: string) {
    if (!/^[0-9a-fA-F-]{36}$/.test(imageId)) {
      throw new BadRequestException("imageId must be a UUID.");
    }
  }

  private assertAllowedUpload(contentType: string, sizeBytes: number | null) {
    if (!this.allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(`Unsupported image content type: ${contentType}`);
    }

    if (typeof sizeBytes === "number" && sizeBytes > this.maxSizeBytes) {
      throw new BadRequestException(`Image is larger than max upload size: ${this.maxSizeBytes} bytes.`);
    }

    if (typeof sizeBytes === "number" && sizeBytes <= 0) {
      throw new BadRequestException("Image size must be greater than zero.");
    }
  }

  private async markUploadFailed(imageId: string, message: string) {
    await this.database.waypointImage.update({
      data: {
        lastUploadError: message,
        uploadAttemptCount: { increment: 1 },
        uploadStatus: "failed",
      },
      where: { id: imageId },
    });
  }

  private normalizeContentType(contentType: string) {
    return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  }

  private getRequiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured.`);
    }
    return value;
  }

  private getBooleanEnv(name: string, fallback: boolean) {
    const value = process.env[name]?.trim().toLowerCase();
    if (!value) {
      return fallback;
    }
    return value === "1" || value === "true" || value === "yes";
  }

  private getListEnv(name: string, fallback: string[]) {
    const value = process.env[name]?.trim();
    if (!value) {
      return fallback;
    }
    return value
      .split(",")
      .map((item) => this.normalizeContentType(item))
      .filter(Boolean);
  }

  private getNumberEnv(name: string, fallback: number) {
    const value = process.env[name]?.trim();
    if (!value) {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new InternalServerErrorException(`${name} must be a positive number.`);
    }
    return parsed;
  }
}
