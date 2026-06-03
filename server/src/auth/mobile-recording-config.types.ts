import type { UserRole } from "../users/user.types";

export type RecordingProfileConfigName = "walk" | "bike" | "drive" | "boat" | "plane";
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

export interface PointFilterProfileConfigResponse {
  maxAccuracyMeters: number;
  maxImpliedSpeedKmh: number;
  maxJumpDistanceMeters: number;
  minMovementMeters: number;
}

export type PlatformTrackingProfilesResponse = Partial<
  Record<RecordingProfileConfigName, TrackingProfileConfigResponse>
>;
export type PlatformPointFilterProfilesResponse = Partial<
  Record<RecordingProfileConfigName, PointFilterProfileConfigResponse>
>;

export interface MobileRecordingConfigResponse {
  version: number;
  updatedAt: string;
  profiles: {
    ios: PlatformTrackingProfilesResponse;
    android: PlatformTrackingProfilesResponse;
    default?: PlatformTrackingProfilesResponse;
  };
  pointFilters?: {
    ios?: PlatformPointFilterProfilesResponse;
    android?: PlatformPointFilterProfilesResponse;
    default?: PlatformPointFilterProfilesResponse;
  };
}

type PartialTrackingProfileConfig = Partial<TrackingProfileConfigResponse>;
type PartialPointFilterProfileConfig = Partial<PointFilterProfileConfigResponse>;
export type PartialPlatformTrackingProfiles = Partial<
  Record<RecordingProfileConfigName, PartialTrackingProfileConfig>
>;
export type PartialPlatformPointFilterProfiles = Partial<
  Record<RecordingProfileConfigName, PartialPointFilterProfileConfig>
>;

export interface MobileRecordingConfigOverrides {
  version?: number;
  updatedAt?: string;
  defaults?: {
    ios?: PartialPlatformTrackingProfiles;
    android?: PartialPlatformTrackingProfiles;
    default?: PartialPlatformTrackingProfiles;
  };
  pointFilters?: {
    ios?: PartialPlatformPointFilterProfiles;
    android?: PartialPlatformPointFilterProfiles;
    default?: PartialPlatformPointFilterProfiles;
  };
  roleOverrides?: Partial<
    Record<
      UserRole,
      {
        ios?: PartialPlatformTrackingProfiles;
        android?: PartialPlatformTrackingProfiles;
        default?: PartialPlatformTrackingProfiles;
        pointFilters?: {
          ios?: PartialPlatformPointFilterProfiles;
          android?: PartialPlatformPointFilterProfiles;
          default?: PartialPlatformPointFilterProfiles;
        };
      }
    >
  >;
  userOverrides?: Record<
    string,
    {
      ios?: PartialPlatformTrackingProfiles;
      android?: PartialPlatformTrackingProfiles;
      default?: PartialPlatformTrackingProfiles;
      pointFilters?: {
        ios?: PartialPlatformPointFilterProfiles;
        android?: PartialPlatformPointFilterProfiles;
        default?: PartialPlatformPointFilterProfiles;
      };
    }
  >;
  emailOverrides?: Record<
    string,
    {
      ios?: PartialPlatformTrackingProfiles;
      android?: PartialPlatformTrackingProfiles;
      default?: PartialPlatformTrackingProfiles;
      pointFilters?: {
        ios?: PartialPlatformPointFilterProfiles;
        android?: PartialPlatformPointFilterProfiles;
        default?: PartialPlatformPointFilterProfiles;
      };
    }
  >;
}
