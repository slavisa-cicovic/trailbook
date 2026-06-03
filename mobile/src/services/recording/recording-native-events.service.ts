import type { RecordingNativeEventType } from "../../domain/recording-native-event";
import { appendRecordingNativeEvent } from "../../repositories/recording-native-events-repository";

function normalizePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  return {
    ...payload,
  };
}

export function recordRecordingNativeEvent(input: {
  eventType: RecordingNativeEventType;
  payload?: Record<string, unknown> | null;
  recordedAt?: string;
  tripLocalId?: string | null;
}): Promise<void> {
  return appendRecordingNativeEvent({
    eventType: input.eventType,
    payload: normalizePayload(input.payload),
    recordedAt: input.recordedAt,
    tripLocalId: input.tripLocalId,
  })
    .then(() => undefined)
    .catch((error) => {
      console.warn("[Trailbook][recording-native-event]", {
        error: error instanceof Error ? error.message : String(error),
        eventType: input.eventType,
        step: "persist-failed",
        tripLocalId: input.tripLocalId ?? null,
      });
    });
}
