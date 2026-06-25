import { Inject, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class WaypointImagesService {
  private readonly bucket = this.getRequiredEnv("S3_BUCKET");
  private readonly credentials = {
    accessKeyId: this.getRequiredEnv("S3_ACCESS_KEY_ID"),
    secretAccessKey: this.getRequiredEnv("S3_SECRET_ACCESS_KEY"),
  };
  private readonly forcePathStyle = this.getBooleanEnv("S3_FORCE_PATH_STYLE", false);
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

  async requestUpload(waypointId: string, imageId: string, contentType: string) {
    const objectKey = `waypoints/${waypointId}/${imageId}`;

    const putUrl = await getSignedUrl(
      this.publicS3Client,
      new PutObjectCommand({
        Bucket: this.bucket,
        ContentType: contentType,
        Key: objectKey,
      }),
      { expiresIn: 15 * 60 },
    );

    return {
      objectKey,
      putUrl,
    };
  }

  async completeUpload(waypointId: string, imageId: string) {
    const objectKey = `waypoints/${waypointId}/${imageId}`;

    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        }),
      );
    } catch {
      throw new NotFoundException("Uploaded image object was not found.");
    }

    await this.database.waypointImage.upsert({
      create: { id: imageId, objectKey, waypointId },
      update: { objectKey, waypointId },
      where: { id: imageId },
    });

    return { objectKey };
  }

  async getImages(waypointId: string) {
    const images = await this.database.waypointImage.findMany({
      orderBy: { createdAt: "asc" },
      where: { waypointId },
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

  async deleteImage(waypointId: string, imageId: string) {
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
    await this.database.waypointImage.delete({ where: { id: image.id } });
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

    await this.database.waypointImage.deleteMany({
      where: { waypointId: { in: waypointIds } },
    });
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
}
