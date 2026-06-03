import { requireOptionalNativeModule } from "expo-modules-core";

import type { MotionActivity } from "../../domain/motion-activity";

export interface TrailbookMotionActivityModuleType {
  getAndroidRecordingEnvironmentAsync?(): Promise<{
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
  }>;
  getLatestActivityAsync(): Promise<MotionActivity | null>;
  isIgnoringBatteryOptimizationsAsync?(): Promise<boolean>;
  isAvailableAsync(): Promise<boolean>;
  openBatteryOptimizationSettingsAsync?(): Promise<void>;
  startUpdatesAsync(): Promise<void>;
  stopUpdatesAsync(): Promise<void>;
}

export default requireOptionalNativeModule<TrailbookMotionActivityModuleType>("TrailbookMotionActivity");
