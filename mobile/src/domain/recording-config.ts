import type { RecordingProfile } from "./trips";

export interface PointFilterProfileConfig {
  maxAccuracyMeters: number;
  maxImpliedSpeedKmh: number;
  maxJumpDistanceMeters: number;
  minMovementMeters: number;
}

export type PlatformPointFilterProfiles = Partial<Record<RecordingProfile, PointFilterProfileConfig>>;
export type RecordingConfigPlatform = "ios" | "android" | "default";

export interface MobileRecordingConfig {
  version: number;
  updatedAt: string;
  pointFilters: {
    ios?: PlatformPointFilterProfiles;
    android?: PlatformPointFilterProfiles;
    default?: PlatformPointFilterProfiles;
  };
}

export interface CachedMobileRecordingConfig {
  config: MobileRecordingConfig;
  localOverrideConfig?: MobileRecordingConfig | null;
  remoteConfig?: MobileRecordingConfig;
  resolvedForUserId: string;
}
