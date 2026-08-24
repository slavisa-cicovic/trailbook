import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../src/database/database.service";
import { WaypointImagesService } from "../src/trips/waypoint-images.service";

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
          { id: "image-1", objectKey: "media/images/image-1" },
          { id: "image-2", objectKey: "media/images/image-2" },
          { id: "image-3", objectKey: "media/images/image-3" },
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
  } finally {
    restoreEnv("S3_ACCESS_KEY_ID", previousEnv.accessKey);
    restoreEnv("S3_SECRET_ACCESS_KEY", previousEnv.secretKey);
    restoreEnv("S3_BUCKET", previousEnv.bucket);
  }
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
