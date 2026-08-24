import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/core/db';
import { rawLocationSamples } from '@/core/db/schema';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';
import { runInChunks } from './chunkedInsert';

function toRow(s: RawLocationSample) {
  return {
    tripId: s.tripId,
    timestamp: s.timestamp.toISOString(),
    latitude: s.latitude,
    longitude: s.longitude,
    accuracyM: s.accuracyM ?? null,
    altitudeM: s.altitudeM ?? null,
    speedMps: s.speedMps ?? null,
    bearingDeg: s.bearingDeg ?? null,
    provider: s.provider,
  };
}

function toDomain(row: typeof rawLocationSamples.$inferSelect): RawLocationSample {
  return {
    tripId: row.tripId,
    timestamp: new Date(row.timestamp),
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracyM ?? undefined,
    altitudeM: row.altitudeM ?? undefined,
    speedMps: row.speedMps ?? undefined,
    bearingDeg: row.bearingDeg ?? undefined,
    provider: row.provider,
  };
}

export async function insert(sample: RawLocationSample): Promise<void> {
  await db.insert(rawLocationSamples).values(toRow(sample)).onConflictDoNothing();
}

export async function insertAll(samples: RawLocationSample[]): Promise<void> {
  if (samples.length === 0) return;
  await runInChunks(samples.map(toRow), (chunk) =>
    db.insert(rawLocationSamples).values(chunk).onConflictDoNothing(),
  );
}

export async function getAllForTrip(tripId: string): Promise<RawLocationSample[]> {
  const rows = await db
    .select()
    .from(rawLocationSamples)
    .where(eq(rawLocationSamples.tripId, tripId));
  return rows.map(toDomain);
}

export async function getRecentForTrip(
  tripId: string,
  limit: number,
): Promise<RawLocationSample[]> {
  const rows = await db
    .select()
    .from(rawLocationSamples)
    .where(eq(rawLocationSamples.tripId, tripId))
    .orderBy(desc(rawLocationSamples.timestamp))
    .limit(limit);
  return rows.reverse().map(toDomain);
}

export async function getSummaryForTrip(tripId: string): Promise<{
  count: number;
  lastTimestamp: Date | null;
}> {
  const rows = await db
    .select({
      count: sql<number>`count(*)`,
      lastTimestamp: sql<string | null>`max(${rawLocationSamples.timestamp})`,
    })
    .from(rawLocationSamples)
    .where(eq(rawLocationSamples.tripId, tripId));
  const row = rows[0];

  return {
    count: Number(row?.count ?? 0),
    lastTimestamp: row?.lastTimestamp ? new Date(row.lastTimestamp) : null,
  };
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(rawLocationSamples).where(eq(rawLocationSamples.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(rawLocationSamples);
}
