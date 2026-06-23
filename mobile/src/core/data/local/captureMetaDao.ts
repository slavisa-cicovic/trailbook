import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { captureMeta } from '@/core/db/schema';
import type { CaptureMeta } from '@/core/domain/model/tripBundle';

function toDomain(row: typeof captureMeta.$inferSelect): CaptureMeta {
  return {
    tripId: row.tripId,
    captureSchemaVersion: row.captureSchemaVersion,
    appVersion: row.appVersion,
    osApiLevel: row.osApiLevel,
    deviceModel: row.deviceModel,
    captureTimeZone: row.captureTimeZone,
  };
}

export async function insert(meta: CaptureMeta): Promise<void> {
  await db.insert(captureMeta).values(meta);
}

export async function getForTrip(tripId: string): Promise<CaptureMeta | null> {
  const rows = await db.select().from(captureMeta).where(eq(captureMeta.tripId, tripId));
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(captureMeta).where(eq(captureMeta.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(captureMeta);
}
