import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { WaypointAttachment } from "../domain/trips";

function normalizeWaypointAttachment(
  value: Partial<WaypointAttachment> &
    Pick<WaypointAttachment, "localId" | "waypointLocalId" | "deviceId" | "userId" | "localUri">,
): WaypointAttachment {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    waypointLocalId: value.waypointLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    type: value.type ?? "photo",
    localUri: value.localUri,
    mimeType: value.mimeType ?? null,
    fileSize: value.fileSize ?? null,
    createdAt: value.createdAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.createdAt ?? fallbackDate,
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

export async function loadWaypointAttachments(): Promise<WaypointAttachment[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.waypointAttachments);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<WaypointAttachment> &
        Pick<WaypointAttachment, "localId" | "waypointLocalId" | "deviceId" | "userId" | "localUri">
    >
  ).map(normalizeWaypointAttachment);
}

export async function saveWaypointAttachments(
  attachments: WaypointAttachment[],
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.waypointAttachments, JSON.stringify(attachments));
}
