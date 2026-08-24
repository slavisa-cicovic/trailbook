export type CaptureHealth =
  | 'inactive'
  | 'starting'
  | 'healthy'
  | 'inaccurate'
  | 'delayed'
  | 'stopped'
  | 'paused';

export const CAPTURE_DELAYED_AFTER_MS = 5 * 60 * 1000;
export const CAPTURE_STOPPED_AFTER_MS = 20 * 60 * 1000;
export const NO_ACCEPTABLE_FIX_WARNING_AFTER_MS = 2 * 60 * 1000;

export function captureHealthFromLocations(input: {
  nowMs?: number;
  firstLocationAt: Date | null;
  lastLocationAt: Date | null;
  lastAcceptedLocationAt: Date | null;
}): CaptureHealth {
  if (!input.lastLocationAt) return 'starting';

  const nowMs = input.nowMs ?? Date.now();
  const rawAgeMs = nowMs - input.lastLocationAt.getTime();
  if (rawAgeMs >= CAPTURE_STOPPED_AFTER_MS) return 'stopped';
  if (rawAgeMs >= CAPTURE_DELAYED_AFTER_MS) return 'delayed';

  if (!input.lastAcceptedLocationAt) {
    const observedDurationMs = input.firstLocationAt
      ? input.lastLocationAt.getTime() - input.firstLocationAt.getTime()
      : 0;
    return observedDurationMs >= NO_ACCEPTABLE_FIX_WARNING_AFTER_MS
      ? 'inaccurate'
      : 'starting';
  }

  if (
    input.lastLocationAt.getTime() - input.lastAcceptedLocationAt.getTime() >=
    CAPTURE_DELAYED_AFTER_MS
  ) {
    return 'inaccurate';
  }

  return 'healthy';
}
