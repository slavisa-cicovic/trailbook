import type { UserRole } from "../users/user.types";

export type RecordingProfileConfigName = "walk" | "bike" | "drive" | "boat" | "plane";

export interface PointFilterProfileConfigResponse {
  maxAccuracyMeters: number;
  maxImpliedSpeedKmh: number;
  maxJumpDistanceMeters: number;
  minMovementMeters: number;
}

export type PlatformPointFilterProfilesResponse = Partial<
  Record<RecordingProfileConfigName, PointFilterProfileConfigResponse>
>;

export interface MobileRecordingConfigResponse {
  version: number;
  updatedAt: string;
  pointFilters: {
    ios?: PlatformPointFilterProfilesResponse;
    android?: PlatformPointFilterProfilesResponse;
    default?: PlatformPointFilterProfilesResponse;
  };
}

type PartialPointFilterProfileConfig = Partial<PointFilterProfileConfigResponse>;
export type PartialPlatformPointFilterProfiles = Partial<
  Record<RecordingProfileConfigName, PartialPointFilterProfileConfig>
>;

export interface MobileRecordingConfigOverrides {
  version?: number;
  updatedAt?: string;
  pointFilters?: {
    ios?: PartialPlatformPointFilterProfiles;
    android?: PartialPlatformPointFilterProfiles;
    default?: PartialPlatformPointFilterProfiles;
  };
  roleOverrides?: Partial<
    Record<
      UserRole,
      {
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
      pointFilters?: {
        ios?: PartialPlatformPointFilterProfiles;
        android?: PartialPlatformPointFilterProfiles;
        default?: PartialPlatformPointFilterProfiles;
      };
    }
  >;
}
