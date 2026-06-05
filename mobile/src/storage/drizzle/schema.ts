import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tripPoints = sqliteTable(
  "trip_points",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    tripLocalId: text("trip_local_id").notNull(),
    segmentLocalId: text("segment_local_id"),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    recordedAt: text("recorded_at").notNull(),
    accuracy: real("accuracy"),
    altitude: real("altitude"),
    speed: real("speed"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trip_points_trip_local_id_recorded_at").on(table.tripLocalId, table.recordedAt),
    index("idx_trip_points_user_id").on(table.userId),
  ],
);

export const trips = sqliteTable(
  "trips",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    recordingProfile: text("recording_profile").notNull(),
    recordingConfigJson: text("recording_config_json"),
    batteryStartLevelPercent: real("battery_start_level_percent"),
    batteryStartState: text("battery_start_state"),
    batteryEndLevelPercent: real("battery_end_level_percent"),
    batteryEndState: text("battery_end_state"),
    pointCount: integer("point_count"),
    distanceMeters: real("distance_meters"),
    statsUpdatedAt: text("stats_updated_at"),
    status: text("status").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trips_user_id_updated_at").on(table.userId, table.updatedAt),
  ],
);

export const tripPauses = sqliteTable(
  "trip_pauses",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    tripLocalId: text("trip_local_id").notNull(),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trip_pauses_trip_local_id_started_at").on(table.tripLocalId, table.startedAt),
  ],
);

export const tripSegments = sqliteTable(
  "trip_segments",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    tripLocalId: text("trip_local_id").notNull(),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    recordingProfile: text("recording_profile").notNull(),
    pointCount: integer("point_count"),
    distanceMeters: real("distance_meters"),
    durationMs: integer("duration_ms"),
    statsUpdatedAt: text("stats_updated_at"),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trip_segments_trip_local_id_started_at").on(table.tripLocalId, table.startedAt),
  ],
);

export const tripDiagnostics = sqliteTable("trip_diagnostics", {
  tripLocalId: text("trip_local_id").primaryKey().notNull(),
  accepted: integer("accepted").notNull(),
  acceptedAfterLongGap: integer("accepted_after_long_gap").notNull(),
  accuracyHistogramJson: text("accuracy_histogram_json").notNull(),
  backgroundAccepted: integer("background_accepted").notNull(),
  backgroundCallbacks: integer("background_callbacks").notNull(),
  backgroundRejected: integer("background_rejected").notNull(),
  callbackCount: integer("callback_count").notNull(),
  decisionCount: integer("decision_count").notNull(),
  duplicateCoordinates: integer("duplicate_coordinates").notNull(),
  duplicateTimestamp: integer("duplicate_timestamp").notNull(),
  foregroundAccepted: integer("foreground_accepted").notNull(),
  foregroundCallbacks: integer("foreground_callbacks").notNull(),
  foregroundRejected: integer("foreground_rejected").notNull(),
  maxCallbackGapMs: integer("max_callback_gap_ms").notNull(),
  maxRecordedGapMs: integer("max_recorded_gap_ms").notNull(),
  maxSilentGapMs: integer("max_silent_gap_ms").notNull(),
  platform: text("platform").notNull(),
  recentEventsJson: text("recent_events_json").notNull(),
  recordingMode: text("recording_mode").notNull(),
  rejectedByAccuracy: integer("rejected_by_accuracy").notNull(),
  rejectedByImpliedSpeed: integer("rejected_by_implied_speed").notNull(),
  rejectedByJumpDistance: integer("rejected_by_jump_distance").notNull(),
  rejectedByMinMovement: integer("rejected_by_min_movement").notNull(),
  sessionDuplicateRecordedAt: integer("session_duplicate_recorded_at").notNull(),
  silentGapCount: integer("silent_gap_count").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const waypoints = sqliteTable(
  "waypoints",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    tripLocalId: text("trip_local_id").notNull(),
    segmentLocalId: text("segment_local_id"),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_waypoints_trip_local_id_created_at").on(table.tripLocalId, table.createdAt),
  ],
);

export const waypointAttachments = sqliteTable(
  "waypoint_attachments",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    waypointLocalId: text("waypoint_local_id").notNull(),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    type: text("type").notNull(),
    localUri: text("local_uri").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_waypoint_attachments_waypoint_local_id_created_at").on(table.waypointLocalId, table.createdAt),
  ],
);

