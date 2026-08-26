import type { Result } from '@/core/common/result';
import { err, ok } from '@/core/common/result';

export const ACTIVE_RECORDING_MUTATION_ERROR =
  'A recording is in progress. Stop the recording before deleting, syncing, or reprocessing trips.';

export function recordingAllowsTripMutation(activeTripId: string | null): Result<void> {
  return activeTripId
    ? err(ACTIVE_RECORDING_MUTATION_ERROR)
    : ok(undefined);
}
