import { describe, expect, it } from "vitest";

import * as schema from "../../storage/drizzle/schema";

type DrizzleTableLike = Record<string, { name?: string } | undefined>;

function expectColumns(table: unknown, expectedColumns: Record<string, string>): void {
  const tableLike = table as DrizzleTableLike;

  for (const [propertyName, columnName] of Object.entries(expectedColumns)) {
    const column = tableLike[propertyName];

    expect(column, `missing property ${propertyName}`).toBeDefined();
    expect(column?.name, `wrong column name for ${propertyName}`).toBe(columnName);
  }
}

describe("Drizzle schema mirror contract", () => {
  it("mirrors trip metadata tables used by Drizzle repositories", () => {
    expectColumns(schema.trips, {
      batteryEndLevelPercent: "battery_end_level_percent",
      batteryEndState: "battery_end_state",
      batteryStartLevelPercent: "battery_start_level_percent",
      batteryStartState: "battery_start_state",
      createdAt: "created_at",
      deletedAt: "deleted_at",
      description: "description",
      deviceId: "device_id",
      distanceMeters: "distance_meters",
      endedAt: "ended_at",
      localId: "local_id",
      pointCount: "point_count",
      recordingConfigJson: "recording_config_json",
      recordingProfile: "recording_profile",
      serverId: "server_id",
      startedAt: "started_at",
      statsUpdatedAt: "stats_updated_at",
      status: "status",
      syncStatus: "sync_status",
      title: "title",
      updatedAt: "updated_at",
      userId: "user_id",
    });
    expectColumns(schema.tripSegments, {
      createdAt: "created_at",
      deviceId: "device_id",
      distanceMeters: "distance_meters",
      durationMs: "duration_ms",
      endedAt: "ended_at",
      localId: "local_id",
      pointCount: "point_count",
      recordingProfile: "recording_profile",
      serverId: "server_id",
      startedAt: "started_at",
      statsUpdatedAt: "stats_updated_at",
      syncStatus: "sync_status",
      tripLocalId: "trip_local_id",
      updatedAt: "updated_at",
      userId: "user_id",
    });
  });

  it("mirrors raw SQL hot-path point and raw event tables", () => {
    expectColumns(schema.tripPoints, {
      accuracy: "accuracy",
      altitude: "altitude",
      deviceId: "device_id",
      latitude: "latitude",
      localId: "local_id",
      longitude: "longitude",
      recordedAt: "recorded_at",
      segmentLocalId: "segment_local_id",
      serverId: "server_id",
      speed: "speed",
      syncStatus: "sync_status",
      tripLocalId: "trip_local_id",
      userId: "user_id",
    });
    expectColumns(schema.rawLocationEvents, {
      acceptedTripPointLocalId: "accepted_trip_point_local_id",
      accuracy: "accuracy",
      activeSegmentLocalId: "active_segment_local_id",
      altitude: "altitude",
      batchId: "batch_id",
      batchIndex: "batch_index",
      callbackSource: "callback_source",
      latitude: "latitude",
      localId: "local_id",
      longitude: "longitude",
      origin: "origin",
      processedAt: "processed_at",
      processingDecision: "processing_decision",
      processingStatus: "processing_status",
      receivedAt: "received_at",
      recordedAt: "recorded_at",
      segmentLocalId: "segment_local_id",
      sessionStartedAt: "session_started_at",
      speed: "speed",
      tripLocalId: "trip_local_id",
    });
  });

  it("mirrors waypoint and attachment tables", () => {
    expectColumns(schema.waypoints, {
      category: "category",
      createdAt: "created_at",
      deletedAt: "deleted_at",
      deviceId: "device_id",
      latitude: "latitude",
      localId: "local_id",
      longitude: "longitude",
      note: "note",
      segmentLocalId: "segment_local_id",
      serverId: "server_id",
      syncStatus: "sync_status",
      title: "title",
      tripLocalId: "trip_local_id",
      updatedAt: "updated_at",
      userId: "user_id",
    });
    expectColumns(schema.waypointAttachments, {
      createdAt: "created_at",
      deletedAt: "deleted_at",
      deviceId: "device_id",
      fileSize: "file_size",
      localId: "local_id",
      localUri: "local_uri",
      mimeType: "mime_type",
      serverId: "server_id",
      syncStatus: "sync_status",
      type: "type",
      updatedAt: "updated_at",
      userId: "user_id",
      waypointLocalId: "waypoint_local_id",
    });
  });

  it("mirrors sync and observability tables", () => {
    expectColumns(schema.syncOutbox, {
      attemptCount: "attempt_count",
      createdAt: "created_at",
      entityLocalId: "entity_local_id",
      entityType: "entity_type",
      id: "id",
      lastError: "last_error",
      operation: "operation",
      payloadJson: "payload_json",
      status: "status",
      updatedAt: "updated_at",
    });
    expectColumns(schema.diagnosticEvents, {
      category: "category",
      createdAt: "created_at",
      localId: "local_id",
      name: "name",
      payloadJson: "payload_json",
      recordedAt: "recorded_at",
      segmentLocalId: "segment_local_id",
      severity: "severity",
      tripLocalId: "trip_local_id",
    });
    expectColumns(schema.recordingNativeEvents, {
      createdAt: "created_at",
      eventType: "event_type",
      localId: "local_id",
      payloadJson: "payload_json",
      recordedAt: "recorded_at",
      tripLocalId: "trip_local_id",
    });
  });

  it("keeps high-risk legacy index names represented in the Drizzle schema contract", () => {
    expect(schema.DRIZZLE_SCHEMA_INDEX_NAMES).toEqual(
      expect.arrayContaining([
      "idx_trips_user_id_updated_at",
      "idx_trip_segments_trip_local_id_started_at",
      "idx_trip_points_trip_local_id_recorded_at",
      "idx_trip_points_user_id",
      "idx_raw_location_events_trip_recorded_at",
      "idx_raw_location_events_trip_status_recorded_at",
      "idx_raw_location_events_batch_id",
      "idx_waypoints_trip_local_id_created_at",
      "idx_waypoint_attachments_waypoint_local_id_created_at",
      "idx_sync_outbox_status_created_at",
      "idx_sync_outbox_pending_entity_operation",
      "idx_diagnostic_events_recorded_at",
      "idx_diagnostic_events_trip_recorded_at",
      "idx_diagnostic_events_category_severity_recorded_at",
      "idx_recording_native_events_trip_recorded_at",
      "idx_recording_native_events_type_recorded_at",
      ]),
    );
  });
});
