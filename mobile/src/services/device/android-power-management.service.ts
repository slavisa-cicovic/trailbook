import Constants from "expo-constants";
import { Platform } from "react-native";

import TrailbookMotionActivityModule from "../motion/trailbook-motion-activity.native";

const RUNS_IN_EXPO_GO = Constants.executionEnvironment === "storeClient";

export interface AndroidRecordingEnvironmentStatus {
  activityRecognitionPermissionGranted: boolean;
  backgroundLocationPermissionGranted: boolean;
  batteryOptimizationIgnored: boolean;
  coarseLocationPermissionGranted: boolean;
  fineLocationPermissionGranted: boolean;
  foregroundServiceLocationPermissionGranted: boolean;
  locationEnabled: boolean;
  notificationPermissionGranted: boolean;
  packageName: string;
  standbyBucket: string | null;
}

export function isAndroidBatteryOptimizationStatusSupported(): boolean {
  return (
    Platform.OS === "android" &&
    !RUNS_IN_EXPO_GO &&
    typeof TrailbookMotionActivityModule?.isIgnoringBatteryOptimizationsAsync === "function"
  );
}

export async function isAndroidBatteryOptimizationIgnoredAsync(): Promise<boolean> {
  if (!isAndroidBatteryOptimizationStatusSupported()) {
    return true;
  }

  try {
    return (await TrailbookMotionActivityModule?.isIgnoringBatteryOptimizationsAsync?.()) ?? true;
  } catch {
    return false;
  }
}

export async function openAndroidBatteryOptimizationSettingsAsync(): Promise<void> {
  if (!isAndroidBatteryOptimizationStatusSupported()) {
    return;
  }

  await TrailbookMotionActivityModule?.openBatteryOptimizationSettingsAsync?.();
}

export async function getAndroidRecordingEnvironmentStatusAsync(): Promise<AndroidRecordingEnvironmentStatus | null> {
  if (
    Platform.OS !== "android" ||
    RUNS_IN_EXPO_GO ||
    typeof TrailbookMotionActivityModule?.getAndroidRecordingEnvironmentAsync !== "function"
  ) {
    return null;
  }

  try {
    return await TrailbookMotionActivityModule.getAndroidRecordingEnvironmentAsync();
  } catch {
    return null;
  }
}
