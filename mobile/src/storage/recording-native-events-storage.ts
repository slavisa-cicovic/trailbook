import type { RecordingNativeEvent, RecordingNativeEventType } from "../domain/recording-native-event";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface RecordingNativeEventRow {
  created_at: string;
  event_type: RecordingNativeEventType;
  local_id: string;
  payload_json: string | null;
  recorded_at: string;
  trip_local_id: string | null;
}

export interface RecordingNativeEventSummary {
  count: number;
  eventType: RecordingNativeEventType;
  lastRecordedAt: string | null;
}

function toRecordingNativeEvent(row: RecordingNativeEventRow): RecordingNativeEvent {
  return {
    createdAt: row.created_at,
    eventType: row.event_type,
    localId: row.local_id,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : null,
    recordedAt: row.recorded_at,
    tripLocalId: row.trip_local_id,
  };
}

function createRecordingNativeEventLocalId(now: string): string {
  return `recording-native-event-${encodeURIComponent(now)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendRecordingNativeEvent(input: {
  eventType: RecordingNativeEventType;
  payload?: Record<string, unknown> | null;
  recordedAt?: string;
  tripLocalId?: string | null;
}): Promise<RecordingNativeEvent> {
  const now = new Date().toISOString();
  const event: RecordingNativeEvent = {
    createdAt: now,
    eventType: input.eventType,
    localId: createRecordingNativeEventLocalId(now),
    payload: input.payload ?? null,
    recordedAt: input.recordedAt ?? now,
    tripLocalId: input.tripLocalId ?? null,
  };

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `INSERT INTO recording_native_events (
        local_id,
        trip_local_id,
        event_type,
        recorded_at,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      event.localId,
      event.tripLocalId,
      event.eventType,
      event.recordedAt,
      event.payload ? JSON.stringify(event.payload) : null,
      event.createdAt,
    );
  });

  return event;
}

export async function loadRecentRecordingNativeEvents(limit = 100): Promise<RecordingNativeEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<RecordingNativeEventRow>(
    `SELECT *
     FROM recording_native_events
     ORDER BY recorded_at DESC, local_id DESC
     LIMIT ?`,
    limit,
  );

  return rows.map(toRecordingNativeEvent);
}

export async function loadRecordingNativeEventSummary(): Promise<RecordingNativeEventSummary[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    count: number;
    event_type: RecordingNativeEventType;
    last_recorded_at: string | null;
  }>(
    `SELECT event_type, COUNT(*) as count, MAX(recorded_at) as last_recorded_at
     FROM recording_native_events
     GROUP BY event_type
     ORDER BY last_recorded_at DESC, event_type ASC`,
  );

  return rows.map((row) => ({
    count: row.count,
    eventType: row.event_type,
    lastRecordedAt: row.last_recorded_at,
  }));
}
