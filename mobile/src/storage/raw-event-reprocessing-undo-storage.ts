import type * as SQLite from "expo-sqlite";

import type { RawLocationEvent } from "../domain/raw-location-event";
import type { Trip, TripPoint, TripSegment, Waypoint } from "../domain/trips";
import { runExclusiveDatabaseWrite } from "./sqlite/db";

export interface RawEventReprocessingRestoreRows {
  rawEvents: RawLocationEvent[];
  trip: Trip;
  tripLocalId: string;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  waypoints: Waypoint[];
}

type WriteTransaction = SQLite.SQLiteDatabase;

async function insertTrip(transaction: WriteTransaction, trip: Trip) {
  await transaction.runAsync(
    `INSERT OR REPLACE INTO trips (
      local_id,
      server_id,
      device_id,
      user_id,
      title,
      description,
      recording_profile,
      recording_config_json,
      battery_start_level_percent,
      battery_start_state,
      battery_end_level_percent,
      battery_end_state,
      point_count,
      distance_meters,
      stats_updated_at,
      status,
      started_at,
      ended_at,
      created_at,
      updated_at,
      deleted_at,
      sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    trip.localId,
    trip.serverId,
    trip.deviceId,
    trip.userId,
    trip.title,
    trip.description,
    trip.recordingProfile,
    trip.recordingConfig ? JSON.stringify(trip.recordingConfig) : null,
    trip.batteryStartLevelPercent,
    trip.batteryStartState,
    trip.batteryEndLevelPercent,
    trip.batteryEndState,
    trip.pointCount,
    trip.distanceMeters,
    trip.statsUpdatedAt,
    trip.status,
    trip.startedAt,
    trip.endedAt,
    trip.createdAt,
    trip.updatedAt,
    trip.deletedAt,
    trip.syncStatus,
  );
}

async function insertTripSegment(transaction: WriteTransaction, tripSegment: TripSegment) {
  await transaction.runAsync(
    `INSERT INTO trip_segments (
      local_id,
      server_id,
      trip_local_id,
      device_id,
      user_id,
      recording_profile,
      point_count,
      distance_meters,
      duration_ms,
      stats_updated_at,
      started_at,
      ended_at,
      created_at,
      updated_at,
      sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tripSegment.localId,
    tripSegment.serverId,
    tripSegment.tripLocalId,
    tripSegment.deviceId,
    tripSegment.userId,
    tripSegment.recordingProfile,
    tripSegment.pointCount,
    tripSegment.distanceMeters,
    tripSegment.durationMs,
    tripSegment.statsUpdatedAt,
    tripSegment.startedAt,
    tripSegment.endedAt,
    tripSegment.createdAt,
    tripSegment.updatedAt,
    tripSegment.syncStatus,
  );
}

async function insertTripPoint(transaction: WriteTransaction, tripPoint: TripPoint) {
  await transaction.runAsync(
    `INSERT INTO trip_points (
      local_id,
      server_id,
      trip_local_id,
      segment_local_id,
      device_id,
      user_id,
      latitude,
      longitude,
      recorded_at,
      accuracy,
      altitude,
      speed,
      sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tripPoint.localId,
    tripPoint.serverId,
    tripPoint.tripLocalId,
    tripPoint.segmentLocalId,
    tripPoint.deviceId,
    tripPoint.userId,
    tripPoint.latitude,
    tripPoint.longitude,
    tripPoint.recordedAt,
    tripPoint.accuracy,
    tripPoint.altitude,
    tripPoint.speed,
    tripPoint.syncStatus,
  );
}

async function insertWaypoint(transaction: WriteTransaction, waypoint: Waypoint) {
  await transaction.runAsync(
    `INSERT OR REPLACE INTO waypoints (
      local_id,
      server_id,
      trip_local_id,
      segment_local_id,
      device_id,
      user_id,
      latitude,
      longitude,
      category,
      title,
      note,
      created_at,
      updated_at,
      deleted_at,
      sync_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    waypoint.localId,
    waypoint.serverId,
    waypoint.tripLocalId,
    waypoint.segmentLocalId,
    waypoint.deviceId,
    waypoint.userId,
    waypoint.latitude,
    waypoint.longitude,
    waypoint.category,
    waypoint.title,
    waypoint.note,
    waypoint.createdAt,
    waypoint.updatedAt,
    waypoint.deletedAt,
    waypoint.syncStatus,
  );
}

async function restoreRawLocationEventProcessingMetadata(transaction: WriteTransaction, event: RawLocationEvent) {
  const result = await transaction.runAsync(
    `UPDATE raw_location_events
     SET processing_status = ?,
         processing_decision = ?,
         processed_at = ?,
         accepted_trip_point_local_id = ?,
         segment_local_id = ?
     WHERE local_id = ?`,
    event.processingStatus,
    event.processingDecision,
    event.processedAt,
    event.acceptedTripPointLocalId,
    event.segmentLocalId,
    event.localId,
  );

  if (result.changes > 0) {
    return;
  }

  await transaction.runAsync(
    `INSERT INTO raw_location_events (
      local_id,
      trip_local_id,
      session_started_at,
      active_segment_local_id,
      batch_id,
      batch_index,
      callback_source,
      origin,
      received_at,
      recorded_at,
      latitude,
      longitude,
      accuracy,
      altitude,
      speed,
      processing_status,
      processing_decision,
      processed_at,
      accepted_trip_point_local_id,
      segment_local_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.localId,
    event.tripLocalId,
    event.sessionStartedAt,
    event.activeSegmentLocalId,
    event.batchId,
    event.batchIndex,
    event.callbackSource,
    event.origin,
    event.receivedAt,
    event.recordedAt,
    event.latitude,
    event.longitude,
    event.accuracy,
    event.altitude,
    event.speed,
    event.processingStatus,
    event.processingDecision,
    event.processedAt,
    event.acceptedTripPointLocalId,
    event.segmentLocalId,
  );
}

export async function restoreRawEventReprocessingSnapshotRows(
  rows: RawEventReprocessingRestoreRows,
): Promise<void> {
  await runExclusiveDatabaseWrite(async (transaction) => {
    await transaction.runAsync("DELETE FROM trip_segments WHERE trip_local_id = ?", rows.tripLocalId);
    await transaction.runAsync("DELETE FROM trip_points WHERE trip_local_id = ?", rows.tripLocalId);
    await transaction.runAsync("DELETE FROM trip_stats WHERE trip_local_id = ?", rows.tripLocalId);
    await transaction.runAsync("DELETE FROM trip_segment_stats WHERE trip_local_id = ?", rows.tripLocalId);

    await insertTrip(transaction, rows.trip);

    for (const tripSegment of rows.tripSegments) {
      await insertTripSegment(transaction, tripSegment);

      if (
        tripSegment.pointCount !== null &&
        tripSegment.distanceMeters !== null &&
        tripSegment.durationMs !== null &&
        tripSegment.statsUpdatedAt !== null
      ) {
        await transaction.runAsync(
          `INSERT INTO trip_segment_stats (
            segment_local_id,
            trip_local_id,
            point_count,
            distance_meters,
            duration_ms,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          tripSegment.localId,
          tripSegment.tripLocalId,
          tripSegment.pointCount,
          tripSegment.distanceMeters,
          tripSegment.durationMs,
          tripSegment.statsUpdatedAt,
        );
      }
    }

    for (const tripPoint of rows.tripPoints) {
      await insertTripPoint(transaction, tripPoint);
    }

    for (const waypoint of rows.waypoints) {
      await insertWaypoint(transaction, waypoint);
    }

    for (const event of rows.rawEvents) {
      await restoreRawLocationEventProcessingMetadata(transaction, event);
    }

    if (
      rows.trip.pointCount !== null &&
      rows.trip.distanceMeters !== null &&
      rows.trip.statsUpdatedAt !== null
    ) {
      await transaction.runAsync(
        `INSERT INTO trip_stats (
          trip_local_id,
          point_count,
          distance_meters,
          updated_at
        ) VALUES (?, ?, ?, ?)`,
        rows.tripLocalId,
        rows.trip.pointCount,
        rows.trip.distanceMeters,
        rows.trip.statsUpdatedAt,
      );
    }
  });
}
