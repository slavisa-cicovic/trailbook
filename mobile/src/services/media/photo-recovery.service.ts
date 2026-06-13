import * as FileSystem from "expo-file-system/legacy";

import type { OwnedServerTripDetail } from "../../domain/server-trips";
import type { WaypointAttachment } from "../../domain/trips";
import {
  getSessionStateSnapshot,
  refreshActiveIdentitySessionIfPossible,
} from "../../state/session-store";
import {
  buildTripAttachmentContentUrl,
  getOwnedTripFromServer,
} from "../trips/server-trip-sharing.service";
import { downloadPhotoToLocalStorage } from "./photo-picker.service";
import { resolveStoredPhotoUri } from "./photo-storage.service";

interface RepairMissingWaypointPhotosInput {
  allAttachments: WaypointAttachment[];
  attachments: WaypointAttachment[];
  sessionToken: string | null;
  tripServerId: string | null;
}

interface RepairMissingWaypointPhotosResult {
  allAttachments: WaypointAttachment[];
  attachments: WaypointAttachment[];
  repairedCount: number;
}

const MIN_VALID_PHOTO_FILE_SIZE_BYTES = 512;

async function localFileExists(uri: string): Promise<boolean> {
  if (!uri.startsWith("file://")) {
    return false;
  }

  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const valid =
      fileInfo.exists &&
      !fileInfo.isDirectory &&
      fileInfo.size > MIN_VALID_PHOTO_FILE_SIZE_BYTES;

    if (fileInfo.exists && !fileInfo.isDirectory && !valid) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }

    return valid;
  } catch {
    return false;
  }
}

function canUseExistingPhotoUri(attachment: WaypointAttachment, resolvedLocalUri: string): boolean {
  if (resolvedLocalUri.startsWith("file://")) {
    return false;
  }

  // For owned, synced attachments prefer a fresh local copy. Old iOS photo-library
  // URIs and tokenized URLs are not stable across app reinstalls/upgrades.
  return !attachment.serverId;
}

async function loadServerAttachmentsByLocalId(
  sessionToken: string,
  tripServerId: string,
): Promise<Map<string, OwnedServerTripDetail["attachments"][number]>> {
  const response = await getOwnedTripFromServer(sessionToken, tripServerId);
  return new Map(response.trip.attachments.map((attachment) => [attachment.localId, attachment]));
}

function getCurrentSessionToken(fallbackToken: string): string {
  const identitySession = getSessionStateSnapshot().identitySession;

  if (identitySession?.mode === "authenticated" && identitySession.sessionToken) {
    return identitySession.sessionToken;
  }

  return fallbackToken;
}

async function downloadServerPhoto(input: {
  attachmentId: string;
  mimeType: string | null;
  sessionToken: string;
}) {
  const sessionToken = getCurrentSessionToken(input.sessionToken);

  try {
    return await downloadPhotoToLocalStorage({
      fileNameSeed: `server-${input.attachmentId}`,
      mimeType: input.mimeType,
      sourceUrl: buildTripAttachmentContentUrl(sessionToken, input.attachmentId),
    });
  } catch (error) {
    const refreshedSession = await refreshActiveIdentitySessionIfPossible();
    const refreshedToken = refreshedSession?.sessionToken ?? getCurrentSessionToken(input.sessionToken);

    if (!refreshedToken || refreshedToken === sessionToken) {
      throw error;
    }

    return downloadPhotoToLocalStorage({
      fileNameSeed: `server-${input.attachmentId}`,
      mimeType: input.mimeType,
      sourceUrl: buildTripAttachmentContentUrl(refreshedToken, input.attachmentId),
    });
  }
}

export async function repairMissingWaypointPhotos(
  input: RepairMissingWaypointPhotosInput,
): Promise<RepairMissingWaypointPhotosResult> {
  const updatesByAttachmentId = new Map<string, WaypointAttachment>();
  let serverAttachmentsByLocalIdPromise:
    | Promise<Map<string, OwnedServerTripDetail["attachments"][number]>>
    | null = null;

  for (const attachment of input.attachments) {
    if (attachment.deletedAt !== null) {
      continue;
    }

    const resolvedLocalUri = resolveStoredPhotoUri(attachment.localUri);

    if ((await localFileExists(resolvedLocalUri)) || canUseExistingPhotoUri(attachment, resolvedLocalUri)) {
      if (resolvedLocalUri !== attachment.localUri) {
        updatesByAttachmentId.set(attachment.localId, {
          ...attachment,
          localUri: resolvedLocalUri,
        });
      }

      continue;
    }

    if (!input.sessionToken) {
      continue;
    }

    let serverAttachmentId = attachment.serverId;
    let serverMimeType = attachment.mimeType;
    let serverFileSize = attachment.fileSize;

    if (!serverAttachmentId && input.tripServerId) {
      try {
        serverAttachmentsByLocalIdPromise ??= loadServerAttachmentsByLocalId(
          input.sessionToken,
          input.tripServerId,
        );

        const serverAttachment = (await serverAttachmentsByLocalIdPromise).get(attachment.localId);

        if (serverAttachment) {
          serverAttachmentId = serverAttachment.id;
          serverMimeType = serverAttachment.mimeType ?? attachment.mimeType;
          serverFileSize = serverAttachment.fileSizeBytes ?? attachment.fileSize;
        }
      } catch (error) {
        console.warn("[Trailbook][photo-recovery] Failed to load server attachment metadata", {
          attachmentLocalId: attachment.localId,
          error,
          tripServerId: input.tripServerId,
        });
      }
    }

    if (!serverAttachmentId) {
      console.warn("[Trailbook][photo-recovery] Cannot restore waypoint photo without server attachment id", {
        attachmentLocalId: attachment.localId,
      });
      continue;
    }

    try {
      const downloadedPhoto = await downloadServerPhoto({
        attachmentId: serverAttachmentId,
        mimeType: serverMimeType,
        sessionToken: input.sessionToken,
      });

      updatesByAttachmentId.set(attachment.localId, {
        ...attachment,
        serverId: serverAttachmentId,
        localUri: downloadedPhoto.localUri,
        fileSize: downloadedPhoto.fileSize ?? serverFileSize,
        mimeType: downloadedPhoto.mimeType ?? serverMimeType,
        syncStatus: "synced",
      });
    } catch (error) {
      console.warn("[Trailbook][photo-recovery] Failed to restore waypoint photo", {
        attachmentLocalId: attachment.localId,
        error,
      });
    }
  }

  if (updatesByAttachmentId.size === 0) {
    return {
      allAttachments: input.allAttachments,
      attachments: input.attachments,
      repairedCount: 0,
    };
  }

  return {
    allAttachments: input.allAttachments.map(
      (attachment) => updatesByAttachmentId.get(attachment.localId) ?? attachment,
    ),
    attachments: input.attachments.map(
      (attachment) => updatesByAttachmentId.get(attachment.localId) ?? attachment,
    ),
    repairedCount: updatesByAttachmentId.size,
  };
}
