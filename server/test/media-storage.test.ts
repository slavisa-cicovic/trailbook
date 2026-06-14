import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import { Readable } from "node:stream";

import { InternalServerErrorException, NotFoundException } from "@nestjs/common";

import { getConfiguredMediaStorageBackend } from "../src/trips/media-object-storage";
import { MediaStorageService } from "../src/trips/media-storage.service";

async function readStream(stream: Readable) {
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

describe("MediaStorageService", () => {
  const originalMediaStorageBackend = process.env.MEDIA_STORAGE_BACKEND;
  const originalMediaStorageDir = process.env.MEDIA_STORAGE_DIR;
  let tempDir: string | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "trailbook-media-storage-test-"));
    process.env.MEDIA_STORAGE_BACKEND = "file";
    process.env.MEDIA_STORAGE_DIR = tempDir;
  });

  afterEach(async () => {
    process.env.MEDIA_STORAGE_BACKEND = originalMediaStorageBackend;
    process.env.MEDIA_STORAGE_DIR = originalMediaStorageDir;
    if (tempDir) {
      await rm(tempDir, { force: true, recursive: true }).catch(() => undefined);
    }
    tempDir = null;
  });

  test("stores and reads trip attachments through the file backend", async () => {
    const service = new MediaStorageService();

    const stored = await service.storeTripAttachment({
      attachmentId: "attachment-1",
      fileBuffer: Buffer.from("photo-bytes"),
      mimeType: "image/jpeg",
      originalFilename: null,
      tripId: "trip-1",
    });

    assert.equal(stored.storageKey, "trip-attachments/trip-1/attachment-1.jpg");

    const content = await service.getTripAttachment(stored.storageKey);

    assert.equal(content.contentLength, "photo-bytes".length);
    assert.equal((await readStream(content.body)).toString("utf8"), "photo-bytes");
  });

  test("rejects unsafe file storage keys", async () => {
    const service = new MediaStorageService();

    await assert.rejects(() => service.getTripAttachment("../outside.jpg"), NotFoundException);
  });

  test("rejects unsupported storage backend values", () => {
    process.env.MEDIA_STORAGE_BACKEND = "ftp";

    assert.throws(() => getConfiguredMediaStorageBackend(), InternalServerErrorException);
  });
});
