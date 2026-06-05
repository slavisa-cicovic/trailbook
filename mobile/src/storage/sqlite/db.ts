import * as SQLite from "expo-sqlite";
import * as FileSystem from "expo-file-system/legacy";

export const DATABASE_NAME = "trailbook.db";
const DATABASE_VERSION = 14;

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
        recording_config_json TEXT,
        battery_start_level_percent REAL,
        battery_start_state TEXT,
        battery_end_level_percent REAL,
        battery_end_state TEXT,
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
        max_silent_gap_ms INTEGER NOT NULL DEFAULT 0,
        platform TEXT NOT NULL,
        recent_events_json TEXT NOT NULL,
        recording_mode TEXT NOT NULL,
        rejected_by_accuracy INTEGER NOT NULL,
        rejected_by_implied_speed INTEGER NOT NULL,
        rejected_by_jump_distance INTEGER NOT NULL,
        rejected_by_min_movement INTEGER NOT NULL,
        session_duplicate_recorded_at INTEGER NOT NULL,
        silent_gap_count INTEGER NOT NULL DEFAULT 0,
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

  if (currentVersion < 5) {
    await database.execAsync(`
      ALTER TABLE trips ADD COLUMN recording_config_json TEXT;
      PRAGMA user_version = 5;
    `).catch(async (error) => {
      if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
        throw error;
      }

      await database.execAsync("PRAGMA user_version = 5;");
    });
  }

  if (currentVersion < 6) {
    const columns = [
      "battery_start_level_percent REAL",
      "battery_start_state TEXT",
      "battery_end_level_percent REAL",
      "battery_end_state TEXT",
    ];

    for (const columnDefinition of columns) {
      await database.execAsync(`ALTER TABLE trips ADD COLUMN ${columnDefinition};`).catch(async (error) => {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
          throw error;
        }
      });
    }

    await database.execAsync("PRAGMA user_version = 6;");
  }

  if (currentVersion < 7) {
    const tripColumns = [
      "point_count INTEGER",
      "distance_meters REAL",
      "stats_updated_at TEXT",
    ];
    const segmentColumns = [
      "point_count INTEGER",
      "distance_meters REAL",
      "duration_ms INTEGER",
      "stats_updated_at TEXT",
    ];

    for (const columnDefinition of tripColumns) {
      await database.execAsync(`ALTER TABLE trips ADD COLUMN ${columnDefinition};`).catch(async (error) => {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
          throw error;
        }
      });
    }

    for (const columnDefinition of segmentColumns) {
      await database.execAsync(`ALTER TABLE trip_segments ADD COLUMN ${columnDefinition};`).catch(async (error) => {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
          throw error;
        }
      });
    }

    const tripStatsTable = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip_stats'",
    );
    const tripSegmentStatsTable = await database.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'trip_segment_stats'",
    );

    if (tripStatsTable) {
      await database.execAsync(`
        UPDATE trips
        SET
          point_count = (
            SELECT trip_stats.point_count
            FROM trip_stats
            WHERE trip_stats.trip_local_id = trips.local_id
          ),
          distance_meters = (
            SELECT trip_stats.distance_meters
            FROM trip_stats
            WHERE trip_stats.trip_local_id = trips.local_id
          ),
          stats_updated_at = (
            SELECT trip_stats.updated_at
            FROM trip_stats
            WHERE trip_stats.trip_local_id = trips.local_id
          )
        WHERE EXISTS (
          SELECT 1
          FROM trip_stats
          WHERE trip_stats.trip_local_id = trips.local_id
        );
      `);
    }

    if (tripSegmentStatsTable) {
      await database.execAsync(`
        UPDATE trip_segments
        SET
          point_count = (
            SELECT trip_segment_stats.point_count
            FROM trip_segment_stats
            WHERE trip_segment_stats.segment_local_id = trip_segments.local_id
          ),
          distance_meters = (
            SELECT trip_segment_stats.distance_meters
            FROM trip_segment_stats
            WHERE trip_segment_stats.segment_local_id = trip_segments.local_id
          ),
          duration_ms = (
            SELECT trip_segment_stats.duration_ms
            FROM trip_segment_stats
            WHERE trip_segment_stats.segment_local_id = trip_segments.local_id
          ),
          stats_updated_at = (
            SELECT trip_segment_stats.updated_at
            FROM trip_segment_stats
            WHERE trip_segment_stats.segment_local_id = trip_segments.local_id
          )
        WHERE EXISTS (
          SELECT 1
          FROM trip_segment_stats
          WHERE trip_segment_stats.segment_local_id = trip_segments.local_id
        );
      `);
    }

    await database.execAsync("PRAGMA user_version = 7;");
  }

  if (currentVersion < 8) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trip_groups (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_groups_user_id_deleted_at_updated_at
        ON trip_groups(user_id, deleted_at, updated_at);

      CREATE TABLE IF NOT EXISTS trip_group_members (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        group_local_id TEXT NOT NULL,
        trip_local_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        sync_status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_group_members_user_group_deleted_sort
        ON trip_group_members(user_id, group_local_id, deleted_at, sort_order);
      CREATE INDEX IF NOT EXISTS idx_trip_group_members_user_trip_deleted
        ON trip_group_members(user_id, trip_local_id, deleted_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_group_members_active_trip
        ON trip_group_members(group_local_id, trip_local_id)
        WHERE deleted_at IS NULL;

      PRAGMA user_version = 8;
    `);
  }

  if (currentVersion < 9) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS raw_location_events (
        local_id TEXT PRIMARY KEY NOT NULL,
        trip_local_id TEXT NOT NULL,
        session_started_at TEXT,
        active_segment_local_id TEXT,
        batch_id TEXT NOT NULL,
        batch_index INTEGER NOT NULL,
        callback_source TEXT NOT NULL,
        origin TEXT NOT NULL,
        received_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        accuracy REAL,
        altitude REAL,
        speed REAL,
        processing_status TEXT NOT NULL,
        processing_decision TEXT,
        processed_at TEXT,
        accepted_trip_point_local_id TEXT,
        segment_local_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_raw_location_events_trip_recorded_at
        ON raw_location_events(trip_local_id, recorded_at, batch_index);
      CREATE INDEX IF NOT EXISTS idx_raw_location_events_trip_status_recorded_at
        ON raw_location_events(trip_local_id, processing_status, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_raw_location_events_batch_id
        ON raw_location_events(batch_id, batch_index);

      PRAGMA user_version = 9;
    `);
  }

  if (currentVersion < 10) {
    const columns = [
      "max_silent_gap_ms INTEGER NOT NULL DEFAULT 0",
      "silent_gap_count INTEGER NOT NULL DEFAULT 0",
    ];

    for (const columnDefinition of columns) {
      await database.execAsync(`ALTER TABLE trip_diagnostics ADD COLUMN ${columnDefinition};`).catch(async (error) => {
        if (!(error instanceof Error) || !error.message.includes("duplicate column name")) {
          throw error;
        }
      });
    }

    await database.execAsync("PRAGMA user_version = 10;");
  }

  if (currentVersion < 11) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_local_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt_count INTEGER NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_created_at
        ON sync_outbox(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_pending_entity_operation
        ON sync_outbox(entity_type, entity_local_id, operation)
        WHERE status IN ('pending', 'running');

      PRAGMA user_version = 11;
    `);
  }

  if (currentVersion < 12) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS trip_route_variants (
        local_id TEXT PRIMARY KEY NOT NULL,
        server_id TEXT,
        trip_local_id TEXT NOT NULL,
        variant_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        geometry_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trip_route_variants_trip_type
        ON trip_route_variants(trip_local_id, variant_type, deleted_at);

      PRAGMA user_version = 12;
    `);
  }

  if (currentVersion < 13) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS recording_native_events (
        local_id TEXT PRIMARY KEY NOT NULL,
        trip_local_id TEXT,
        event_type TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recording_native_events_trip_recorded_at
        ON recording_native_events(trip_local_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_recording_native_events_type_recorded_at
        ON recording_native_events(event_type, recorded_at);

      PRAGMA user_version = 13;
    `);
  }

  if (currentVersion < 14) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS diagnostic_events (
        local_id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        severity TEXT NOT NULL,
        trip_local_id TEXT,
        segment_local_id TEXT,
        payload_json TEXT,
        recorded_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_diagnostic_events_recorded_at
        ON diagnostic_events(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_diagnostic_events_trip_recorded_at
        ON diagnostic_events(trip_local_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_diagnostic_events_category_severity_recorded_at
        ON diagnostic_events(category, severity, recorded_at);

      PRAGMA user_version = 14;
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

export async function clearLocalTripData(): Promise<void> {
  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM sync_outbox");
    await database.runAsync("DELETE FROM diagnostic_events");
    await database.runAsync("DELETE FROM recording_native_events");
    await database.runAsync("DELETE FROM trip_route_variants");
    await database.runAsync("DELETE FROM raw_location_events");
    await database.runAsync("DELETE FROM trip_group_members");
    await database.runAsync("DELETE FROM trip_groups");
    await database.runAsync("DELETE FROM waypoint_attachments");
    await database.runAsync("DELETE FROM waypoints");
    await database.runAsync("DELETE FROM trip_diagnostics");
    await database.runAsync("DELETE FROM trip_segment_stats");
    await database.runAsync("DELETE FROM trip_stats");
    await database.runAsync("DELETE FROM trip_pauses");
    await database.runAsync("DELETE FROM trip_segments");
    await database.runAsync("DELETE FROM trip_points");
    await database.runAsync("DELETE FROM trips");
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
