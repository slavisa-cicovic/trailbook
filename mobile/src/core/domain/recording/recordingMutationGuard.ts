import type { Result } from '@/core/common/result';
import { getActiveRecordingTripId } from '@/core/data/location/activeTripStore';
import { recordingAllowsTripMutation } from './recordingMutationPolicy';

export async function requireNoActiveRecording(): Promise<Result<void>> {
  try {
    return recordingAllowsTripMutation(await getActiveRecordingTripId());
  } catch {
    // Fail closed: destructive/network work must not proceed when recording
    // state cannot be verified.
    return recordingAllowsTripMutation('unknown-active-state');
  }
}
