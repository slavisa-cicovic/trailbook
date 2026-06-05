import * as SQLite from "expo-sqlite";
import { drizzle, type ExpoSQLiteDatabase } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import { DATABASE_NAME, getDatabase, runExclusiveDatabaseWrite } from "../sqlite/db";
import {
  DRIZZLE_BASELINE_TAG,
  DRIZZLE_BASELINE_WHEN,
  drizzleMigrationConfig,
} from "./migrations";
import * as schema from "./schema";

export type TrailbookDrizzleDatabase = ExpoSQLiteDatabase<typeof schema> & {
  $client: SQLite.SQLiteDatabase;
};

export type DrizzleMigrationState = {
  baselineApplied: boolean;
  baselineCreatedAt: number;
  baselineTag: string;
  keyTables: {
    rawLocationEvents: boolean;
    tripGroupMembers: boolean;
    tripGroups: boolean;
    trips: boolean;
  };
  latestCreatedAt: number | null;
  legacyUserVersion: number;
  migrationCount: number;
  migrationTableExists: boolean;
};

const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";

let drizzleDatabasePromise: Promise<TrailbookDrizzleDatabase> | null = null;

export async function getDrizzleDatabase(): Promise<TrailbookDrizzleDatabase> {
  if (!drizzleDatabasePromise) {
    drizzleDatabasePromise = getDatabase().then(async () => {
      const sqliteDatabase = SQLite.openDatabaseSync(DATABASE_NAME);

      sqliteDatabase.execSync("PRAGMA busy_timeout = 5000;");

      const database = drizzle(sqliteDatabase, { schema });

      await migrateDrizzleDatabaseIfNeeded(database);

      return database;
    });
  }

  return drizzleDatabasePromise;
}

export async function migrateDrizzleDatabaseIfNeeded(database: TrailbookDrizzleDatabase): Promise<void> {
  ensureDrizzleBaseline(database.$client);
  await migrate(database, drizzleMigrationConfig);
}

export async function getDrizzleMigrationState(): Promise<DrizzleMigrationState> {
  const database = await getDrizzleDatabase();
  const sqliteDatabase = database.$client;
  const legacyVersionRow = sqliteDatabase.getFirstSync<{ user_version: number }>("PRAGMA user_version");
  const migrationTableExists = hasDrizzleMigrationTable(sqliteDatabase);
  const migrationRow = migrationTableExists
    ? sqliteDatabase.getFirstSync<{
        baseline_count: number;
        latest_created_at: number | null;
        migration_count: number;
      }>(
        `SELECT
          COUNT(*) AS migration_count,
          MAX(created_at) AS latest_created_at,
          SUM(CASE WHEN created_at = ? AND hash = ? THEN 1 ELSE 0 END) AS baseline_count
        FROM ${DRIZZLE_MIGRATIONS_TABLE}`,
        DRIZZLE_BASELINE_WHEN,
        DRIZZLE_BASELINE_TAG,
      )
    : null;

  return {
    baselineApplied: (migrationRow?.baseline_count ?? 0) > 0,
    baselineCreatedAt: DRIZZLE_BASELINE_WHEN,
    baselineTag: DRIZZLE_BASELINE_TAG,
    keyTables: {
      rawLocationEvents: hasTable(sqliteDatabase, "raw_location_events"),
      tripGroupMembers: hasTable(sqliteDatabase, "trip_group_members"),
      tripGroups: hasTable(sqliteDatabase, "trip_groups"),
      trips: hasTable(sqliteDatabase, "trips"),
    },
    latestCreatedAt: migrationRow?.latest_created_at ?? null,
    legacyUserVersion: legacyVersionRow?.user_version ?? 0,
    migrationCount: migrationRow?.migration_count ?? 0,
    migrationTableExists,
  };
}

export async function runExclusiveDrizzleWrite<T>(
  task: (database: TrailbookDrizzleDatabase) => Promise<T>,
): Promise<T> {
  await getDrizzleDatabase();

  return runExclusiveDatabaseWrite(async (transaction) => task(drizzle(transaction, { schema })));
}

function ensureDrizzleBaseline(sqliteDatabase: SQLite.SQLiteDatabase): void {
  sqliteDatabase.execSync(`
    CREATE TABLE IF NOT EXISTS ${DRIZZLE_MIGRATIONS_TABLE} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `);

  const latestRow = sqliteDatabase.getFirstSync<{ latest_created_at: number | null }>(
    `SELECT MAX(created_at) AS latest_created_at FROM ${DRIZZLE_MIGRATIONS_TABLE}`,
  );
  const latestCreatedAt = latestRow?.latest_created_at ?? null;

  if (latestCreatedAt !== null && Number(latestCreatedAt) >= DRIZZLE_BASELINE_WHEN) {
    return;
  }

  sqliteDatabase.runSync(
    `INSERT INTO ${DRIZZLE_MIGRATIONS_TABLE} (hash, created_at) VALUES (?, ?)`,
    DRIZZLE_BASELINE_TAG,
    DRIZZLE_BASELINE_WHEN,
  );
}

function hasDrizzleMigrationTable(sqliteDatabase: SQLite.SQLiteDatabase): boolean {
  return hasTable(sqliteDatabase, DRIZZLE_MIGRATIONS_TABLE);
}

function hasTable(sqliteDatabase: SQLite.SQLiteDatabase, tableName: string): boolean {
  const row = sqliteDatabase.getFirstSync<{ table_count: number }>(
    `SELECT COUNT(*) AS table_count
    FROM sqlite_master
    WHERE type = 'table' AND name = ?`,
    tableName,
  );

  return (row?.table_count ?? 0) > 0;
}
