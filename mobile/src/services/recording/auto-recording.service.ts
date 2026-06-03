import type { AutoLocationPoint } from "./auto-recording.utils";

export type { AutoLocationPoint };
export type { AutoBatchProfileSection } from "./auto-recording-batch.service";
export type { AutoRecordingTransitionResult } from "./auto-recording-transition.service";

export { buildAutoBatchProfileSections } from "./auto-recording-batch.service";
export { inferAutoRecordingProfile } from "./auto-recording-inference.service";
export { applyAutoRecordingTransition, applyBatchAutoTransitionIfNeeded } from "./auto-recording-transition.service";

const AUTO_RAW_SAMPLE_MAX_AGE_MS = 15 * 60 * 1000;
const AUTO_RAW_SAMPLE_MAX_COUNT = 240;

const rawAutoSamplesByTripLocalId = new Map<string, AutoLocationPoint[]>();

export function recordAutoRecordingSample(
  tripLocalId: string,
  snapshot: AutoLocationPoint,
): AutoLocationPoint[] {
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  if (Number.isNaN(recordedAtMs)) {
    return rawAutoSamplesByTripLocalId.get(tripLocalId) ?? [];
  }

  const existingSamples = rawAutoSamplesByTripLocalId.get(tripLocalId) ?? [];
  const deduplicatedSamples = existingSamples.filter((sample) => sample.recordedAt !== snapshot.recordedAt);
  const minRecordedAtMs = recordedAtMs - AUTO_RAW_SAMPLE_MAX_AGE_MS;
  const nextSamples = [...deduplicatedSamples, snapshot]
    .filter((sample) => new Date(sample.recordedAt).getTime() >= minRecordedAtMs)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .slice(-AUTO_RAW_SAMPLE_MAX_COUNT);

  rawAutoSamplesByTripLocalId.set(tripLocalId, nextSamples);
  return nextSamples;
}

export function clearAutoRecordingSamples(tripLocalId: string) {
  rawAutoSamplesByTripLocalId.delete(tripLocalId);
}

export function clearAllAutoRecordingSamples(): void {
  rawAutoSamplesByTripLocalId.clear();
}
