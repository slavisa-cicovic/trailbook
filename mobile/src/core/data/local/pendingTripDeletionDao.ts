import { eq } from 'drizzle-orm';
import { db } from '@/core/db';
import { pendingTripDeletions } from '@/core/db/schema';

export async function insert(clientTripId: string): Promise<void> {
  await db
    .insert(pendingTripDeletions)
    .values({ clientTripId, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export async function getAll(): Promise<string[]> {
  const rows = await db
    .select({ clientTripId: pendingTripDeletions.clientTripId })
    .from(pendingTripDeletions);
  return rows.map((row) => row.clientTripId);
}

export async function deleteByClientTripId(clientTripId: string): Promise<void> {
  await db
    .delete(pendingTripDeletions)
    .where(eq(pendingTripDeletions.clientTripId, clientTripId));
}