export const appKv = sqliteTable("app_kv", {
  storageKey: text("storage_key").primaryKey().notNull(),
  jsonValue: text("json_value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tripStats = sqliteTable("trip_stats", {
  tripLocalId: text("trip_local_id").primaryKey().notNull(),
  pointCount: integer("point_count").notNull(),
  distanceMeters: real("distance_meters").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tripSegmentStats = sqliteTable(
  "trip_segment_stats",
  {
    segmentLocalId: text("segment_local_id").primaryKey().notNull(),
    tripLocalId: text("trip_local_id").notNull(),
    pointCount: integer("point_count").notNull(),
    distanceMeters: real("distance_meters").notNull(),
    durationMs: integer("duration_ms").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_trip_segment_stats_trip_local_id").on(table.tripLocalId),
  ],
);

export const tripGroups = sqliteTable(
  "trip_groups",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trip_groups_user_id_deleted_at_updated_at").on(table.userId, table.deletedAt, table.updatedAt),
  ],
);

export const tripGroupMembers = sqliteTable(
  "trip_group_members",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    groupLocalId: text("group_local_id").notNull(),
    tripLocalId: text("trip_local_id").notNull(),
    deviceId: text("device_id").notNull(),
    userId: text("user_id").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
    syncStatus: text("sync_status").notNull(),
  },
  (table) => [
    index("idx_trip_group_members_user_group_deleted_sort").on(
      table.userId,
      table.groupLocalId,
      table.deletedAt,
      table.sortOrder,
    ),
    index("idx_trip_group_members_user_trip_deleted").on(table.userId, table.tripLocalId, table.deletedAt),
    uniqueIndex("idx_trip_group_members_active_trip")
      .on(table.groupLocalId, table.tripLocalId)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);

export const rawLocationEvents = sqliteTable(
  "raw_location_events",
  {
    localId: text("local_id").primaryKey().notNull(),
    tripLocalId: text("trip_local_id").notNull(),
    sessionStartedAt: text("session_started_at"),
    activeSegmentLocalId: text("active_segment_local_id"),
    batchId: text("batch_id").notNull(),
    batchIndex: integer("batch_index").notNull(),
    callbackSource: text("callback_source").notNull(),
    origin: text("origin").notNull(),
    receivedAt: text("received_at").notNull(),
    recordedAt: text("recorded_at").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    accuracy: real("accuracy"),
    altitude: real("altitude"),
    speed: real("speed"),
    processingStatus: text("processing_status").notNull(),
    processingDecision: text("processing_decision"),
    processedAt: text("processed_at"),
    acceptedTripPointLocalId: text("accepted_trip_point_local_id"),
    segmentLocalId: text("segment_local_id"),
  },
  (table) => [
    index("idx_raw_location_events_trip_recorded_at").on(table.tripLocalId, table.recordedAt, table.batchIndex),
    index("idx_raw_location_events_trip_status_recorded_at").on(
      table.tripLocalId,
      table.processingStatus,
      table.recordedAt,
    ),
    index("idx_raw_location_events_batch_id").on(table.batchId, table.batchIndex),
  ],
);

export const syncOutbox = sqliteTable(
  "sync_outbox",
  {
    id: text("id").primaryKey().notNull(),
    entityType: text("entity_type").notNull(),
    entityLocalId: text("entity_local_id").notNull(),
    operation: text("operation").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull(),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_sync_outbox_status_created_at").on(table.status, table.createdAt),
    uniqueIndex("idx_sync_outbox_pending_entity_operation")
      .on(table.entityType, table.entityLocalId, table.operation)
      .where(sql`${table.status} IN ('pending', 'running')`),
  ],
);

export const tripRouteVariants = sqliteTable(
  "trip_route_variants",
  {
    localId: text("local_id").primaryKey().notNull(),
    serverId: text("server_id"),
    tripLocalId: text("trip_local_id").notNull(),
    variantType: text("variant_type").notNull(),
    provider: text("provider").notNull(),
    geometryJson: text("geometry_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_trip_route_variants_trip_type").on(table.tripLocalId, table.variantType, table.deletedAt),
  ],
);

export const recordingNativeEvents = sqliteTable(
  "recording_native_events",
  {
    localId: text("local_id").primaryKey().notNull(),
    tripLocalId: text("trip_local_id"),
    eventType: text("event_type").notNull(),
    recordedAt: text("recorded_at").notNull(),
    payloadJson: text("payload_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_recording_native_events_trip_recorded_at").on(table.tripLocalId, table.recordedAt),
    index("idx_recording_native_events_type_recorded_at").on(table.eventType, table.recordedAt),
  ],
);

export const diagnosticEvents = sqliteTable(
  "diagnostic_events",
  {
    localId: text("local_id").primaryKey().notNull(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    severity: text("severity").notNull(),
    tripLocalId: text("trip_local_id"),
    segmentLocalId: text("segment_local_id"),
    payloadJson: text("payload_json"),
    recordedAt: text("recorded_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_diagnostic_events_recorded_at").on(table.recordedAt),
    index("idx_diagnostic_events_trip_recorded_at").on(table.tripLocalId, table.recordedAt),
    index("idx_diagnostic_events_category_severity_recorded_at").on(
      table.category,
      table.severity,
      table.recordedAt,
    ),
  ],
);
