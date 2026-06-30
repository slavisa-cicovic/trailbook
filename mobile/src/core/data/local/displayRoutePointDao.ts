import { asc, eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { displayRoutePoints } from '@/core/db/schema';
import type { DisplayRoutePoint } from '@/core/domain/model/displayRoutePoint';
import { runInChunks } from './chunkedInsert';

function toRow(point: DisplayRoutePoint) {
  return {
    tripId: point.tripId,
    pointIndex: point.index,
    timestamp: point.timestamp.toISOString(),
    latitude: point.latitude,
    longitude: point.longitude,
    speedMps: point.speedMps ?? null,
  };
}

function toDomain(row: typeof displayRoutePoints.$inferSelect): DisplayRoutePoint {
  return {
    tripId: row.tripId,
    index: row.pointIndex,
    timestamp: new Date(row.timestamp),
    latitude: row.latitude,
    longitude: row.longitude,
    speedMps: row.speedMps ?? undefined,
  };
}

export async function replaceForTrip(
  tripId: string,
  points: DisplayRoutePoint[],
): Promise<void> {
  await db.delete(displayRoutePoints).where(eq(displayRoutePoints.tripId, tripId));
  if (points.length === 0) return;
  await runInChunks(points.map(toRow), (chunk) =>
    db.insert(displayRoutePoints).values(chunk),
  );
}

export async function getForTrip(tripId: string): Promise<DisplayRoutePoint[]> {
  const rows = await db
    .select()
    .from(displayRoutePoints)
    .where(eq(displayRoutePoints.tripId, tripId))
    .orderBy(asc(displayRoutePoints.pointIndex));
  return rows.map(toDomain);
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(displayRoutePoints).where(eq(displayRoutePoints.tripId, tripId));
}

export async function deleteAll(): Promise<void> {
  await db.delete(displayRoutePoints);
}
