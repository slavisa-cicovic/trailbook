import { asc, desc } from "drizzle-orm";

import type { RecordingNativeEvent, RecordingNativeEventType } from "../domain/recording-native-event";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { recordingNativeEvents as recordingNativeEventsTable } from "./drizzle/schema";

type RecordingNativeEventRow = typeof recordingNativeEventsTable.$inferSelect;
type RecordingNativeEventInsert = typeof recordingNativeEventsTable.$inferInsert;

function toRecordingNativeEvent(row: RecordingNativeEventRow): RecordingNativeEvent {
  return {
    createdAt: row.createdAt,
    eventType: row.eventType as RecordingNativeEventType,
    localId: row.localId,
    payload: row.payloadJson ? (JSON.parse(row.payloadJson) as Record<string, unknown>) : null,
    recordedAt: row.recordedAt,
    tripLocalId: row.tripLocalId,
  };
}

function toRecordingNativeEventRow(event: RecordingNativeEvent): RecordingNativeEventInsert {
  return {
    createdAt: event.createdAt,
    eventType: event.eventType,
    localId: event.localId,
    payloadJson: event.payload ? JSON.stringify(event.payload) : null,
    recordedAt: event.recordedAt,
    tripLocalId: event.tripLocalId,
  };
}

export async function insertRecordingNativeEventRow(event: RecordingNativeEvent): Promise<void> {
  await runExclusiveDrizzleWrite(async (database) => {
    await database.insert(recordingNativeEventsTable).values(toRecordingNativeEventRow(event));
  });
}

export async function loadRecentRecordingNativeEvents(limit = 100): Promise<RecordingNativeEvent[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(recordingNativeEventsTable)
    .orderBy(desc(recordingNativeEventsTable.recordedAt), desc(recordingNativeEventsTable.localId))
    .limit(limit);

  return rows.map(toRecordingNativeEvent);
}

export async function loadRecordingNativeEventProjection(): Promise<{ eventType: string; recordedAt: string }[]> {
  const database = await getDrizzleDatabase();
  return database
    .select({
      eventType: recordingNativeEventsTable.eventType,
      recordedAt: recordingNativeEventsTable.recordedAt,
    })
    .from(recordingNativeEventsTable)
    .orderBy(desc(recordingNativeEventsTable.recordedAt), asc(recordingNativeEventsTable.eventType));
}
