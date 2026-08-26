import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/core/db';
import { rawSessionEvents } from '@/core/db/schema';
import type { RawSessionEvent, SessionEventType } from '@/core/domain/model/rawSamples';
import { runInChunks } from './chunkedInsert';

function toRow(e: RawSessionEvent) {
  return {
    tripId: e.tripId,
    timestamp: e.timestamp.toISOString(),
    type: e.type,
    payload: e.payload ?? null,
  };
}

function toDomain(row: typeof rawSessionEvents.$inferSelect): RawSessionEvent {
  return {
    tripId: row.tripId,
    timestamp: new Date(row.timestamp),
    type: row.type as SessionEventType,
    payload: row.payload ?? undefined,
  };
}

export async function insert(event: RawSessionEvent): Promise<void> {
  await db.insert(rawSessionEvents).values(toRow(event));
}

export async function insertAll(events: RawSessionEvent[]): Promise<void> {
  if (events.length === 0) return;
  await runInChunks(events.map(toRow), (chunk) =>
    db.insert(rawSessionEvents).values(chunk),
  );
}

export async function getAllForTrip(tripId: string): Promise<RawSessionEvent[]> {
  const rows = await db
    .select()
    .from(rawSessionEvents)
    .where(eq(rawSessionEvents.tripId, tripId));
  return rows.map(toDomain);
}

const RECORDING_LIFECYCLE_TYPES: SessionEventType[] = [
  'RECORDING_STARTED',
  'RECORDING_STOPPED',
  'RECORDING_PAUSED',
  'RECORDING_RESUMED',
];

export async function getLatestRecordingLifecycleEvent(
  tripId: string,
): Promise<RawSessionEvent | null> {
  const rows = await db
    .select()
    .from(rawSessionEvents)
    .where(
      and(
        eq(rawSessionEvents.tripId, tripId),
        inArray(rawSessionEvents.type, RECORDING_LIFECYCLE_TYPES),
      ),
    )
    .orderBy(desc(rawSessionEvents.timestamp), desc(rawSessionEvents.id))
    .limit(1);
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(rawSessionEvents).where(eq(rawSessionEvents.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(rawSessionEvents);
}
