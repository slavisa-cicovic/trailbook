import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

const MIGRATION_0000 = `
  CREATE TABLE IF NOT EXISTS capture_meta (
    trip_id text PRIMARY KEY NOT NULL,
    capture_schema_version integer NOT NULL,
    app_version text NOT NULL,
    os_api_level integer NOT NULL,
    device_model text NOT NULL,
    capture_time_zone text NOT NULL
  );
  CREATE TABLE IF NOT EXISTS raw_activity_samples (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id text NOT NULL,
    timestamp text NOT NULL,
    results text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS raw_activity_trip_id_idx ON raw_activity_samples (trip_id);
  CREATE TABLE IF NOT EXISTS raw_device_samples (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id text NOT NULL,
    timestamp text NOT NULL,
    battery_pct integer NOT NULL,
    is_charging integer NOT NULL,
    power_save_mode integer NOT NULL,
    gps_enabled integer NOT NULL
  );
  CREATE INDEX IF NOT EXISTS raw_device_trip_id_idx ON raw_device_samples (trip_id);
  CREATE TABLE IF NOT EXISTS raw_location_samples (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id text NOT NULL,
    timestamp text NOT NULL,
    latitude real NOT NULL,
    longitude real NOT NULL,
    accuracy_m real,
    altitude_m real,
    speed_mps real,
    bearing_deg real,
    provider text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS raw_location_trip_id_idx ON raw_location_samples (trip_id);
  CREATE TABLE IF NOT EXISTS raw_session_events (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id text NOT NULL,
    timestamp text NOT NULL,
    type text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS raw_session_trip_id_idx ON raw_session_events (trip_id);
  CREATE TABLE IF NOT EXISTS segments (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trip_id text NOT NULL,
    segment_index integer NOT NULL,
    segment_type text NOT NULL,
    started_at text NOT NULL,
    ended_at text NOT NULL,
    distance_m real
  );
  CREATE INDEX IF NOT EXISTS segments_trip_id_idx ON segments (trip_id);
  CREATE TABLE IF NOT EXISTS trips (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    client_trip_id text NOT NULL UNIQUE,
    title text NOT NULL,
    description text,
    started_at text NOT NULL,
    ended_at text,
    status text NOT NULL,
    processing_version integer NOT NULL DEFAULT 0,
    sync_state text NOT NULL DEFAULT 'PENDING'
  );
  CREATE TABLE IF NOT EXISTS waypoint_images (
    id text PRIMARY KEY NOT NULL,
    waypoint_id text NOT NULL,
    source text NOT NULL,
    local_uri text NOT NULL,
    captured_at text,
    object_key text,
    upload_state text NOT NULL DEFAULT 'PENDING'
  );
  CREATE INDEX IF NOT EXISTS waypoint_images_waypoint_id_idx ON waypoint_images (waypoint_id);
  CREATE TABLE IF NOT EXISTS waypoints (
    id text PRIMARY KEY NOT NULL,
    trip_id text NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    latitude real NOT NULL,
    longitude real NOT NULL,
    created_at text NOT NULL,
    updated_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS waypoints_trip_id_idx ON waypoints (trip_id);
`;

// Adds client_trip_id to trips if the DB pre-dates migration 0000 (old schema).
async function migration_0001(sqlite: SQLiteDatabase): Promise<void> {
  const cols = await sqlite.getAllAsync<{ name: string }>(
    `SELECT name FROM pragma_table_info('trips')`,
  );
  if (cols.some((c) => c.name === 'client_trip_id')) return;

  await sqlite.execAsync(`ALTER TABLE trips ADD COLUMN client_trip_id text;`);
  const rows = await sqlite.getAllAsync<{ id: number }>(
    `SELECT id FROM trips WHERE client_trip_id IS NULL`,
  );
  for (const row of rows) {
    await sqlite.runAsync(
      `UPDATE trips SET client_trip_id = ? WHERE id = ?`,
      [`migrated-${row.id}`, row.id],
    );
  }
}

const MIGRATION_0002 = `
  CREATE TABLE IF NOT EXISTS reprocessing_snapshots (
    trip_id text PRIMARY KEY NOT NULL,
    snapshot_json text NOT NULL,
    created_at text NOT NULL
  );
`;

type Migration = [number, string | ((db: SQLiteDatabase) => Promise<void>)];

const MIGRATIONS: Migration[] = [
  [0, MIGRATION_0000],
  [1, migration_0001],
  [2, MIGRATION_0002],
];

export async function runMigrations(): Promise<void> {
  const sqlite = openDatabaseSync('trailbook.db');

  // If the trips table exists but lacks client_trip_id, the schema predates the
  // current migration (regardless of whether _migrations exists or what it contains).
  // Drop everything so MIGRATION_0000 can recreate all tables from scratch.
  const allTables = await sqlite.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  );
  const hasTrips = allTables.some((t) => t.name === 'trips');
  if (hasTrips) {
    const tripsCols = await sqlite.getAllAsync<{ name: string }>(
      `SELECT name FROM pragma_table_info('trips')`,
    );
    const schemaOk = tripsCols.some((c) => c.name === 'client_trip_id');
    if (!schemaOk) {
      for (const { name } of allTables) {
        await sqlite.execAsync(`DROP TABLE IF EXISTS "${name}"`);
      }
    }
  }

  await sqlite.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (version integer PRIMARY KEY NOT NULL);`,
  );

  const applied = await sqlite.getAllAsync<{ version: number }>(`SELECT version FROM _migrations`);
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const [version, migration] of MIGRATIONS) {
    if (appliedSet.has(version)) continue;
    await sqlite.withTransactionAsync(async () => {
      if (typeof migration === 'string') {
        await sqlite.execAsync(migration);
      } else {
        await migration(sqlite);
      }
      await sqlite.runAsync(`INSERT INTO _migrations (version) VALUES (?)`, version);
    });
  }
}
