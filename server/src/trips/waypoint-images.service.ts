import { Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { DatabaseService } from "../database/database.service";

@Injectable()
export class WaypointImagesService {
  private readonly bucket = this.getRequiredEnv("S3_BUCKET");
  private readonly s3Client = new S3Client({
    credentials: {
      accessKeyId: this.getRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: this.getRequiredEnv("S3_SECRET_ACCESS_KEY"),
    },
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: this.getBooleanEnv("S3_FORCE_PATH_STYLE", false),
    region: process.env.S3_REGION?.trim() || "us-east-1",
  });

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async requestUpload(waypointId: string, imageId: string, contentType: string) {
    const objectKey = `waypoints/${waypointId}/${imageId}`;

    await this.database.waypointImage.upsert({
      create: {
        id: imageId,
        objectKey,
        waypointId,
      },
      update: {
        objectKey,
        waypointId,
      },
      where: { id: imageId },
    });

    const putUrl = await getSignedUrl(
      this.s3Client,
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

  async getImages(waypointId: string) {
    const images = await this.database.waypointImage.findMany({
      orderBy: { createdAt: "asc" },
      where: { waypointId },
    });

    return Promise.all(
      images.map(async (image) => ({
        getUrl: await getSignedUrl(
          this.s3Client,
          new GetObjectCommand({
            Bucket: this.bucket,
            Key: image.objectKey,
          }),
          { expiresIn: 60 * 60 },
        ),
        imageId: image.id,
        objectKey: image.objectKey,
      })),
    );
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
