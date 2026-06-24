import { eq, ne, inArray } from 'drizzle-orm';
import { db } from '@/core/db';
import { waypointImages } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { WaypointImage, ImageSource, ImageUploadState } from '@/core/domain/model/waypoint';

function toRow(img: WaypointImage) {
  return {
    id: img.id,
    waypointId: img.waypointId,
    source: img.source,
    localUri: img.localUri,
    capturedAt: img.capturedAt?.toISOString() ?? null,
    objectKey: img.objectKey,
    uploadState: img.uploadState,
  };
}

function toDomain(row: typeof waypointImages.$inferSelect): WaypointImage {
  return {
    id: row.id,
    waypointId: row.waypointId,
    source: row.source as ImageSource,
    localUri: row.localUri,
    capturedAt: row.capturedAt ? new Date(row.capturedAt) : null,
    objectKey: row.objectKey,
    uploadState: row.uploadState as ImageUploadState,
  };
}

export async function insert(img: WaypointImage): Promise<void> {
  await db.insert(waypointImages).values(toRow(img));
  dbEvents.emit('waypointImages:changed');
}

export async function getForWaypoint(waypointId: string): Promise<WaypointImage[]> {
  const rows = await db
    .select()
    .from(waypointImages)
    .where(eq(waypointImages.waypointId, waypointId));
  return rows.map(toDomain);
}

export async function deleteAllForTrip(waypointIds: string[]): Promise<void> {
  if (waypointIds.length === 0) return;
  await db.delete(waypointImages).where(inArray(waypointImages.waypointId, waypointIds));
  dbEvents.emit('waypointImages:changed');
}

export async function deleteById(id: string): Promise<void> {
  await db.delete(waypointImages).where(eq(waypointImages.id, id));
  dbEvents.emit('waypointImages:changed');
}

export async function deleteAll(): Promise<void> {
  await db.delete(waypointImages);
  dbEvents.emit('waypointImages:changed');
}

export async function updateUploadState(
  id: string,
  state: ImageUploadState,
  objectKey?: string,
): Promise<void> {
  await db
    .update(waypointImages)
    .set({ uploadState: state, ...(objectKey !== undefined ? { objectKey } : {}) })
    .where(eq(waypointImages.id, id));
  dbEvents.emit('waypointImages:changed');
}

export async function countNotUploaded(): Promise<number> {
  const rows = await db
    .select({ id: waypointImages.id })
    .from(waypointImages)
    .where(ne(waypointImages.uploadState, 'UPLOADED'));
  return rows.length;
}

export async function countForWaypoints(waypointIds: string[]): Promise<number> {
  if (waypointIds.length === 0) return 0;
  const rows = await db
    .select({ id: waypointImages.id })
    .from(waypointImages)
    .where(inArray(waypointImages.waypointId, waypointIds));
  return rows.length;
}

export async function countNotUploadedForWaypoints(waypointIds: string[]): Promise<number> {
  if (waypointIds.length === 0) return 0;
  const rows = await db
    .select({ uploadState: waypointImages.uploadState })
    .from(waypointImages)
    .where(inArray(waypointImages.waypointId, waypointIds));
  return rows.filter((row) => row.uploadState !== 'UPLOADED').length;
}

export async function getNotUploadedForTrip(waypointIds: string[]): Promise<WaypointImage[]> {
  if (waypointIds.length === 0) return [];
  const rows = await db
    .select()
    .from(waypointImages)
    .where(
      inArray(waypointImages.waypointId, waypointIds),
    );
  return rows.filter((r) => r.uploadState !== 'UPLOADED').map(toDomain);
}
