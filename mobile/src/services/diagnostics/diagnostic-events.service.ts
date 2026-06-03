import type {
  DiagnosticEvent,
  DiagnosticEventCategory,
  DiagnosticEventSeverity,
} from "../../domain/diagnostic-event";
import {
  appendDiagnosticEvent,
  loadRecentDiagnosticEvents,
} from "../../repositories/diagnostic-events-repository";
import { scrubSupportBundleValue } from "../support/support-bundle-scrubber.service";

interface RecordDiagnosticEventInput {
  category: DiagnosticEventCategory;
  name: string;
  payload?: Record<string, unknown> | null;
  recordedAt?: string;
  segmentLocalId?: string | null;
  severity?: DiagnosticEventSeverity;
  tripLocalId?: string | null;
}

function createDiagnosticEventId(recordedAt: string): string {
  const suffix = Math.random().toString(36).slice(2, 10);

  return `diagnostic-event-${recordedAt.replace(/[:.]/g, "-")}-${suffix}`;
}

function normalizePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  return scrubSupportBundleValue(payload) as Record<string, unknown>;
}

export async function recordDiagnosticEvent(input: RecordDiagnosticEventInput): Promise<void> {
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  const event: DiagnosticEvent = {
    category: input.category,
    createdAt: new Date().toISOString(),
    localId: createDiagnosticEventId(recordedAt),
    name: input.name,
    payload: normalizePayload(input.payload),
    recordedAt,
    segmentLocalId: input.segmentLocalId ?? null,
    severity: input.severity ?? "info",
    tripLocalId: input.tripLocalId ?? null,
  };

  try {
    await appendDiagnosticEvent(event);
  } catch (error) {
    console.warn("[Trailbook][diagnostic-event] Failed to record diagnostic event", error);
  }
}

export { loadRecentDiagnosticEvents };
