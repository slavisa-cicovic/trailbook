import type { RawLocationEvent, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { TripPoint } from "../../domain/trips";

export const STORAGE_BENCHMARK_PREFIX = "storage-benchmark";
export const STORAGE_BENCHMARK_DEVICE_ID = `${STORAGE_BENCHMARK_PREFIX}-device`;
export const STORAGE_BENCHMARK_USER_ID = `${STORAGE_BENCHMARK_PREFIX}-user`;

interface BenchmarkIds {
  batchId: string;
  segmentLocalId: string;
  tripLocalId: string;
}

interface GenerateBenchmarkRowsInput {
  batchId?: string;
  count: number;
  segmentLocalId: string;
  tripLocalId: string;
}

export function createStorageBenchmarkIds(runId = new Date().toISOString().replace(/[:.]/g, "-")): BenchmarkIds {
  return {
    batchId: `${STORAGE_BENCHMARK_PREFIX}-batch-${runId}`,
    segmentLocalId: `${STORAGE_BENCHMARK_PREFIX}-segment-${runId}`,
    tripLocalId: `${STORAGE_BENCHMARK_PREFIX}-trip-${runId}`,
  };
}

export function generateBenchmarkTripPoints({
  count,
  segmentLocalId,
  tripLocalId,
}: GenerateBenchmarkRowsInput): TripPoint[] {
  const startTime = Date.UTC(2026, 0, 1, 8, 0, 0);

  return Array.from({ length: count }, (_, index) => ({
    accuracy: 6 + (index % 4),
    altitude: 110 + (index % 30),
    deviceId: STORAGE_BENCHMARK_DEVICE_ID,
    latitude: 45.014 + index * 0.00008,
    localId: `${tripLocalId}-point-${index.toString().padStart(5, "0")}`,
    longitude: 19.811 + index * 0.00011,
    recordedAt: new Date(startTime + index * 1000).toISOString(),
    segmentLocalId,
    serverId: null,
    speed: 7.5,
    syncStatus: "local-only",
    tripLocalId,
    userId: STORAGE_BENCHMARK_USER_ID,
  }));
}

export function generateBenchmarkRawEvents({
  batchId,
  count,
  segmentLocalId,
  tripLocalId,
}: GenerateBenchmarkRowsInput): RawLocationEvent[] {
  const startTime = Date.UTC(2026, 0, 1, 8, 0, 0);
  const resolvedBatchId = batchId ?? `${tripLocalId}-batch`;

  return Array.from({ length: count }, (_, index) => {
    const recordedAt = new Date(startTime + index * 1000).toISOString();

    return {
      acceptedTripPointLocalId: null,
      accuracy: 7 + (index % 5),
      activeSegmentLocalId: segmentLocalId,
      altitude: 105 + (index % 20),
      batchId: resolvedBatchId,
      batchIndex: index,
      callbackSource: "background",
      latitude: 45.015 + index * 0.00008,
      localId: `${tripLocalId}-raw-${index.toString().padStart(5, "0")}`,
      longitude: 19.812 + index * 0.00011,
      origin: "device",
      processedAt: null,
      processingDecision: null,
      processingStatus: "pending",
      receivedAt: recordedAt,
      recordedAt,
      segmentLocalId: null,
      sessionStartedAt: new Date(startTime).toISOString(),
      speed: 7.5,
      tripLocalId,
    };
  });
}

export function generateBenchmarkRawEventProcessingResults(
  events: RawLocationEvent[],
  segmentLocalId: string,
): RawLocationEventProcessingResult[] {
  const processedAt = new Date().toISOString();

  return events.map((event, index) => ({
    acceptedTripPointLocalId: `${event.tripLocalId}-accepted-${index.toString().padStart(5, "0")}`,
    localId: event.localId,
    processedAt,
    processingDecision: "benchmark-accepted",
    processingStatus: "accepted",
    segmentLocalId,
  }));
}
