import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";

const DATABASE_NAME = "trailbook.db";
const DATABASE_VERSION = 4;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let databaseWriteQueue: Promise<void> = Promise.resolve();

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

  if (currentVersion < 1) {
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
      PRAGMA user_version = 1;
    `);
  }

  if (currentVersion < 2) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trips (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        recording_profile TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trips_user_id_updated_at
        ON trips(user_id, updated_at);

      CREATE TABLE IF NOT EXISTS trip_pauses (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_local_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_pauses_trip_local_id_started_at
        ON trip_pauses(trip_local_id, started_at);

      CREATE TABLE IF NOT EXISTS trip_segments (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_local_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        recording_profile TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_segments_trip_local_id_started_at
        ON trip_segments(trip_local_id, started_at);

      CREATE TABLE IF NOT EXISTS trip_diagnostics (
        trip_local_id TEXT PRIMARY KEY NOT NULL,
        accepted INTEGER NOT NULL,
        accepted_after_long_gap INTEGER NOT NULL,
        accuracy_histogram_json TEXT NOT NULL,
        background_accepted INTEGER NOT NULL,
        background_callbacks INTEGER NOT NULL,
        background_rejected INTEGER NOT NULL,
        callback_count INTEGER NOT NULL,
        decision_count INTEGER NOT NULL,
        duplicate_coordinates INTEGER NOT NULL,
        duplicate_timestamp INTEGER NOT NULL,
        foreground_accepted INTEGER NOT NULL,
        foreground_callbacks INTEGER NOT NULL,
        foreground_rejected INTEGER NOT NULL,
        max_callback_gap_ms INTEGER NOT NULL,
        max_recorded_gap_ms INTEGER NOT NULL,
        platform TEXT NOT NULL,
        recent_events_json TEXT NOT NULL,
        recording_mode TEXT NOT NULL,
        rejected_by_accuracy INTEGER NOT NULL,
        rejected_by_implied_speed INTEGER NOT NULL,
        rejected_by_jump_distance INTEGER NOT NULL,
        rejected_by_min_movement INTEGER NOT NULL,
        session_duplicate_recorded_at INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS waypoints (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_local_id TEXT NOT NULL,
        segment_local_id TEXT,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_waypoints_trip_local_id_created_at
        ON waypoints(trip_local_id, created_at);

      CREATE TABLE IF NOT EXISTS waypoint_attachments (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        waypoint_local_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        local_uri TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_waypoint_attachments_waypoint_local_id_created_at
        ON waypoint_attachments(waypoint_local_id, created_at);

      CREATE TABLE IF NOT EXISTS app_kv (
        storage_key TEXT PRIMARY KEY NOT NULL,
        json_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      PRAGMA user_version = 2;
    `);
  }

  if (currentVersion < 3) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trip_stats (
        trip_local_id TEXT PRIMARY KEY NOT NULL,
        point_count INTEGER NOT NULL,
        distance_meters REAL NOT NULL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 3;
    `);
  }

  if (currentVersion < 4) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trip_segment_stats (
        segment_local_id TEXT PRIMARY KEY NOT NULL,
        trip_local_id TEXT NOT NULL,
        point_count INTEGER NOT NULL,
        distance_meters REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_segment_stats_trip_local_id
        ON trip_segment_stats(trip_local_id);
      PRAGMA user_version = 4;
    `);
  }
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await migrateDatabaseIfNeeded(database);
      await database.execAsync("PRAGMA busy_timeout = 5000;");
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

export async function loadJsonRecord<T>(storageKey: string): Promise<T | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ json_value: string }>(
    "SELECT json_value FROM app_kv WHERE storage_key = ?",
    storageKey,
  );

  if (!row) {
    return null;
  }

  return JSON.parse(row.json_value) as T;
}

export async function saveJsonRecord<T>(storageKey: string, value: T | null): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    if (value === null) {
      await database.runAsync("DELETE FROM app_kv WHERE storage_key = ?", storageKey);
      return;
    }

    await database.runAsync(
      `INSERT OR REPLACE INTO app_kv (
        storage_key,
        json_value,
        updated_at
      ) VALUES (?, ?, ?)`,
      storageKey,
      JSON.stringify(value),
      new Date().toISOString(),
    );
  });
}

export async function runExclusiveDatabaseWrite<T>(
  task: (transaction: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  let releaseQueue: () => void = () => undefined;
  const waitForTurn = databaseWriteQueue;
  databaseWriteQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await waitForTurn;

  try {
    const database = await getDatabase();
    let result: T | undefined;

    await database.withExclusiveTransactionAsync(async (transaction) => {
      result = await task(transaction);
    });

    return result as T;
  } finally {
    releaseQueue();
  }
}
