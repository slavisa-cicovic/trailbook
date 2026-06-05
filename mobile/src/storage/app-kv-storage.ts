import { eq } from "drizzle-orm";

import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { appKv as appKvTable } from "./drizzle/schema";

export async function loadJsonRecord<T>(storageKey: string): Promise<T | null> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select({ jsonValue: appKvTable.jsonValue })
    .from(appKvTable)
    .where(eq(appKvTable.storageKey, storageKey))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  return JSON.parse(row.jsonValue) as T;
}

export async function saveJsonRecord<T>(storageKey: string, value: T | null): Promise<void> {
  await runExclusiveDrizzleWrite(async (database) => {
    if (value === null) {
      await database.delete(appKvTable).where(eq(appKvTable.storageKey, storageKey));
      return;
    }

    const jsonValue = JSON.stringify(value);
    const updatedAt = new Date().toISOString();

    await database
      .insert(appKvTable)
      .values({
        jsonValue,
        storageKey,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: appKvTable.storageKey,
        set: {
          jsonValue,
          updatedAt,
        },
      });
  });
}
