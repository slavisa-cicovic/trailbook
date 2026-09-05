import { eq, ne, inArray } from 'drizzle-orm';
import { db } from '@/core/db';
import { waypointImages, waypoints } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { WaypointImage, ImageSource, ImageUploadState } from '@/core/domain/model/waypoint';
import { runInChunks } from './chunkedInsert';

function toRow(img: WaypointImage) {
  return {
    id: img.id,
    waypointId: img.waypointId,
    source: img.source,
    localUri: img.localUri,
    capturedAt: img.capturedAt?.toISOString() ?? null,
    photoLatitude: img.photoLatitude,
    photoLongitude: img.photoLongitude,
    locationMatchesWaypoint: img.locationMatchesWaypoint,
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
    photoLatitude: row.photoLatitude,
    photoLongitude: row.photoLongitude,
    locationMatchesWaypoint: row.locationMatchesWaypoint,
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
  await runInChunks(waypointIds, (chunk) =>
    db.delete(waypointImages).where(inArray(waypointImages.waypointId, chunk)),
  );
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
  let count = 0;
  await runInChunks(waypointIds, async (chunk) => {
    const rows = await db
      .select({ id: waypointImages.id })
      .from(waypointImages)
      .where(inArray(waypointImages.waypointId, chunk));
    count += rows.length;
  });
  return count;
}

export async function countForTrip(clientTripId: string): Promise<number> {
  const tripWaypoints = await db
    .select({ id: waypoints.id })
    .from(waypoints)
    .where(eq(waypoints.tripId, clientTripId));
  return countForWaypoints(tripWaypoints.map((waypoint) => waypoint.id));
}

export async function countNotUploadedForWaypoints(waypointIds: string[]): Promise<number> {
  if (waypointIds.length === 0) return 0;
  let count = 0;
  await runInChunks(waypointIds, async (chunk) => {
    const rows = await db
      .select({ uploadState: waypointImages.uploadState })
      .from(waypointImages)
      .where(inArray(waypointImages.waypointId, chunk));
    count += rows.filter((row) => row.uploadState !== 'UPLOADED').length;
  });
  return count;
}

export async function getNotUploadedForTrip(waypointIds: string[]): Promise<WaypointImage[]> {
  if (waypointIds.length === 0) return [];
  const rows: Array<typeof waypointImages.$inferSelect> = [];
  await runInChunks(waypointIds, async (chunk) => {
    rows.push(
      ...(await db
        .select()
        .from(waypointImages)
        .where(
          inArray(waypointImages.waypointId, chunk),
        )),
    );
  });
  return rows.filter((r) => r.uploadState !== 'UPLOADED').map(toDomain);
}
