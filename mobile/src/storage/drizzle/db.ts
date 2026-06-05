import * as SQLite from "expo-sqlite";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";

import { DATABASE_NAME, getDatabase, runExclusiveDatabaseWrite } from "../sqlite/db";
import * as schema from "./schema";

export type TrailbookDrizzleDatabase = ExpoSQLiteDatabase<typeof schema>;

let drizzleDatabasePromise: Promise<TrailbookDrizzleDatabase> | null = null;

export async function getDrizzleDatabase(): Promise<TrailbookDrizzleDatabase> {
  if (!drizzleDatabasePromise) {
    drizzleDatabasePromise = getDatabase().then(() => {
      const sqliteDatabase = SQLite.openDatabaseSync(DATABASE_NAME);

      sqliteDatabase.execSync("PRAGMA busy_timeout = 5000;");

      return drizzle(sqliteDatabase, { schema });
    });
  }

  return drizzleDatabasePromise;
}

export async function runExclusiveDrizzleWrite<T>(
  task: (database: TrailbookDrizzleDatabase) => Promise<T>,
): Promise<T> {
  return runExclusiveDatabaseWrite(async (transaction) => task(drizzle(transaction, { schema })));
}
