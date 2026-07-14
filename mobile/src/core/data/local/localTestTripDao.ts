import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { localTestTripUsage } from '@/core/db/schema';

export async function save(
  userId: string,
  tripClientId: string,
  usedAt: string,
): Promise<void> {
  await db
    .insert(localTestTripUsage)
    .values({ userId, tripClientId, usedAt })
    .onConflictDoUpdate({
      set: { tripClientId, usedAt },
      target: localTestTripUsage.userId,
    });
}

export async function getTripClientId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ tripClientId: localTestTripUsage.tripClientId })
    .from(localTestTripUsage)
    .where(eq(localTestTripUsage.userId, userId));
  return rows[0]?.tripClientId ?? null;
}
