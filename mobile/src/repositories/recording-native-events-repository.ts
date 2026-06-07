import type { RecordingNativeEvent, RecordingNativeEventType } from "../domain/recording-native-event";
import {
  insertRecordingNativeEventRow,
  loadRecentRecordingNativeEvents,
  loadRecordingNativeEventProjection,
} from "../storage/recording-native-events-storage";

export { loadRecentRecordingNativeEvents };

export interface RecordingNativeEventSummary {
  count: number;
  eventType: RecordingNativeEventType;
  lastRecordedAt: string | null;
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

  await insertRecordingNativeEventRow(event);

  return event;
}

export async function loadRecordingNativeEventSummary(): Promise<RecordingNativeEventSummary[]> {
  const rows = await loadRecordingNativeEventProjection();
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
    const recordedAtComparison = String(right.lastRecordedAt ?? "").localeCompare(
      String(left.lastRecordedAt ?? ""),
    );

    if (recordedAtComparison !== 0) {
      return recordedAtComparison;
    }

    return left.eventType.localeCompare(right.eventType);
  });
}
