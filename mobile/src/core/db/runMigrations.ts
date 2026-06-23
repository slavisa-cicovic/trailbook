import { openDatabaseSync } from 'expo-sqlite';

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

const MIGRATIONS: [number, string][] = [[0, MIGRATION_0000]];

export async function runMigrations(): Promise<void> {
  const sqlite = openDatabaseSync('vellora.db');

  await sqlite.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (version integer PRIMARY KEY NOT NULL);`,
  );

  const applied = await sqlite.getAllAsync<{ version: number }>(`SELECT version FROM _migrations`);
  const appliedSet = new Set(applied.map((r) => r.version));

  for (const [version, sql] of MIGRATIONS) {
    if (appliedSet.has(version)) continue;
    await sqlite.withTransactionAsync(async () => {
      await sqlite.execAsync(sql);
      await sqlite.runAsync(`INSERT INTO _migrations (version) VALUES (?)`, version);
    });
  }
}
