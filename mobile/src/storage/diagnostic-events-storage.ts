import { desc } from "drizzle-orm";

import type { DiagnosticEvent } from "../domain/diagnostic-event";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { diagnosticEvents as diagnosticEventsTable } from "./drizzle/schema";

type DiagnosticEventRow = typeof diagnosticEventsTable.$inferSelect;
type DiagnosticEventInsert = typeof diagnosticEventsTable.$inferInsert;

function toDiagnosticEventRow(event: DiagnosticEvent): DiagnosticEventInsert {
  return {
    category: event.category,
    createdAt: event.createdAt,
    localId: event.localId,
    name: event.name,
    payloadJson: event.payload ? JSON.stringify(event.payload) : null,
    recordedAt: event.recordedAt,
    segmentLocalId: event.segmentLocalId,
    severity: event.severity,
    tripLocalId: event.tripLocalId,
  };
}

function toDiagnosticEventFromRow(row: DiagnosticEventRow): DiagnosticEvent {
  return {
    category: row.category as DiagnosticEvent["category"],
    createdAt: row.createdAt,
    localId: row.localId,
    name: row.name,
    payload: row.payloadJson ? (JSON.parse(row.payloadJson) as Record<string, unknown>) : null,
    recordedAt: row.recordedAt,
    segmentLocalId: row.segmentLocalId,
    severity: row.severity as DiagnosticEvent["severity"],
    tripLocalId: row.tripLocalId,
  };
}

function toDiagnosticEventUpdate(row: DiagnosticEventInsert): Omit<DiagnosticEventInsert, "localId"> {
  const { localId: _localId, ...update } = row;
  return update;
}

export async function appendDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
  const row = toDiagnosticEventRow(event);

  await runExclusiveDrizzleWrite(async (database) => {
    await database
      .insert(diagnosticEventsTable)
      .values(row)
      .onConflictDoUpdate({
        target: diagnosticEventsTable.localId,
        set: toDiagnosticEventUpdate(row),
      });
  });
}

export async function loadRecentDiagnosticEvents(limit = 100): Promise<DiagnosticEvent[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(diagnosticEventsTable)
    .orderBy(desc(diagnosticEventsTable.recordedAt), desc(diagnosticEventsTable.localId))
    .limit(limit);

  return rows.map(toDiagnosticEventFromRow);
}
