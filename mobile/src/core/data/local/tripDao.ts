import { eq, ne, and } from 'drizzle-orm';
import { db } from '@/core/db';
import { trips } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { Trip, TripStatus, SyncState } from '@/core/domain/model/trip';

type NewTrip = Omit<Trip, 'id'>;

function toRow(t: NewTrip) {
  return {
    clientTripId: t.clientTripId,
    title: t.title,
    description: t.description,
    startedAt: t.startedAt.toISOString(),
    endedAt: t.endedAt?.toISOString() ?? null,
    status: t.status,
    processingVersion: t.processingVersion,
    syncState: t.syncState,
  };
}

function toDomain(row: typeof trips.$inferSelect): Trip {
  return {
    id: row.id,
    clientTripId: row.clientTripId,
    title: row.title,
    description: row.description,
    startedAt: new Date(row.startedAt),
    endedAt: row.endedAt ? new Date(row.endedAt) : null,
    status: row.status as TripStatus,
    processingVersion: row.processingVersion,
    syncState: row.syncState as SyncState,
  };
}

export async function insertTrip(trip: NewTrip): Promise<void> {
  await db.insert(trips).values(toRow(trip));
  dbEvents.emit('trips:changed');
}

export async function getTripByClientId(clientTripId: string): Promise<Trip | null> {
  const rows = await db.select().from(trips).where(eq(trips.clientTripId, clientTripId));
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function getAllTrips(): Promise<Trip[]> {
  const rows = await db.select().from(trips);
  return rows.map(toDomain);
}

export async function getActiveTrip(): Promise<Trip | null> {
  const rows = await db
    .select()
    .from(trips)
    .where(and(ne(trips.status, 'COMPLETED'), ne(trips.status, 'PAUSED')));
  // RECORDING only
  const recording = rows.filter((r) => r.status === 'RECORDING');
  return recording[0] ? toDomain(recording[0]) : null;
}

export async function updateSyncState(clientTripId: string, state: SyncState): Promise<void> {
  await db.update(trips).set({ syncState: state }).where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function updateStatus(clientTripId: string, status: TripStatus): Promise<void> {
  await db.update(trips).set({ status }).where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function updateEndedAt(clientTripId: string, endedAt: Date): Promise<void> {
  await db
    .update(trips)
    .set({ endedAt: endedAt.toISOString(), status: 'COMPLETED' })
    .where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function updateProcessingVersion(clientTripId: string, version: number): Promise<void> {
  await db
    .update(trips)
    .set({ processingVersion: version })
    .where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function updateDetails(
  clientTripId: string,
  title: string,
  description: string | null,
): Promise<void> {
  await db
    .update(trips)
    .set({ title, description, syncState: 'PENDING' })
    .where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function deleteByClientId(clientTripId: string): Promise<void> {
  await db.delete(trips).where(eq(trips.clientTripId, clientTripId));
  dbEvents.emit('trips:changed');
}

export async function deleteAll(): Promise<void> {
  await db.delete(trips);
  dbEvents.emit('trips:changed');
}

export async function existsByClientId(clientTripId: string): Promise<boolean> {
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(eq(trips.clientTripId, clientTripId));
  return rows.length > 0;
}

export async function countUnsynced(): Promise<number> {
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(ne(trips.syncState, 'SYNCED'));
  return rows.length;
}

export async function getAllCompletedClientIds(): Promise<string[]> {
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(eq(trips.status, 'COMPLETED'));
  return rows.map((r) => r.clientTripId);
}

export async function getPendingSyncClientIds(): Promise<string[]> {
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(and(eq(trips.status, 'COMPLETED'), ne(trips.syncState, 'SYNCED')));
  return rows.map((r) => r.clientTripId);
}
