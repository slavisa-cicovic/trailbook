import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ─── AUTHORED ───────────────────────────────────────────────────────────────

export const trips = sqliteTable('trips', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clientTripId: text('client_trip_id').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  status: text('status').notNull(), // RECORDING | PAUSED | COMPLETED
  processingVersion: integer('processing_version').notNull().default(0),
  syncState: text('sync_state').notNull().default('PENDING'), // PENDING | SYNCED | FAILED
});

export const waypoints = sqliteTable(
  'waypoints',
  {
    id: text('id').primaryKey(), // client UUID
    tripId: text('trip_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    category: text('category').notNull(),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('waypoints_trip_id_idx').on(t.tripId)],
);

export const waypointImages = sqliteTable(
  'waypoint_images',
  {
    id: text('id').primaryKey(), // client UUID
    waypointId: text('waypoint_id').notNull(),
    source: text('source').notNull(), // CAMERA | GALLERY
    localUri: text('local_uri').notNull(),
    capturedAt: text('captured_at'),
    objectKey: text('object_key'),
    uploadState: text('upload_state').notNull().default('PENDING'), // PENDING | UPLOADED | FAILED
  },
  (t) => [index('waypoint_images_waypoint_id_idx').on(t.waypointId)],
);

// ─── RAW ────────────────────────────────────────────────────────────────────

export const captureMeta = sqliteTable('capture_meta', {
  tripId: text('trip_id').primaryKey(),
  captureSchemaVersion: integer('capture_schema_version').notNull(),
  appVersion: text('app_version').notNull(),
  osApiLevel: integer('os_api_level').notNull(),
  deviceModel: text('device_model').notNull(),
  captureTimeZone: text('capture_time_zone').notNull(),
});

export const rawLocationSamples = sqliteTable(
  'raw_location_samples',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    timestamp: text('timestamp').notNull(),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    accuracyM: real('accuracy_m'),
    altitudeM: real('altitude_m'),
    speedMps: real('speed_mps'),
    bearingDeg: real('bearing_deg'),
    provider: text('provider').notNull(),
  },
  (t) => [index('raw_location_trip_id_idx').on(t.tripId)],
);

export const rawActivitySamples = sqliteTable(
  'raw_activity_samples',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    timestamp: text('timestamp').notNull(),
    results: text('results', { mode: 'json' }).notNull().$type<
      Array<{ activityType: number; confidence: number }>
    >(),
  },
  (t) => [index('raw_activity_trip_id_idx').on(t.tripId)],
);

export const rawDeviceSamples = sqliteTable(
  'raw_device_samples',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    timestamp: text('timestamp').notNull(),
    batteryPct: integer('battery_pct').notNull(),
    isCharging: integer('is_charging', { mode: 'boolean' }).notNull(),
    powerSaveMode: integer('power_save_mode', { mode: 'boolean' }).notNull(),
    gpsEnabled: integer('gps_enabled', { mode: 'boolean' }).notNull(),
  },
  (t) => [index('raw_device_trip_id_idx').on(t.tripId)],
);

export const rawSessionEvents = sqliteTable(
  'raw_session_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    timestamp: text('timestamp').notNull(),
    type: text('type').notNull(),
    payload: text('payload_json', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  },
  (t) => [index('raw_session_trip_id_idx').on(t.tripId)],
);

// ─── DERIVED ─────────────────────────────────────────────────────────────────

export const segments = sqliteTable(
  'segments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    segmentIndex: integer('segment_index').notNull(),
    segmentType: text('segment_type').notNull(),
    startedAt: text('started_at').notNull(),
    endedAt: text('ended_at').notNull(),
    distanceM: real('distance_m'),
  },
  (t) => [index('segments_trip_id_idx').on(t.tripId)],
);

export const displayRoutePoints = sqliteTable(
  'display_route_points',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tripId: text('trip_id').notNull(),
    pointIndex: integer('point_index').notNull(),
    timestamp: text('timestamp').notNull(),
    latitude: real('latitude').notNull(),
    longitude: real('longitude').notNull(),
    speedMps: real('speed_mps'),
  },
  (t) => [index('display_route_points_trip_id_idx').on(t.tripId)],
);

export const reprocessingSnapshots = sqliteTable('reprocessing_snapshots', {
  tripId: text('trip_id').primaryKey(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: text('created_at').notNull(),
});

export const pendingTripDeletions = sqliteTable('pending_trip_deletions', {
  clientTripId: text('client_trip_id').primaryKey(),
  createdAt: text('created_at').notNull(),
});

// ─── GROUPS ─────────────────────────────────────────────────────────────────

export const tripGroups = sqliteTable(
  'trip_groups',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
    syncState: text('sync_state').notNull().default('PENDING'),
  },
  (t) => [index('trip_groups_deleted_updated_idx').on(t.deletedAt, t.updatedAt)],
);

export const tripGroupMembers = sqliteTable(
  'trip_group_members',
  {
    id: text('id').primaryKey(),
    groupId: text('group_id').notNull(),
    tripClientId: text('trip_client_id').notNull(),
    orderIndex: integer('order_index').notNull(),
    addedAt: text('added_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    removedAt: text('removed_at'),
    syncState: text('sync_state').notNull().default('PENDING'),
  },
  (t) => [
    index('trip_group_members_group_idx').on(t.groupId, t.removedAt, t.orderIndex),
    index('trip_group_members_trip_idx').on(t.tripClientId, t.removedAt),
  ],
);
