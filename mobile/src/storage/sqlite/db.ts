import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";

const DATABASE_NAME = "trailbook.db";
const DATABASE_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function joinPath(directory: string, fileName: string) {
  return `${directory.replace(/\/+$/, "")}/${fileName}`;
}

function ensureFileUri(pathOrUri: string) {
  if (pathOrUri.startsWith("file://")) {
    return pathOrUri;
  }

  if (pathOrUri.startsWith("/")) {
    return `file://${pathOrUri}`;
  }

  return `file:///${pathOrUri}`;
}

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

export function getDatabaseFileUri(): string {
  const directory = SQLite.defaultDatabaseDirectory;

  if (!directory) {
    throw new Error("SQLite default database directory is not available.");
  }

  return ensureFileUri(joinPath(directory, DATABASE_NAME));
}

export async function exportDatabaseSnapshot(): Promise<string> {
  const database = await getDatabase();
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;

  if (!baseDirectory) {
    throw new Error("No writable export directory is available on this device.");
  }

  const exportDirectory = joinPath(baseDirectory, "exports");

  await FileSystem.makeDirectoryAsync(exportDirectory, { intermediates: true });
  await database.execAsync("PRAGMA wal_checkpoint(FULL);");

  const fileName = `trailbook-export-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  const exportUri = joinPath(exportDirectory, fileName);
  const databaseUri = getDatabaseFileUri();
  const databaseInfo = await FileSystem.getInfoAsync(databaseUri);

  if (!databaseInfo.exists) {
    throw new Error(`SQLite database file was not found at ${databaseUri}.`);
  }

  await FileSystem.copyAsync({
    from: databaseUri,
    to: exportUri,
  });

  return exportUri;
}
