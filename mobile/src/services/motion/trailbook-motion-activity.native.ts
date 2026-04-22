import { requireOptionalNativeModule } from "expo-modules-core";

import type { MotionActivity } from "../../domain/motion-activity";

export interface TrailbookMotionActivityModuleType {
  getLatestActivityAsync(): Promise<MotionActivity | null>;
  isAvailableAsync(): Promise<boolean>;
  startUpdatesAsync(): Promise<void>;
  stopUpdatesAsync(): Promise<void>;
}

export default requireOptionalNativeModule<TrailbookMotionActivityModuleType>("TrailbookMotionActivity");
