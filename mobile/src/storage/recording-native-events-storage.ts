import { asc, desc } from "drizzle-orm";

import type { RecordingNativeEvent, RecordingNativeEventType } from "../domain/recording-native-event";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { recordingNativeEvents as recordingNativeEventsTable } from "./drizzle/schema";

type RecordingNativeEventRow = typeof recordingNativeEventsTable.$inferSelect;
type RecordingNativeEventInsert = typeof recordingNativeEventsTable.$inferInsert;

export interface RecordingNativeEventSummary {
  count: number;
  eventType: RecordingNativeEventType;
  lastRecordedAt: string | null;
}

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

  await runExclusiveDrizzleWrite(async (database) => {
    await database.insert(recordingNativeEventsTable).values(toRecordingNativeEventRow(event));
  });

  return event;
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

export async function loadRecordingNativeEventSummary(): Promise<RecordingNativeEventSummary[]> {
  const database = await getDrizzleDatabase();
  const rows = await database
    .select({
      eventType: recordingNativeEventsTable.eventType,
      recordedAt: recordingNativeEventsTable.recordedAt,
    })
    .from(recordingNativeEventsTable)
    .orderBy(desc(recordingNativeEventsTable.recordedAt), asc(recordingNativeEventsTable.eventType));
  const summariesByEventType = new Map<RecordingNativeEventType, RecordingNativeEventSummary>();

  for (const row of rows) {
    const eventType = row.eventType as RecordingNativeEventType;
    const summary = summariesByEventType.get(eventType);

    if (summary) {
      summary.count += 1;
      continue;
    }

    summariesByEventType.set(eventType, {
      count: 1,
      eventType,
      lastRecordedAt: row.recordedAt,
    });
  }

  return [...summariesByEventType.values()].sort((left, right) => {
    const recordedAtComparison = String(right.lastRecordedAt ?? "").localeCompare(String(left.lastRecordedAt ?? ""));

    if (recordedAtComparison !== 0) {
      return recordedAtComparison;
    }

    return left.eventType.localeCompare(right.eventType);
  });
}
