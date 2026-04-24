import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "trailbook.db";
const DATABASE_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrateDatabaseIfNeeded(database: SQLite.SQLiteDatabase) {
  const versionRow = await database.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS trip_points (
      local_id TEXT PRIMARY KEY NOT NULL,
      server_id TEXT,
      trip_local_id TEXT NOT NULL,
      segment_local_id TEXT,
      device_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      accuracy REAL,
      altitude REAL,
      speed REAL,
      sync_status TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_trip_points_trip_local_id_recorded_at
      ON trip_points(trip_local_id, recorded_at);
    CREATE INDEX IF NOT EXISTS idx_trip_points_user_id
      ON trip_points(user_id);
    PRAGMA user_version = ${DATABASE_VERSION};
  `);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await migrateDatabaseIfNeeded(database);
      return database;
    });
  }

  return databasePromise;
}
