import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { reprocessingSnapshots } from '@/core/db/schema';
import type { ReprocessingSnapshot } from '@/core/domain/model/reprocessingSnapshot';
import type { Segment, SegmentType } from '@/core/domain/model/segment';

interface StoredSnapshot {
  processingVersion: number;
  segments: Array<{
    tripId: string;
    index: number;
    segmentType: SegmentType;
    startedAt: string;
    endedAt: string;
    distanceM: number | null;
  }>;
}

function serialize(snapshot: ReprocessingSnapshot): string {
  const stored: StoredSnapshot = {
    processingVersion: snapshot.processingVersion,
    segments: snapshot.segments.map((segment) => ({
      ...segment,
      startedAt: segment.startedAt.toISOString(),
      endedAt: segment.endedAt.toISOString(),
    })),
  };
  return JSON.stringify(stored);
}

function deserialize(
  tripId: string,
  snapshotJson: string,
  createdAt: string,
): ReprocessingSnapshot {
  const stored = JSON.parse(snapshotJson) as StoredSnapshot;
  const segments: Segment[] = stored.segments.map((segment) => ({
    ...segment,
    startedAt: new Date(segment.startedAt),
    endedAt: new Date(segment.endedAt),
  }));

  return {
    tripId,
    processingVersion: stored.processingVersion,
    segments,
    createdAt: new Date(createdAt),
  };
}

export async function insert(snapshot: ReprocessingSnapshot): Promise<void> {
  await db.insert(reprocessingSnapshots).values({
    tripId: snapshot.tripId,
    snapshotJson: serialize(snapshot),
    createdAt: snapshot.createdAt.toISOString(),
  });
}

export async function getForTrip(tripId: string): Promise<ReprocessingSnapshot | null> {
  const rows = await db
    .select()
    .from(reprocessingSnapshots)
    .where(eq(reprocessingSnapshots.tripId, tripId));
  const row = rows[0];
  return row ? deserialize(row.tripId, row.snapshotJson, row.createdAt) : null;
}

export async function existsForTrip(tripId: string): Promise<boolean> {
  const rows = await db
    .select({ tripId: reprocessingSnapshots.tripId })
    .from(reprocessingSnapshots)
    .where(eq(reprocessingSnapshots.tripId, tripId));
  return rows.length > 0;
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(reprocessingSnapshots).where(eq(reprocessingSnapshots.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(reprocessingSnapshots);
}
