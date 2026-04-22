import { Injectable } from "@nestjs/common";

import type { AuthUserResponse } from "./auth.types";
import type {
  MobileRecordingConfigOverrides,
  MobileRecordingConfigResponse,
  PartialPlatformTrackingProfiles,
  PlatformTrackingProfilesResponse,
  TrackingProfileConfigResponse,
} from "./mobile-recording-config.types";

const BUILT_IN_RECORDING_CONFIG: MobileRecordingConfigResponse = {
  version: 1,
  updatedAt: "2026-04-22T00:00:00.000Z",
  profiles: {
    ios: {
      auto: { accuracy: "high", distanceInterval: 12, timeIntervalMs: 12_000 },
      walk: { accuracy: "high", distanceInterval: 12, timeIntervalMs: 15_000 },
      bike: { accuracy: "high", distanceInterval: 15, timeIntervalMs: 20_000 },
      drive: { accuracy: "high", distanceInterval: 50, timeIntervalMs: 30_000 },
      boat: { accuracy: "balanced", distanceInterval: 180, timeIntervalMs: 240_000 },
      plane: { accuracy: "low", distanceInterval: 1000, timeIntervalMs: 600_000 },
    },
    android: {
      auto: { accuracy: "balanced", distanceInterval: 25, timeIntervalMs: 20_000 },
      walk: { accuracy: "high", distanceInterval: 5, timeIntervalMs: 5_000 },
      bike: { accuracy: "high", distanceInterval: 15, timeIntervalMs: 20_000 },
      drive: { accuracy: "high", distanceInterval: 50, timeIntervalMs: 30_000 },
      boat: { accuracy: "balanced", distanceInterval: 180, timeIntervalMs: 240_000 },
      plane: { accuracy: "low", distanceInterval: 1000, timeIntervalMs: 600_000 },
    },
  },
};

@Injectable()
export class MobileRecordingConfigService {
  private readonly envOverrides = this.parseEnvOverrides();

  getResolvedConfigForUser(user: AuthUserResponse | null): MobileRecordingConfigResponse {
    const defaultProfiles = this.mergeProfiles(
      this.cloneProfiles(BUILT_IN_RECORDING_CONFIG.profiles.default),
      this.envOverrides.defaults?.default,
    );
    const iosProfiles = this.mergeProfiles(
      this.cloneProfiles(BUILT_IN_RECORDING_CONFIG.profiles.ios),
      this.envOverrides.defaults?.ios,
    );
    const androidProfiles = this.mergeProfiles(
      this.cloneProfiles(BUILT_IN_RECORDING_CONFIG.profiles.android),
      this.envOverrides.defaults?.android,
    );

    if (user) {
      const roleOverrides = this.envOverrides.roleOverrides?.[user.role];
      this.mergeProfiles(iosProfiles, roleOverrides?.ios);
      this.mergeProfiles(androidProfiles, roleOverrides?.android);
      this.mergeProfiles(defaultProfiles, roleOverrides?.default);

      const userOverrides = this.envOverrides.userOverrides?.[user.id];
      this.mergeProfiles(iosProfiles, userOverrides?.ios);
      this.mergeProfiles(androidProfiles, userOverrides?.android);
      this.mergeProfiles(defaultProfiles, userOverrides?.default);

      const emailOverrides = this.envOverrides.emailOverrides?.[user.email.trim().toLowerCase()];
      this.mergeProfiles(iosProfiles, emailOverrides?.ios);
      this.mergeProfiles(androidProfiles, emailOverrides?.android);
      this.mergeProfiles(defaultProfiles, emailOverrides?.default);
    }

    return {
      version: this.envOverrides.version ?? BUILT_IN_RECORDING_CONFIG.version,
      updatedAt: this.normalizeUpdatedAt(
        this.envOverrides.updatedAt ?? BUILT_IN_RECORDING_CONFIG.updatedAt,
        BUILT_IN_RECORDING_CONFIG.updatedAt,
      ),
      profiles: {
        ios: this.mergeProfiles(iosProfiles, defaultProfiles),
        android: this.mergeProfiles(androidProfiles, defaultProfiles),
      },
    };
  }

  private cloneProfiles(
    profiles: PlatformTrackingProfilesResponse | undefined,
  ): PlatformTrackingProfilesResponse {
    if (!profiles) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(profiles).map(([mode, config]) => [mode, { ...config }]),
    ) as PlatformTrackingProfilesResponse;
  }

  private mergeProfiles(
    baseProfiles: PlatformTrackingProfilesResponse,
    overrides: PartialPlatformTrackingProfiles | undefined,
  ): PlatformTrackingProfilesResponse {
    if (!overrides) {
      return baseProfiles;
    }

    for (const [mode, override] of Object.entries(overrides)) {
      if (!override) {
        continue;
      }

      const existing = baseProfiles[mode as keyof PlatformTrackingProfilesResponse];
      const normalized = this.normalizeTrackingProfile(override as Partial<TrackingProfileConfigResponse>, existing);

      if (normalized) {
        baseProfiles[mode as keyof PlatformTrackingProfilesResponse] = normalized;
      }
    }

    return baseProfiles;
  }

  private normalizeTrackingProfile(
    config: Partial<TrackingProfileConfigResponse>,
    fallback: TrackingProfileConfigResponse | undefined,
  ): TrackingProfileConfigResponse | null {
    const accuracy = this.normalizeAccuracy(config.accuracy, fallback?.accuracy);
    const distanceInterval = this.normalizeInterval(config.distanceInterval, fallback?.distanceInterval);
    const timeIntervalMs = this.normalizeInterval(config.timeIntervalMs, fallback?.timeIntervalMs);

    if (!accuracy || distanceInterval === null || timeIntervalMs === null) {
      return fallback ? { ...fallback } : null;
    }

    return {
      accuracy,
      distanceInterval,
      timeIntervalMs,
    };
  }

  private normalizeAccuracy(
    value: string | undefined,
    fallback: TrackingProfileConfigResponse["accuracy"] | undefined,
  ): TrackingProfileConfigResponse["accuracy"] | null {
    switch (value) {
      case "lowest":
      case "low":
      case "balanced":
      case "high":
      case "highest":
      case "bestForNavigation":
        return value;
      default:
        return fallback ?? null;
    }
  }

  private normalizeInterval(value: number | undefined, fallback: number | undefined): number | null {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }

    return typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0 ? fallback : null;
  }

  private normalizeUpdatedAt(value: string, fallback: string): string {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? fallback : new Date(timestamp).toISOString();
  }

  private parseEnvOverrides(): MobileRecordingConfigOverrides {
    const rawValue = process.env.MOBILE_RECORDING_CONFIG_JSON;

    if (!rawValue) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawValue) as MobileRecordingConfigOverrides;

      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      return parsed;
    } catch {
      return {};
    }
  }
}
