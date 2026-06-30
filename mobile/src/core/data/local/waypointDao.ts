import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { waypoints } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { Waypoint, WaypointCategory } from '@/core/domain/model/waypoint';
import { runInChunks } from './chunkedInsert';

function toRow(w: Waypoint) {
  return {
    id: w.id,
    tripId: w.tripId,
    title: w.title,
    description: w.description,
    category: w.category,
    latitude: w.latitude,
    longitude: w.longitude,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

function toDomain(row: typeof waypoints.$inferSelect): Waypoint {
  return {
    id: row.id,
    tripId: row.tripId,
    title: row.title,
    description: row.description,
    category: row.category as WaypointCategory,
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export async function insertWaypoint(w: Waypoint): Promise<void> {
  await db.insert(waypoints).values(toRow(w));
  dbEvents.emit('waypoints:changed');
}

export async function insertAll(ws: Waypoint[]): Promise<void> {
  if (ws.length === 0) return;
  await runInChunks(ws.map(toRow), (chunk) => db.insert(waypoints).values(chunk));
  dbEvents.emit('waypoints:changed');
}

export async function updateWaypoint(w: Waypoint): Promise<void> {
  await db
    .update(waypoints)
    .set({
      title: w.title,
      description: w.description,
      category: w.category,
      updatedAt: w.updatedAt.toISOString(),
    })
    .where(eq(waypoints.id, w.id));
  dbEvents.emit('waypoints:changed');
}

export async function deleteWaypoint(id: string): Promise<void> {
  await db.delete(waypoints).where(eq(waypoints.id, id));
  dbEvents.emit('waypoints:changed');
}

export async function deleteForTrip(tripId: string): Promise<void> {
  await db.delete(waypoints).where(eq(waypoints.tripId, tripId));
  dbEvents.emit('waypoints:changed');
}

export async function getForTrip(tripId: string): Promise<Waypoint[]> {
  const rows = await db.select().from(waypoints).where(eq(waypoints.tripId, tripId));
  return rows.map(toDomain);
}

export async function deleteAll(): Promise<void> {
  await db.delete(waypoints);
  dbEvents.emit('waypoints:changed');
}

export async function countForTrip(tripId: string): Promise<number> {
  const rows = await db.select({ id: waypoints.id }).from(waypoints).where(eq(waypoints.tripId, tripId));
  return rows.length;
}

export async function getById(id: string): Promise<Waypoint | null> {
  const rows = await db.select().from(waypoints).where(eq(waypoints.id, id));
  return rows[0] ? toDomain(rows[0]) : null;
}
