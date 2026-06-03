import type { RecordingProfile } from "./trips";

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

export interface PointFilterProfileConfig {
  maxAccuracyMeters: number;
  maxImpliedSpeedKmh: number;
  maxJumpDistanceMeters: number;
  minMovementMeters: number;
}

export type PlatformTrackingProfiles = Partial<Record<RecordingProfile, TrackingProfileConfig>>;
export type PlatformPointFilterProfiles = Partial<Record<RecordingProfile, PointFilterProfileConfig>>;
export type RecordingConfigPlatform = "ios" | "android" | "default";

export interface MobileRecordingConfig {
  version: number;
  updatedAt: string;
  profiles: {
    ios?: PlatformTrackingProfiles;
    android?: PlatformTrackingProfiles;
    default?: PlatformTrackingProfiles;
  };
  pointFilters?: {
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
