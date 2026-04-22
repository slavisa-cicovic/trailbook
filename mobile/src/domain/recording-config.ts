import type { RecordingMode } from "./trips";

export type RecordingConfigAccuracy =
  | "lowest"
  | "low"
  | "balanced"
  | "high"
  | "highest"
  | "bestForNavigation";

export interface TrackingProfileConfig {
  accuracy: RecordingConfigAccuracy;
  distanceInterval: number;
  timeIntervalMs: number;
}

export type PlatformTrackingProfiles = Partial<Record<RecordingMode, TrackingProfileConfig>>;
export type RecordingConfigPlatform = "ios" | "android" | "default";

export interface MobileRecordingConfig {
  version: number;
  updatedAt: string;
  profiles: {
    ios?: PlatformTrackingProfiles;
    android?: PlatformTrackingProfiles;
    default?: PlatformTrackingProfiles;
  };
}

export interface CachedMobileRecordingConfig {
  resolvedForUserId: string;
  config: MobileRecordingConfig;
}
