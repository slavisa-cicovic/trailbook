import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import { WaypointImagesService } from "../src/trips/waypoint-images.service";
import { BadRequestException } from "@nestjs/common";

test("lists verified image metadata without a per-image S3 HEAD request", async () => {
  const previousEnv = {
    accessKey: process.env.S3_ACCESS_KEY_ID,
    bucket: process.env.S3_BUCKET,
    secretKey: process.env.S3_SECRET_ACCESS_KEY,
  };
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "trailbook-test";

  try {
    const database = {
      waypointImage: {
        findMany: async () => [
          { capturedAt: new Date("2026-09-07T10:00:00Z"), id: "image-1", objectKey: "media/images/image-1", photoLatitude: 44.98, photoLongitude: 19.82 },
          { capturedAt: null, id: "image-2", objectKey: "media/images/image-2", photoLatitude: null, photoLongitude: null },
          { capturedAt: null, id: "image-3", objectKey: "media/images/image-3", photoLatitude: null, photoLongitude: null },
        ],
      },
    } as unknown as DatabaseService;
    const service = new WaypointImagesService(database);
    let objectStoreRequests = 0;
    (service as unknown as { s3Client: { send(): Promise<never> } }).s3Client = {
      send: async () => {
        objectStoreRequests += 1;
        throw new Error("getImages must not access S3");
      },
    };

    const images = await service.getImages("waypoint-1");

    assert.equal(objectStoreRequests, 0);
    assert.deepEqual(images.map((image) => image.imageId), ["image-1", "image-2", "image-3"]);
    assert.ok(images.every((image) => image.getUrl.includes("media/images/")));
    assert.equal(images[0]?.capturedAt, "2026-09-07T10:00:00.000Z");
    assert.equal(images[0]?.photoLatitude, 44.98);
  } finally {
    restoreEnv("S3_ACCESS_KEY_ID", previousEnv.accessKey);
    restoreEnv("S3_SECRET_ACCESS_KEY", previousEnv.secretKey);
    restoreEnv("S3_BUCKET", previousEnv.bucket);
  }
});

test("rejects HEIC and HEIF uploads even if configuration lists them", async () => {
  const previousEnv = {
    accessKey: process.env.S3_ACCESS_KEY_ID,
    allowedTypes: process.env.MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES,
    bucket: process.env.S3_BUCKET,
    secretKey: process.env.S3_SECRET_ACCESS_KEY,
  };
  process.env.S3_ACCESS_KEY_ID = "test-access-key";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret-key";
  process.env.S3_BUCKET = "trailbook-test";
  process.env.MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES = "image/jpeg,image/heic,image/heif";

  try {
    const service = new WaypointImagesService({} as DatabaseService);
    for (const contentType of ["image/heic", "image/heif"]) {
      await assert.rejects(
        service.requestUpload("user-1", {
          capturedAt: null,
          contentType,
          imageId: "550e8400-e29b-41d4-a716-446655440000",
          sizeBytes: 1024,
          photoLatitude: null,
          photoLongitude: null,
          waypointId: "waypoint-1",
        }),
        (error) =>
          error instanceof BadRequestException &&
          error.message === `Unsupported image content type: ${contentType}`,
      );
    }
  } finally {
    restoreEnv("S3_ACCESS_KEY_ID", previousEnv.accessKey);
    restoreEnv("S3_SECRET_ACCESS_KEY", previousEnv.secretKey);
    restoreEnv("S3_BUCKET", previousEnv.bucket);
    restoreEnv("MEDIA_UPLOAD_ALLOWED_CONTENT_TYPES", previousEnv.allowedTypes);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
