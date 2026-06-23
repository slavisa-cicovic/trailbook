import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { rawLocationSamples } from '@/core/db/schema';
import type { RawLocationSample } from '@/core/domain/model/rawSamples';

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
  await db.insert(rawLocationSamples).values(toRow(sample));
}

export async function insertAll(samples: RawLocationSample[]): Promise<void> {
  if (samples.length === 0) return;
  await db.insert(rawLocationSamples).values(samples.map(toRow));
}

export async function getAllForTrip(tripId: string): Promise<RawLocationSample[]> {
  const rows = await db
    .select()
    .from(rawLocationSamples)
    .where(eq(rawLocationSamples.tripId, tripId));
  return rows.map(toDomain);
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(rawLocationSamples).where(eq(rawLocationSamples.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(rawLocationSamples);
}
