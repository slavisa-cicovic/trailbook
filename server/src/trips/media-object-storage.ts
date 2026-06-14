import { InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export interface MediaObjectPutInput {
  body: Buffer;
  contentType?: string | null;
  key: string;
}

export interface MediaObjectGetInput {
  key: string;
}

export interface MediaObjectData {
  body: Readable;
  contentLength?: number | null;
  contentType?: string | null;
}

export interface MediaObjectStorage {
  getObject(input: MediaObjectGetInput): Promise<MediaObjectData>;
  putObject(input: MediaObjectPutInput): Promise<{ storageKey: string }>;
}

export type MediaStorageBackend = "file" | "s3";

export function getConfiguredMediaStorageBackend(): MediaStorageBackend {
  const configuredBackend = process.env.MEDIA_STORAGE_BACKEND?.trim().toLowerCase();

  if (!configuredBackend || configuredBackend === "file") {
    return "file";
  }

  if (configuredBackend === "s3") {
    return "s3";
  }

  throw new InternalServerErrorException(`Unsupported MEDIA_STORAGE_BACKEND: ${configuredBackend}`);
}

export class FileMediaObjectStorage implements MediaObjectStorage {
  private getRootDir() {
    const configuredRoot = process.env.MEDIA_STORAGE_DIR?.trim();

    if (!configuredRoot) {
      throw new InternalServerErrorException("MEDIA_STORAGE_DIR is not configured.");
    }

    return path.resolve(configuredRoot);
  }

  async putObject(input: MediaObjectPutInput) {
    const rootDir = this.getRootDir();
    const absolutePath = this.resolveSafePath(rootDir, input.key);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.body);

    return {
      storageKey: input.key,
    };
  }

  async getObject(input: MediaObjectGetInput): Promise<MediaObjectData> {
    const rootDir = this.getRootDir();
    const absolutePath = this.resolveSafePath(rootDir, input.key);

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException("Attachment file not found.");
    }

    return {
      body: createReadStream(absolutePath),
      contentLength: (await stat(absolutePath)).size,
    };
  }

  private resolveSafePath(rootDir: string, storageKey: string) {
    const absolutePath = path.resolve(rootDir, storageKey);

    if (!absolutePath.startsWith(rootDir + path.sep) && absolutePath !== rootDir) {
      throw new NotFoundException("Attachment file not found.");
    }

    return absolutePath;
  }
}

export class S3MediaObjectStorage implements MediaObjectStorage {
  private readonly bucket = this.getRequiredEnv("S3_BUCKET");
  private readonly client = new S3Client({
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: this.getBooleanEnv("S3_FORCE_PATH_STYLE", false),
    region: process.env.S3_REGION?.trim() || "us-east-1",
    credentials: {
      accessKeyId: this.getRequiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: this.getRequiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });

  async putObject(input: MediaObjectPutInput) {
    await this.client.send(
      new PutObjectCommand({
        Body: input.body,
        Bucket: this.bucket,
        ContentType: input.contentType ?? undefined,
        Key: input.key,
      }),
    );

    return {
      storageKey: input.key,
    };
  }

  async getObject(input: MediaObjectGetInput): Promise<MediaObjectData> {
    const response = await this.getObjectFromS3(input.key);

    if (!response.Body) {
      throw new NotFoundException("Attachment file not found.");
    }

    return {
      body: this.toNodeReadable(response.Body),
      contentLength: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
    };
  }

  private async getObjectFromS3(key: string) {
    try {
      return await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.name === "NoSuchKey" || error.name === "NoSuchBucket" || error.$metadata.httpStatusCode === 404)
      ) {
        throw new NotFoundException("Attachment file not found.");
      }

      throw error;
    }
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

  private toNodeReadable(body: unknown): Readable {
    if (body instanceof Readable) {
      return body;
    }

    if (body && typeof body === "object" && "transformToByteArray" in body) {
      const transformToByteArray = (body as { transformToByteArray: () => Promise<Uint8Array> })
        .transformToByteArray;
      return Readable.from(this.toBufferIterable(transformToByteArray));
    }

    if (body && typeof body === "object" && "getReader" in body) {
      return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
    }

    throw new NotFoundException("Attachment file not found.");
  }

  private async *toBufferIterable(transformToByteArray: () => Promise<Uint8Array>) {
    yield Buffer.from(await transformToByteArray());
  }
}

export function createMediaObjectStorage(): MediaObjectStorage {
  return getConfiguredMediaStorageBackend() === "s3" ? new S3MediaObjectStorage() : new FileMediaObjectStorage();
}
