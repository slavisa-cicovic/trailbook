import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { rawActivitySamples } from '@/core/db/schema';
import type { RawActivitySample } from '@/core/domain/model/rawSamples';

function toRow(s: RawActivitySample) {
  return {
    tripId: s.tripId,
    timestamp: s.timestamp.toISOString(),
    results: s.results,
  };
}

function toDomain(row: typeof rawActivitySamples.$inferSelect): RawActivitySample {
  return {
    tripId: row.tripId,
    timestamp: new Date(row.timestamp),
    results: row.results as RawActivitySample['results'],
  };
}

export async function insert(sample: RawActivitySample): Promise<void> {
  await db.insert(rawActivitySamples).values(toRow(sample));
}

export async function insertAll(samples: RawActivitySample[]): Promise<void> {
  if (samples.length === 0) return;
  await db.insert(rawActivitySamples).values(samples.map(toRow));
}

export async function getAllForTrip(tripId: string): Promise<RawActivitySample[]> {
  const rows = await db
    .select()
    .from(rawActivitySamples)
    .where(eq(rawActivitySamples.tripId, tripId));
  return rows.map(toDomain);
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(rawActivitySamples).where(eq(rawActivitySamples.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(rawActivitySamples);
}
