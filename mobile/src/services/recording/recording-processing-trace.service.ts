import type { DiagnosticEvent } from "../../domain/diagnostic-event";
import type { RawLocationEventOrigin, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { RecordingProfile } from "../../domain/trips";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";

export type RecordingProcessingMode = "live" | "reprocess";
export type RecordingProcessingTraceSource = LocationCallbackSource | "reprocess";

export interface RecordingProcessingTrace {
  acceptedPointCount: number;
  activeProfile: RecordingProfile | null;
  batchId: string | null;
  callbackSource: RecordingProcessingTraceSource;
  durationMs?: number;
  duplicateRawEventCount: number;
  duplicateRecordedAtCount: number;
  firstRecordedAt: string | null;
  inferredProfile: RecordingProfile | null;
  inputSnapshotCount: number;
  lastRecordedAt: string | null;
  maxAcceptedGapMs: number;
  maxRawGapMs: number;
  origin: RawLocationEventOrigin | "mixed" | "reprocess" | null;
  previousProfile: RecordingProfile | null;
  processingMode: RecordingProcessingMode;
  processedAt: string;
  phaseDurationsMs?: Record<string, number>;
  rawInsertedCount: number;
  recoveredPointCount: number;
  rejectedPointCount: number;
  rejectedRawEventCount: number;
  sortedSnapshotCount: number;
  transitionAt: string | null;
  transitionChanged: boolean;
  tripLocalId: string | null;
}

export function getMaxRecordedAtGapMs(recordedAtValues: string[]): number {
  const orderedTimes = recordedAtValues
    .map((recordedAt) => new Date(recordedAt).getTime())
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  let maxGapMs = 0;

  for (let index = 1; index < orderedTimes.length; index += 1) {
    maxGapMs = Math.max(maxGapMs, orderedTimes[index] - orderedTimes[index - 1]);
  }

  return maxGapMs;
}

export function countDuplicateRecordedAtValues(recordedAtValues: string[]): number {
  const seenRecordedAt = new Set<string>();
  let duplicateCount = 0;

  for (const recordedAt of recordedAtValues) {
    if (seenRecordedAt.has(recordedAt)) {
      duplicateCount += 1;
    } else {
      seenRecordedAt.add(recordedAt);
    }
  }

  return duplicateCount;
}

export function countRawProcessingResults(
  processingResults: RawLocationEventProcessingResult[],
  processingStatus: RawLocationEventProcessingResult["processingStatus"],
): number {
  return processingResults.filter((result) => result.processingStatus === processingStatus).length;
}

export function getTraceRecordedAtRange(recordedAtValues: string[]): {
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
} {
  const sortedRecordedAtValues = [...recordedAtValues].sort();

  return {
    firstRecordedAt: sortedRecordedAtValues[0] ?? null,
    lastRecordedAt: sortedRecordedAtValues[sortedRecordedAtValues.length - 1] ?? null,
  };
}

function createTraceLocalId(trace: RecordingProcessingTrace): string {
  const identity = [
    "recording-processing-trace",
    trace.tripLocalId ?? "no-trip",
    trace.batchId ?? trace.firstRecordedAt ?? trace.processedAt,
    trace.processingMode,
  ];

  return identity.map(encodeURIComponent).join("-");
}

function toDiagnosticPayload(trace: RecordingProcessingTrace): Record<string, unknown> {
  return { ...trace };
}

export function recordRecordingProcessingTrace(trace: RecordingProcessingTrace): Promise<void> {
  const event: DiagnosticEvent = {
    category: "recording",
    createdAt: trace.processedAt,
    localId: createTraceLocalId(trace),
    name: "processing_trace",
    payload: toDiagnosticPayload(trace),
    recordedAt: trace.lastRecordedAt ?? trace.firstRecordedAt ?? trace.processedAt,
    segmentLocalId: null,
    severity: "info",
    tripLocalId: trace.tripLocalId,
  };

  return import("../../repositories/diagnostic-events-repository")
    .then(({ appendDiagnosticEvent }) => appendDiagnosticEvent(event))
    .catch((error) => {
      console.warn("[Trailbook][recording-processing-trace]", {
        error: error instanceof Error ? error.message : String(error),
        step: "persist-failed",
        tripLocalId: trace.tripLocalId,
      });
    });
}
