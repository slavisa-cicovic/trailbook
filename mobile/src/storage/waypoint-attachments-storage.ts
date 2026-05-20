import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { WaypointAttachment } from "../domain/trips";
import { resolveStoredPhotoUri } from "../services/media/photo-storage.service";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

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
    localUri: resolveStoredPhotoUri(value.localUri),
    mimeType: value.mimeType ?? null,
    fileSize: value.fileSize ?? null,
    createdAt: value.createdAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.createdAt ?? fallbackDate,
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface WaypointAttachmentRow {
  created_at: string;
  deleted_at: string | null;
  device_id: string;
  file_size: number | null;
  local_id: string;
  local_uri: string;
  mime_type: string | null;
  server_id: string | null;
  sync_status: WaypointAttachment["syncStatus"];
  type: WaypointAttachment["type"];
  updated_at: string;
  user_id: string;
  waypoint_local_id: string;
}

function toWaypointAttachmentRow(attachment: WaypointAttachment): WaypointAttachmentRow {
  return {
    created_at: attachment.createdAt,
    deleted_at: attachment.deletedAt,
    device_id: attachment.deviceId,
    file_size: attachment.fileSize,
    local_id: attachment.localId,
    local_uri: attachment.localUri,
    mime_type: attachment.mimeType,
    server_id: attachment.serverId,
    sync_status: attachment.syncStatus,
    type: attachment.type,
    updated_at: attachment.updatedAt,
    user_id: attachment.userId,
    waypoint_local_id: attachment.waypointLocalId,
  };
}

function toWaypointAttachmentFromRow(row: WaypointAttachmentRow): WaypointAttachment {
  return normalizeWaypointAttachment({
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    deviceId: row.device_id,
    fileSize: row.file_size,
    localId: row.local_id,
    localUri: row.local_uri,
    mimeType: row.mime_type,
    serverId: row.server_id,
    syncStatus: row.sync_status,
    type: row.type,
    updatedAt: row.updated_at,
    userId: row.user_id,
    waypointLocalId: row.waypoint_local_id,
  });
}

async function loadLegacyWaypointAttachmentsFromAsyncStorage(): Promise<WaypointAttachment[]> {
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

async function ensureWaypointAttachmentsMigrated(): Promise<void> {
  const database = await getDatabase();
  const countRow = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM waypoint_attachments",
  );

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyAttachments = await loadLegacyWaypointAttachmentsFromAsyncStorage();

  if (legacyAttachments.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const attachment of legacyAttachments) {
      const row = toWaypointAttachmentRow(attachment);
      await database.runAsync(
        `INSERT OR REPLACE INTO waypoint_attachments (
          local_id,
          server_id,
          waypoint_local_id,
          device_id,
          user_id,
          type,
          local_uri,
          mime_type,
          file_size,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.waypoint_local_id,
        row.device_id,
        row.user_id,
        row.type,
        row.local_uri,
        row.mime_type,
        row.file_size,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}

export async function loadWaypointAttachments(): Promise<WaypointAttachment[]> {
  await ensureWaypointAttachmentsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<WaypointAttachmentRow>(
    "SELECT * FROM waypoint_attachments ORDER BY created_at ASC, local_id ASC",
  );

  return rows.map(toWaypointAttachmentFromRow);
}

export async function saveWaypointAttachments(attachments: WaypointAttachment[]): Promise<void> {
  await ensureWaypointAttachmentsMigrated();

  const database = await getDatabase();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM waypoint_attachments");

    for (const attachment of attachments) {
      const row = toWaypointAttachmentRow(attachment);
      await database.runAsync(
        `INSERT INTO waypoint_attachments (
          local_id,
          server_id,
          waypoint_local_id,
          device_id,
          user_id,
          type,
          local_uri,
          mime_type,
          file_size,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.waypoint_local_id,
        row.device_id,
        row.user_id,
        row.type,
        row.local_uri,
        row.mime_type,
        row.file_size,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}
