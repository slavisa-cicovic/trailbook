import { eq, ne, and, gte, lt, inArray, like, desc, asc, sql } from 'drizzle-orm';
import { db } from '@/core/db';
import { segments, trips } from '@/core/db/schema';
import { dbEvents } from '@/core/db/events';
import type { Trip, TripStatus, SyncState } from '@/core/domain/model/trip';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import type { Filters } from '@/feature/trips/tripFilters';

type NewTrip = Omit<Trip, 'id' | 'ownerUserId'> & { ownerUserId?: string };

async function requireCurrentOwnerUserId(): Promise<string> {
  const ownerUserId = await authRepository.getLocalUserId();
  if (!ownerUserId) throw new Error('No authenticated local user');
  return ownerUserId;
}

async function getCurrentOwnerUserId(): Promise<string | null> {
  return authRepository.getLocalUserId();
}

function toRow(t: NewTrip, ownerUserId: string) {
  return {
    clientTripId: t.clientTripId,
    ownerUserId: t.ownerUserId ?? ownerUserId,
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
    ownerUserId: row.ownerUserId,
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
  const ownerUserId = await requireCurrentOwnerUserId();
  await db.insert(trips).values(toRow(trip, ownerUserId));
  dbEvents.emit('trips:changed');
}

export async function getTripByClientId(clientTripId: string): Promise<Trip | null> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return null;
  const rows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  return rows[0] ? toDomain(rows[0]) : null;
}

export async function getAllTrips(): Promise<Trip[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db.select().from(trips).where(eq(trips.ownerUserId, ownerUserId));
  return rows.map(toDomain);
}

export async function getTripsByClientIds(clientTripIds: string[]): Promise<Trip[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId || clientTripIds.length === 0) return [];
  const rows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.ownerUserId, ownerUserId), inArray(trips.clientTripId, clientTripIds)));
  const byId = new Map(rows.map((row) => [row.clientTripId, toDomain(row)]));
  return clientTripIds.map((clientTripId) => byId.get(clientTripId)).filter((trip): trip is Trip => Boolean(trip));
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function periodBounds(period: Filters['period']): { from?: Date; to?: Date } {
  const now = new Date();
  const today = startOfDay(now);

  if (period === 'today') return { from: today };

  if (period === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    return { from: yesterday, to: today };
  }

  if (period === 'last_week') {
    const lastWeek = new Date(today);
    lastWeek.setDate(today.getDate() - 7);
    return { from: lastWeek };
  }

  return {};
}

export async function listTripIds(filters: Filters): Promise<string[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];

  const conditions = [eq(trips.ownerUserId, ownerUserId)];
  const search = filters.search.trim();
  if (search) conditions.push(like(trips.title, `%${search}%`));

  const { from, to } = periodBounds(filters.period);
  if (from) conditions.push(gte(trips.startedAt, from.toISOString()));
  if (to) conditions.push(lt(trips.startedAt, to.toISOString()));

  if (filters.activities.length > 0) {
    const segmentRows = await db
      .selectDistinct({ tripId: segments.tripId })
      .from(segments)
      .where(inArray(segments.segmentType, filters.activities));
    const tripIds = segmentRows.map((row) => row.tripId);
    if (tripIds.length === 0) return [];
    conditions.push(inArray(trips.clientTripId, tripIds));
  }

  const orderBy =
    filters.sort === 'oldest'
      ? asc(trips.startedAt)
      : filters.sort === 'distance'
        ? desc(sql<number>`coalesce(sum(${segments.distanceM}), 0)`)
        : filters.sort === 'duration'
          ? desc(sql<number>`coalesce(strftime('%s', ${trips.endedAt}) - strftime('%s', ${trips.startedAt}), 0)`)
          : desc(trips.startedAt);

  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .leftJoin(segments, eq(segments.tripId, trips.clientTripId))
    .where(and(...conditions))
    .groupBy(trips.clientTripId)
    .orderBy(orderBy);

  return rows.map((row) => row.clientTripId);
}

export async function getActiveTrip(): Promise<Trip | null> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return null;
  const rows = await db
    .select()
    .from(trips)
    .where(and(eq(trips.ownerUserId, ownerUserId), ne(trips.status, 'COMPLETED'), ne(trips.status, 'PAUSED')));
  // RECORDING only
  const recording = rows.filter((r) => r.status === 'RECORDING');
  return recording[0] ? toDomain(recording[0]) : null;
}

export async function updateSyncState(clientTripId: string, state: SyncState): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(trips)
    .set({ syncState: state })
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function updateStatus(clientTripId: string, status: TripStatus): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(trips)
    .set({ status })
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function updateEndedAt(clientTripId: string, endedAt: Date): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(trips)
    .set({ endedAt: endedAt.toISOString(), status: 'COMPLETED' })
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function updateProcessingVersion(clientTripId: string, version: number): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(trips)
    .set({ processingVersion: version })
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function updateDetails(
  clientTripId: string,
  title: string,
  description: string | null,
): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .update(trips)
    .set({ title, description, syncState: 'PENDING' })
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function deleteByClientId(clientTripId: string): Promise<void> {
  const ownerUserId = await requireCurrentOwnerUserId();
  await db
    .delete(trips)
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  dbEvents.emit('trips:changed');
}

export async function deleteAll(): Promise<void> {
  await db.delete(trips);
  dbEvents.emit('trips:changed');
}

export async function existsByClientId(clientTripId: string): Promise<boolean> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return false;
  const rows = await db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.clientTripId, clientTripId), eq(trips.ownerUserId, ownerUserId)));
  return rows.length > 0;
}

export async function countUnsynced(): Promise<number> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return 0;
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(and(eq(trips.ownerUserId, ownerUserId), ne(trips.syncState, 'SYNCED')));
  return rows.length;
}

export async function getAllCompletedClientIds(): Promise<string[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(and(eq(trips.ownerUserId, ownerUserId), eq(trips.status, 'COMPLETED')));
  return rows.map((r) => r.clientTripId);
}

export async function getPendingSyncClientIds(): Promise<string[]> {
  const ownerUserId = await getCurrentOwnerUserId();
  if (!ownerUserId) return [];
  const rows = await db
    .select({ clientTripId: trips.clientTripId })
    .from(trips)
    .where(and(eq(trips.ownerUserId, ownerUserId), eq(trips.status, 'COMPLETED'), ne(trips.syncState, 'SYNCED')));
  return rows.map((r) => r.clientTripId);
}
