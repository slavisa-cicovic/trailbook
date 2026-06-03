import type { DiagnosticEvent } from "../domain/diagnostic-event";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

interface DiagnosticEventRow {
  category: DiagnosticEvent["category"];
  created_at: string;
  local_id: string;
  name: string;
  payload_json: string | null;
  recorded_at: string;
  segment_local_id: string | null;
  severity: DiagnosticEvent["severity"];
  trip_local_id: string | null;
}

function toDiagnosticEventRow(event: DiagnosticEvent): DiagnosticEventRow {
  return {
    category: event.category,
    created_at: event.createdAt,
    local_id: event.localId,
    name: event.name,
    payload_json: event.payload ? JSON.stringify(event.payload) : null,
    recorded_at: event.recordedAt,
    segment_local_id: event.segmentLocalId,
    severity: event.severity,
    trip_local_id: event.tripLocalId,
  };
}

function toDiagnosticEventFromRow(row: DiagnosticEventRow): DiagnosticEvent {
  return {
    category: row.category,
    createdAt: row.created_at,
    localId: row.local_id,
    name: row.name,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : null,
    recordedAt: row.recorded_at,
    segmentLocalId: row.segment_local_id,
    severity: row.severity,
    tripLocalId: row.trip_local_id,
  };
}

export async function appendDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
  const row = toDiagnosticEventRow(event);

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync(
      `INSERT OR REPLACE INTO diagnostic_events (
        local_id,
        category,
        name,
        severity,
        trip_local_id,
        segment_local_id,
        payload_json,
        recorded_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.local_id,
      row.category,
      row.name,
      row.severity,
      row.trip_local_id,
      row.segment_local_id,
      row.payload_json,
      row.recorded_at,
      row.created_at,
    );
  });
}

export async function loadRecentDiagnosticEvents(limit = 100): Promise<DiagnosticEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<DiagnosticEventRow>(
    `SELECT *
     FROM diagnostic_events
     ORDER BY recorded_at DESC, local_id DESC
     LIMIT ?`,
    limit,
  );

  return rows.map(toDiagnosticEventFromRow);
}
