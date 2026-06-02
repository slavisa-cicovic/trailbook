import type {
  RawLocationEvent,
  RawLocationEventCallbackSource,
  RawLocationEventOrigin,
  RawLocationEventProcessingResult,
  RawLocationEventProcessingStatus,
} from "../domain/raw-location-event";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface RawLocationEventRow {
  accepted_trip_point_local_id: string | null;
  accuracy: number | null;
  active_segment_local_id: string | null;
  altitude: number | null;
  batch_id: string;
  batch_index: number;
  callback_source: RawLocationEventCallbackSource;
  latitude: number;
  local_id: string;
  longitude: number;
  origin: RawLocationEventOrigin;
  processed_at: string | null;
  processing_decision: string | null;
  processing_status: RawLocationEventProcessingStatus;
  received_at: string;
  recorded_at: string;
  segment_local_id: string | null;
  session_started_at: string | null;
  speed: number | null;
  trip_local_id: string;
}

export interface RawLocationEventTripSummary {
  acceptedCount: number;
  duplicateCount: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  pendingCount: number;
  processedCount: number;
  rejectedCount: number;
  rawEventCount: number;
  tripLocalId: string;
}

function toRow(event: RawLocationEvent): RawLocationEventRow {
  return {
    accepted_trip_point_local_id: event.acceptedTripPointLocalId,
    accuracy: event.accuracy,
    active_segment_local_id: event.activeSegmentLocalId,
    altitude: event.altitude,
    batch_id: event.batchId,
    batch_index: event.batchIndex,
    callback_source: event.callbackSource,
    latitude: event.latitude,
    local_id: event.localId,
    longitude: event.longitude,
    origin: event.origin,
    processed_at: event.processedAt,
    processing_decision: event.processingDecision,
    processing_status: event.processingStatus,
    received_at: event.receivedAt,
    recorded_at: event.recordedAt,
    segment_local_id: event.segmentLocalId,
    session_started_at: event.sessionStartedAt,
    speed: event.speed,
    trip_local_id: event.tripLocalId,
  };
}

function fromRow(row: RawLocationEventRow): RawLocationEvent {
  return {
    acceptedTripPointLocalId: row.accepted_trip_point_local_id,
    accuracy: row.accuracy,
    activeSegmentLocalId: row.active_segment_local_id,
    altitude: row.altitude,
    batchId: row.batch_id,
    batchIndex: row.batch_index,
    callbackSource: row.callback_source,
    latitude: row.latitude,
    localId: row.local_id,
    longitude: row.longitude,
    origin: row.origin,
    processedAt: row.processed_at,
    processingDecision: row.processing_decision,
    processingStatus: row.processing_status,
    receivedAt: row.received_at,
    recordedAt: row.recorded_at,
    segmentLocalId: row.segment_local_id,
    sessionStartedAt: row.session_started_at,
    speed: row.speed,
    tripLocalId: row.trip_local_id,
  };
}

export async function insertRawLocationEvents(events: RawLocationEvent[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const event of events) {
      const row = toRow(event);

      await database.runAsync(
        `INSERT OR IGNORE INTO raw_location_events (
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
        row.local_id,
        row.trip_local_id,
        row.session_started_at,
        row.active_segment_local_id,
        row.batch_id,
        row.batch_index,
        row.callback_source,
        row.origin,
        row.received_at,
        row.recorded_at,
        row.latitude,
        row.longitude,
        row.accuracy,
        row.altitude,
        row.speed,
        row.processing_status,
        row.processing_decision,
        row.processed_at,
        row.accepted_trip_point_local_id,
        row.segment_local_id,
      );
    }
  });
}

export async function updateRawLocationEventProcessingResults(
  results: RawLocationEventProcessingResult[],
): Promise<void> {
  if (results.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const result of results) {
      await database.runAsync(
        `UPDATE raw_location_events
         SET processing_status = ?,
             processing_decision = ?,
             processed_at = ?,
             accepted_trip_point_local_id = ?,
             segment_local_id = ?
         WHERE local_id = ?`,
        result.processingStatus,
        result.processingDecision,
        result.processedAt,
        result.acceptedTripPointLocalId,
        result.segmentLocalId,
        result.localId,
      );
    }
  });
}

export async function loadRawLocationEventsForTrip(tripLocalId: string): Promise<RawLocationEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<RawLocationEventRow>(
    `SELECT * FROM raw_location_events
     WHERE trip_local_id = ?
     ORDER BY recorded_at ASC, batch_index ASC, local_id ASC`,
    tripLocalId,
  );

  return rows.map(fromRow);
}

export async function loadPendingRawLocationEventsForTrip(tripLocalId: string): Promise<RawLocationEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<RawLocationEventRow>(
    `SELECT * FROM raw_location_events
     WHERE trip_local_id = ?
       AND processing_status = 'pending'
     ORDER BY recorded_at ASC, batch_index ASC, local_id ASC`,
    tripLocalId,
  );

  return rows.map(fromRow);
}

export async function loadRawLocationEventTripSummaries(): Promise<RawLocationEventTripSummary[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    accepted_count: number;
    duplicate_count: number;
    first_recorded_at: string | null;
    last_recorded_at: string | null;
    pending_count: number;
    processed_count: number;
    raw_event_count: number;
    rejected_count: number;
    trip_local_id: string;
  }>(`
    SELECT
      trip_local_id,
      COUNT(*) AS raw_event_count,
      MIN(recorded_at) AS first_recorded_at,
      MAX(recorded_at) AS last_recorded_at,
      SUM(CASE WHEN processing_status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN processing_status != 'pending' THEN 1 ELSE 0 END) AS processed_count,
      SUM(CASE WHEN processing_status = 'accepted' THEN 1 ELSE 0 END) AS accepted_count,
      SUM(CASE WHEN processing_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
      SUM(CASE WHEN processing_status = 'duplicate' THEN 1 ELSE 0 END) AS duplicate_count
    FROM raw_location_events
    GROUP BY trip_local_id
    ORDER BY last_recorded_at DESC, trip_local_id ASC
  `);

  return rows.map((row) => ({
    acceptedCount: row.accepted_count,
    duplicateCount: row.duplicate_count,
    firstRecordedAt: row.first_recorded_at,
    lastRecordedAt: row.last_recorded_at,
    pendingCount: row.pending_count,
    processedCount: row.processed_count,
    rawEventCount: row.raw_event_count,
    rejectedCount: row.rejected_count,
    tripLocalId: row.trip_local_id,
  }));
}
