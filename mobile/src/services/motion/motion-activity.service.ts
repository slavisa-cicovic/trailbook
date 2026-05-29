import { PermissionsAndroid, Platform } from "react-native";

import type { MotionActivity } from "../../domain/motion-activity";
import { normalizeMotionActivity } from "../../domain/motion-activity";
import TrailbookMotionActivity from "./trailbook-motion-activity.native";

const MOTION_ACTIVITY_MAX_AGE_MS = 10 * 60 * 1000;

export async function getMotionActivityAccess(): Promise<boolean> {
  if (!(await isMotionActivityAvailableAsync())) {
    return true;
  }

  if (Platform.OS !== "android") {
    return true;
  }

  if (typeof Platform.Version === "number" && Platform.Version < 29) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;

  if (!permission) {
    return true;
  }

  return PermissionsAndroid.check(permission);
}

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

  if (!(await getMotionActivityAccess())) {
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

export async function getLatestMotionActivityAsync(
  recordedAt: string | null = null,
): Promise<MotionActivity | null> {
  if (!TrailbookMotionActivity) {
    return null;
  }

  try {
    const latestActivity = normalizeMotionActivity(await TrailbookMotionActivity.getLatestActivityAsync());

    if (!latestActivity) {
      return null;
    }

    const motionRecordedAtMs = new Date(latestActivity.recordedAt).getTime();
    const referenceRecordedAtMs = recordedAt ? new Date(recordedAt).getTime() : Date.now();

    if (
      Number.isNaN(motionRecordedAtMs) ||
      Number.isNaN(referenceRecordedAtMs) ||
      referenceRecordedAtMs - motionRecordedAtMs > MOTION_ACTIVITY_MAX_AGE_MS
    ) {
      return null;
    }

    return latestActivity;
  } catch {
    return null;
  }
}
