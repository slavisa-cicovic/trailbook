import { Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

@Injectable()
export class MediaStorageService {
  private getRootDir() {
    const configuredRoot = process.env.MEDIA_STORAGE_DIR?.trim();

    if (!configuredRoot) {
      throw new InternalServerErrorException("MEDIA_STORAGE_DIR is not configured.");
    }

    return path.resolve(configuredRoot);
  }

  async storeTripAttachment(input: {
    attachmentId: string;
    mimeType?: string | null;
    originalFilename?: string | null;
    tripId: string;
    fileBuffer: Buffer;
  }) {
    const rootDir = this.getRootDir();
    const tripDir = path.join(rootDir, "trip-attachments", input.tripId);
    const originalExtension = input.originalFilename ? path.extname(input.originalFilename) : "";
    const mimeExtension = this.getExtensionFromMimeType(input.mimeType);
    const extension = originalExtension || mimeExtension;
    const relativePath = path.join("trip-attachments", input.tripId, `${input.attachmentId}${extension}`);
    const absolutePath = path.join(rootDir, relativePath);

    await mkdir(tripDir, { recursive: true });
    await writeFile(absolutePath, input.fileBuffer);

    return {
      storageKey: relativePath,
    };
  }

  async resolveStoragePath(storageKey: string) {
    const rootDir = this.getRootDir();
    const absolutePath = path.resolve(rootDir, storageKey);

    if (!absolutePath.startsWith(rootDir)) {
      throw new NotFoundException("Attachment file not found.");
    }

    try {
      await access(absolutePath);
    } catch {
      throw new NotFoundException("Attachment file not found.");
    }

    return absolutePath;
  }

  private getExtensionFromMimeType(mimeType?: string | null) {
    switch (mimeType) {
      case "image/jpeg":
        return ".jpg";
      case "image/png":
        return ".png";
      case "image/webp":
        return ".webp";
      case "image/heic":
      case "image/heif":
        return ".heic";
      default:
        return "";
    }
  }
}
