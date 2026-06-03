import type { MotionActivity } from "../../domain/motion-activity";
import { normalizeMotionActivity } from "../../domain/motion-activity";
import TrailbookMotionActivity from "./trailbook-motion-activity.native";

const MOTION_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;
const MOTION_ACTIVITY_FETCH_CACHE_TTL_MS = 5 * 1000;

let cachedMotionActivity: MotionActivity | null = null;
let motionActivityCacheTimestampMs = 0;

export async function isMotionActivityAvailableAsync(): Promise<boolean> {
  if (!TrailbookMotionActivity) {
    return false;
  }

  try {
    return await TrailbookMotionActivity.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function ensureMotionActivityUpdatesForAutoMode(): Promise<boolean> {
  if (!(await isMotionActivityAvailableAsync())) {
    return false;
  }

  try {
    await TrailbookMotionActivity?.startUpdatesAsync();
    return true;
  } catch {
    return false;
  }
}

export async function stopMotionActivityUpdates(): Promise<void> {
  if (!TrailbookMotionActivity) {
    return;
  }

  try {
    await TrailbookMotionActivity.stopUpdatesAsync();
  } catch {
    // Motion updates must not break recording lifecycle.
  }
}

function applyMotionActivityAgeCheck(
  activity: MotionActivity | null,
  recordedAt: string | null,
): MotionActivity | null {
  if (!activity) {
    return null;
  }

  const motionRecordedAtMs = new Date(activity.recordedAt).getTime();
  const referenceRecordedAtMs = recordedAt ? new Date(recordedAt).getTime() : Date.now();

  if (
    Number.isNaN(motionRecordedAtMs) ||
    Number.isNaN(referenceRecordedAtMs) ||
    referenceRecordedAtMs - motionRecordedAtMs > MOTION_ACTIVITY_MAX_AGE_MS
  ) {
    return null;
  }

  return activity;
}

export async function getLatestMotionActivityAsync(
  recordedAt: string | null = null,
): Promise<MotionActivity | null> {
  if (!TrailbookMotionActivity) {
    return null;
  }

  const nowMs = Date.now();

  if (nowMs - motionActivityCacheTimestampMs < MOTION_ACTIVITY_FETCH_CACHE_TTL_MS) {
    return applyMotionActivityAgeCheck(cachedMotionActivity, recordedAt);
  }

  try {
    const latestActivity = normalizeMotionActivity(await TrailbookMotionActivity.getLatestActivityAsync());

    cachedMotionActivity = latestActivity;
    motionActivityCacheTimestampMs = Date.now();

    return applyMotionActivityAgeCheck(latestActivity, recordedAt);
  } catch {
    return null;
  }
}
