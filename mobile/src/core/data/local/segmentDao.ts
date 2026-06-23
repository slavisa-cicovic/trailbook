import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { segments } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { Segment, SegmentType } from '@/core/domain/model/segment';

function toRow(s: Segment) {
  return {
    tripId: s.tripId,
    segmentIndex: s.index,
    segmentType: s.segmentType,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt.toISOString(),
    distanceM: s.distanceM,
  };
}

function toDomain(row: typeof segments.$inferSelect): Segment {
  return {
    tripId: row.tripId,
    index: row.segmentIndex,
    segmentType: row.segmentType as SegmentType,
    startedAt: new Date(row.startedAt),
    endedAt: new Date(row.endedAt),
    distanceM: row.distanceM,
  };
}

export async function insertAll(segs: Segment[]): Promise<void> {
  if (segs.length === 0) return;
  await db.insert(segments).values(segs.map(toRow));
  dbEvents.emit('segments:changed');
}

export async function getForTrip(tripId: string): Promise<Segment[]> {
  const rows = await db.select().from(segments).where(eq(segments.tripId, tripId));
  return rows.map(toDomain);
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(segments).where(eq(segments.tripId, tripId));
  dbEvents.emit('segments:changed');
}

export async function deleteAll(): Promise<void> {
  await db.delete(segments);
  dbEvents.emit('segments:changed');
}
