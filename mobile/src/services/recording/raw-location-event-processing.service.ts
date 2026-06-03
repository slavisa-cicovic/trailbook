import type { RawLocationEvent, RawLocationEventProcessingResult } from "../../domain/raw-location-event";
import type { TripPoint } from "../../domain/trips";

export interface RawProcessingResultInput {
  acceptedDecision: string;
  afterTripPoints: TripPoint[];
  beforeTripPoints?: TripPoint[];
  processedAt?: string;
  rawEvents: RawLocationEvent[];
  rejectedDecision: string;
}

function groupTripPointsByRecordedAt(tripPoints: TripPoint[]): Map<string, TripPoint[]> {
  const groupedTripPoints = new Map<string, TripPoint[]>();

  for (const tripPoint of tripPoints) {
    const existingTripPoints = groupedTripPoints.get(tripPoint.recordedAt);

    if (existingTripPoints) {
      existingTripPoints.push(tripPoint);
    } else {
      groupedTripPoints.set(tripPoint.recordedAt, [tripPoint]);
    }
  }

  for (const groupedPoints of groupedTripPoints.values()) {
    groupedPoints.sort((left, right) => left.localId.localeCompare(right.localId));
  }

  return groupedTripPoints;
}

export function sortRawLocationEvents(rawEvents: RawLocationEvent[]): RawLocationEvent[] {
  return [...rawEvents].sort((left, right) => {
    const recordedAtCompare = left.recordedAt.localeCompare(right.recordedAt);

    if (recordedAtCompare !== 0) {
      return recordedAtCompare;
    }

    if (left.batchId !== right.batchId) {
      return left.batchId.localeCompare(right.batchId);
    }

    if (left.batchIndex !== right.batchIndex) {
      return left.batchIndex - right.batchIndex;
    }

    return left.localId.localeCompare(right.localId);
  });
}

export function buildRawLocationEventProcessingResults(
  input: RawProcessingResultInput,
): RawLocationEventProcessingResult[] {
  const beforeTripPointIds = new Set((input.beforeTripPoints ?? []).map((tripPoint) => tripPoint.localId));
  const acceptedTripPointsByRecordedAt = groupTripPointsByRecordedAt(
    input.afterTripPoints.filter((tripPoint) => !beforeTripPointIds.has(tripPoint.localId)),
  );
  const afterTripPointsByRecordedAt = groupTripPointsByRecordedAt(input.afterTripPoints);
  const processedAt = input.processedAt ?? new Date().toISOString();
  const seenRawRecordedAt = new Set<string>();

  return input.rawEvents.map((event) => {
    const acceptedTripPoints = acceptedTripPointsByRecordedAt.get(event.recordedAt) ?? [];
    const acceptedTripPoint = acceptedTripPoints.shift() ?? null;

    if (acceptedTripPoint) {
      seenRawRecordedAt.add(event.recordedAt);
      return {
        acceptedTripPointLocalId: acceptedTripPoint.localId,
        localId: event.localId,
        processedAt,
        processingDecision: input.acceptedDecision,
        processingStatus: "accepted",
        segmentLocalId: acceptedTripPoint.segmentLocalId,
      };
    }

    const duplicate = afterTripPointsByRecordedAt.has(event.recordedAt) || seenRawRecordedAt.has(event.recordedAt);
    seenRawRecordedAt.add(event.recordedAt);

    return {
      acceptedTripPointLocalId: null,
      localId: event.localId,
      processedAt,
      processingDecision: duplicate ? "duplicate-recorded-at" : input.rejectedDecision,
      processingStatus: duplicate ? "duplicate" : "rejected",
      segmentLocalId: null,
    };
  });
}
