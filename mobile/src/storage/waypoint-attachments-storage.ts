import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc, eq } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { WaypointAttachment } from "../domain/trips";
import { resolveStoredPhotoUri } from "../services/media/photo-storage.service";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { waypointAttachments as waypointAttachmentsTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";

type WaypointAttachmentRow = typeof waypointAttachmentsTable.$inferSelect;
type WaypointAttachmentInsert = typeof waypointAttachmentsTable.$inferInsert;

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

function toWaypointAttachmentRow(attachment: WaypointAttachment): WaypointAttachmentInsert {
  return {
    createdAt: attachment.createdAt,
    deletedAt: attachment.deletedAt,
    deviceId: attachment.deviceId,
    fileSize: attachment.fileSize,
    localId: attachment.localId,
    localUri: attachment.localUri,
    mimeType: attachment.mimeType,
    serverId: attachment.serverId,
    syncStatus: attachment.syncStatus,
    type: attachment.type,
    updatedAt: attachment.updatedAt,
    userId: attachment.userId,
    waypointLocalId: attachment.waypointLocalId,
  };
}

function toWaypointAttachmentFromRow(row: WaypointAttachmentRow): WaypointAttachment {
  return normalizeWaypointAttachment({
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    deviceId: row.deviceId,
    fileSize: row.fileSize,
    localId: row.localId,
    localUri: row.localUri,
    mimeType: row.mimeType,
    serverId: row.serverId,
    syncStatus: row.syncStatus as WaypointAttachment["syncStatus"],
    type: row.type as WaypointAttachment["type"],
    updatedAt: row.updatedAt,
    userId: row.userId,
    waypointLocalId: row.waypointLocalId,
  });
}

function toWaypointAttachmentUpdate(
  row: WaypointAttachmentInsert,
): Omit<WaypointAttachmentInsert, "localId"> {
  const { localId: _localId, ...update } = row;
  return update;
}

async function loadLegacyWaypointAttachmentsFromAsyncStorage(): Promise<WaypointAttachment[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.waypointAttachments);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as (Partial<WaypointAttachment> &
        Pick<WaypointAttachment, "localId" | "waypointLocalId" | "deviceId" | "userId" | "localUri">)[]
  ).map(normalizeWaypointAttachment);
}

async function ensureWaypointAttachmentsMigrated(): Promise<void> {
  await migrateOnce("async-storage/waypoint-attachments", async () => {
    const database = await getDrizzleDatabase();
    const existingRows = await database
      .select({ localId: waypointAttachmentsTable.localId })
      .from(waypointAttachmentsTable)
      .limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyAttachments = await loadLegacyWaypointAttachmentsFromAsyncStorage();

    if (legacyAttachments.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(waypointAttachmentsTable).values(legacyAttachments.map(toWaypointAttachmentRow));
    });
  });
}

export async function loadWaypointAttachments(): Promise<WaypointAttachment[]> {
  await ensureWaypointAttachmentsMigrated();

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(waypointAttachmentsTable)
    .orderBy(asc(waypointAttachmentsTable.createdAt), asc(waypointAttachmentsTable.localId));

  return rows.map(toWaypointAttachmentFromRow);
}

function areWaypointAttachmentsEqual(left: WaypointAttachment, right: WaypointAttachment): boolean {
  return (
    left.localId === right.localId &&
    left.serverId === right.serverId &&
    left.waypointLocalId === right.waypointLocalId &&
    left.deviceId === right.deviceId &&
    left.userId === right.userId &&
    left.type === right.type &&
    left.localUri === right.localUri &&
    left.mimeType === right.mimeType &&
    left.fileSize === right.fileSize &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.deletedAt === right.deletedAt &&
    left.syncStatus === right.syncStatus
  );
}

export async function saveWaypointAttachments(
  attachments: WaypointAttachment[],
  previousAttachments?: WaypointAttachment[],
): Promise<void> {
  await ensureWaypointAttachmentsMigrated();

  if (!previousAttachments) {
    await runExclusiveDrizzleWrite(async (database) => {
      await database.delete(waypointAttachmentsTable);

      if (attachments.length > 0) {
        await database.insert(waypointAttachmentsTable).values(attachments.map(toWaypointAttachmentRow));
      }
    });

    return;
  }

  const previousAttachmentsById = new Map(
    previousAttachments.map((attachment) => [attachment.localId, attachment]),
  );
  const nextAttachmentsById = new Map(attachments.map((attachment) => [attachment.localId, attachment]));
  const removedAttachments = previousAttachments.filter(
    (attachment) => !nextAttachmentsById.has(attachment.localId),
  );
  const upsertAttachments = attachments.filter((attachment) => {
    const previousAttachment = previousAttachmentsById.get(attachment.localId);
    return !previousAttachment || !areWaypointAttachmentsEqual(previousAttachment, attachment);
  });

  if (removedAttachments.length === 0 && upsertAttachments.length === 0) {
    return;
  }

  await runExclusiveDrizzleWrite(async (database) => {
    for (const attachment of removedAttachments) {
      await database.delete(waypointAttachmentsTable).where(eq(waypointAttachmentsTable.localId, attachment.localId));
    }

    for (const attachment of upsertAttachments) {
      const row = toWaypointAttachmentRow(attachment);
      await database
        .insert(waypointAttachmentsTable)
        .values(row)
        .onConflictDoUpdate({
          target: waypointAttachmentsTable.localId,
          set: toWaypointAttachmentUpdate(row),
        });
    }
  });
}
