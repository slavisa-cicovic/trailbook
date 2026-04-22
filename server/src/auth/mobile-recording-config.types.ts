import type { UserRole } from "../users/user.types";

export type RecordingModeConfigName = "auto" | "walk" | "bike" | "drive" | "boat" | "plane";
export type RecordingConfigAccuracy =
  | "lowest"
  | "low"
  | "balanced"
  | "high"
  | "highest"
  | "bestForNavigation";

export interface TrackingProfileConfigResponse {
  accuracy: RecordingConfigAccuracy;
  distanceInterval: number;
  timeIntervalMs: number;
}

export type PlatformTrackingProfilesResponse = Partial<
  Record<RecordingModeConfigName, TrackingProfileConfigResponse>
>;

export interface MobileRecordingConfigResponse {
  version: number;
  updatedAt: string;
  profiles: {
    ios: PlatformTrackingProfilesResponse;
    android: PlatformTrackingProfilesResponse;
    default?: PlatformTrackingProfilesResponse;
  };
}

type PartialTrackingProfileConfig = Partial<TrackingProfileConfigResponse>;
export type PartialPlatformTrackingProfiles = Partial<
  Record<RecordingModeConfigName, PartialTrackingProfileConfig>
>;

export interface MobileRecordingConfigOverrides {
  version?: number;
  updatedAt?: string;
  defaults?: {
    ios?: PartialPlatformTrackingProfiles;
    android?: PartialPlatformTrackingProfiles;
    default?: PartialPlatformTrackingProfiles;
  };
  roleOverrides?: Partial<
    Record<
      UserRole,
      {
        ios?: PartialPlatformTrackingProfiles;
        android?: PartialPlatformTrackingProfiles;
        default?: PartialPlatformTrackingProfiles;
      }
    >
  >;
  userOverrides?: Record<
    string,
    {
      ios?: PartialPlatformTrackingProfiles;
      android?: PartialPlatformTrackingProfiles;
      default?: PartialPlatformTrackingProfiles;
    }
  >;
  emailOverrides?: Record<
    string,
    {
      ios?: PartialPlatformTrackingProfiles;
      android?: PartialPlatformTrackingProfiles;
      default?: PartialPlatformTrackingProfiles;
    }
  >;
}
