import { Injectable } from "@nestjs/common";
import path from "node:path";

import { createMediaObjectStorage } from "./media-object-storage";

@Injectable()
export class MediaStorageService {
  private readonly objectStorage = createMediaObjectStorage();

  async storeTripAttachment(input: {
    attachmentId: string;
    mimeType?: string | null;
    originalFilename?: string | null;
    tripId: string;
    fileBuffer: Buffer;
  }) {
    const originalExtension = input.originalFilename ? path.extname(input.originalFilename) : "";
    const mimeExtension = this.getExtensionFromMimeType(input.mimeType);
    const extension = originalExtension || mimeExtension;
    const storageKey = path.posix.join("trip-attachments", input.tripId, `${input.attachmentId}${extension}`);

    return this.objectStorage.putObject({
      body: input.fileBuffer,
      contentType: input.mimeType,
      key: storageKey,
    });
  }

  async getTripAttachment(storageKey: string) {
    return this.objectStorage.getObject({ key: storageKey });
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
