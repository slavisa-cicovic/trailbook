import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { rawDeviceSamples } from '@/core/db/schema';
import type { RawDeviceSample } from '@/core/domain/model/rawSamples';
import { runInChunks } from './chunkedInsert';

function toRow(s: RawDeviceSample) {
  return {
    tripId: s.tripId,
    timestamp: s.timestamp.toISOString(),
    batteryPct: s.batteryPct,
    isCharging: s.isCharging,
    powerSaveMode: s.powerSaveMode,
    gpsEnabled: s.gpsEnabled,
  };
}

function toDomain(row: typeof rawDeviceSamples.$inferSelect): RawDeviceSample {
  return {
    tripId: row.tripId,
    timestamp: new Date(row.timestamp),
    batteryPct: row.batteryPct,
    isCharging: row.isCharging,
    powerSaveMode: row.powerSaveMode,
    gpsEnabled: row.gpsEnabled,
  };
}

export async function insert(sample: RawDeviceSample): Promise<void> {
  await db.insert(rawDeviceSamples).values(toRow(sample));
}

export async function insertAll(samples: RawDeviceSample[]): Promise<void> {
  if (samples.length === 0) return;
  await runInChunks(samples.map(toRow), (chunk) =>
    db.insert(rawDeviceSamples).values(chunk),
  );
}

export async function getAllForTrip(tripId: string): Promise<RawDeviceSample[]> {
  const rows = await db.select().from(rawDeviceSamples).where(eq(rawDeviceSamples.tripId, tripId));
  return rows.map(toDomain);
}

export async function getBoundaryForTrip(tripId: string): Promise<RawDeviceSample[]> {
  const [firstRows, lastRows] = await Promise.all([
    db
      .select()
      .from(rawDeviceSamples)
      .where(eq(rawDeviceSamples.tripId, tripId))
      .orderBy(asc(rawDeviceSamples.timestamp))
      .limit(1),
    db
      .select()
      .from(rawDeviceSamples)
      .where(eq(rawDeviceSamples.tripId, tripId))
      .orderBy(desc(rawDeviceSamples.timestamp))
      .limit(1),
  ]);
  const first = firstRows[0] ? toDomain(firstRows[0]) : null;
  const last = lastRows[0] ? toDomain(lastRows[0]) : null;
  if (!first) return [];
  if (!last || first.timestamp.getTime() === last.timestamp.getTime()) return [first];
  return [first, last];
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(rawDeviceSamples).where(eq(rawDeviceSamples.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(rawDeviceSamples);
}
