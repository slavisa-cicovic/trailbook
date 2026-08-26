import type { RawSessionEvent } from '@/core/domain/model/rawSamples';
import type { Trip } from '@/core/domain/model/trip';

export type RecordingRecoveryState = 'inactive' | 'paused' | 'recording';

export function recordingRecoveryState(
  trip: Trip,
  latestLifecycleEvent: RawSessionEvent | null,
): RecordingRecoveryState {
  if (trip.status === 'COMPLETED' || trip.endedAt) return 'inactive';

  switch (latestLifecycleEvent?.type) {
    case 'RECORDING_STOPPED':
      return 'inactive';
    case 'RECORDING_PAUSED':
      return 'paused';
    case 'RECORDING_STARTED':
    case 'RECORDING_RESUMED':
      return 'recording';
    default:
      return trip.status === 'PAUSED' ? 'paused' : 'recording';
  }
}
