import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { AuthUserResponse } from "./auth.types";
import type {
  MobileRecordingConfigOverrides,
  MobileRecordingConfigResponse,
  PartialPlatformPointFilterProfiles,
  PartialPlatformTrackingProfiles,
  PlatformPointFilterProfilesResponse,
  PlatformTrackingProfilesResponse,
  PointFilterProfileConfigResponse,
  TrackingProfileConfigResponse,
} from "./mobile-recording-config.types";

const BUILT_IN_RECORDING_CONFIG: MobileRecordingConfigResponse = {
  version: 2,
  updatedAt: "2026-04-26T00:00:00.000Z",
  profiles: {
    ios: {
      auto: { accuracy: "high", distanceInterval: 12, timeIntervalMs: 12_000 },
      walk: { accuracy: "high", distanceInterval: 12, timeIntervalMs: 15_000 },
      bike: { accuracy: "high", distanceInterval: 15, timeIntervalMs: 15_000 },
      drive: { accuracy: "high", distanceInterval: 10, timeIntervalMs: 5_000 },
      boat: { accuracy: "balanced", distanceInterval: 180, timeIntervalMs: 240_000 },
      plane: { accuracy: "low", distanceInterval: 1000, timeIntervalMs: 600_000 },
    },
    android: {
      auto: { accuracy: "balanced", distanceInterval: 25, timeIntervalMs: 20_000 },
      walk: { accuracy: "high", distanceInterval: 5, timeIntervalMs: 5_000 },
      bike: { accuracy: "bestForNavigation", distanceInterval: 10, timeIntervalMs: 5_000 },
      drive: { accuracy: "bestForNavigation", distanceInterval: 10, timeIntervalMs: 5_000 },
      boat: { accuracy: "balanced", distanceInterval: 180, timeIntervalMs: 240_000 },
      plane: { accuracy: "low", distanceInterval: 1000, timeIntervalMs: 600_000 },
    },
  },
  pointFilters: {
    ios: {
      auto: { maxAccuracyMeters: 45, maxJumpDistanceMeters: 180, maxImpliedSpeedKmh: 70, minMovementMeters: 10 },
      walk: { maxAccuracyMeters: 35, maxJumpDistanceMeters: 120, maxImpliedSpeedKmh: 12, minMovementMeters: 8 },
      bike: { maxAccuracyMeters: 30, maxJumpDistanceMeters: 400, maxImpliedSpeedKmh: 55, minMovementMeters: 25 },
      drive: { maxAccuracyMeters: 80, maxJumpDistanceMeters: 2500, maxImpliedSpeedKmh: 180, minMovementMeters: 30 },
      boat: { maxAccuracyMeters: 120, maxJumpDistanceMeters: 5000, maxImpliedSpeedKmh: 90, minMovementMeters: 40 },
      plane: {
        maxAccuracyMeters: 1_000_000,
        maxJumpDistanceMeters: 1_000_000,
        maxImpliedSpeedKmh: 10_000,
        minMovementMeters: 150,
      },
    },
    android: {
      auto: { maxAccuracyMeters: 45, maxJumpDistanceMeters: 180, maxImpliedSpeedKmh: 70, minMovementMeters: 10 },
      walk: { maxAccuracyMeters: 50, maxJumpDistanceMeters: 120, maxImpliedSpeedKmh: 12, minMovementMeters: 4 },
      bike: { maxAccuracyMeters: 80, maxJumpDistanceMeters: 400, maxImpliedSpeedKmh: 55, minMovementMeters: 25 },
      drive: { maxAccuracyMeters: 80, maxJumpDistanceMeters: 2500, maxImpliedSpeedKmh: 180, minMovementMeters: 30 },
      boat: { maxAccuracyMeters: 120, maxJumpDistanceMeters: 5000, maxImpliedSpeedKmh: 90, minMovementMeters: 40 },
      plane: {
        maxAccuracyMeters: 1_000_000,
        maxJumpDistanceMeters: 1_000_000,
        maxImpliedSpeedKmh: 10_000,
        minMovementMeters: 150,
      },
    },
  },
};

@Injectable()
export class MobileRecordingConfigService {
  private static readonly DEFAULT_CONFIG_ID = "default";

  private readonly envOverrides = this.parseEnvOverrides();

  constructor(@Inject(DatabaseService) private readonly databaseService: DatabaseService) {}

  async getResolvedConfigForUser(user: AuthUserResponse | null): Promise<MobileRecordingConfigResponse> {
    const baseConfig = await this.getBaseConfig();
    const defaultProfiles = this.mergeProfiles(
      this.cloneProfiles(baseConfig.profiles.default),
      this.envOverrides.defaults?.default,
    );
    const iosProfiles = this.mergeProfiles(
      this.cloneProfiles(baseConfig.profiles.ios),
      this.envOverrides.defaults?.ios,
    );
    const androidProfiles = this.mergeProfiles(
      this.cloneProfiles(baseConfig.profiles.android),
      this.envOverrides.defaults?.android,
    );
    const defaultPointFilters = this.mergePointFilters(
      this.clonePointFilters(baseConfig.pointFilters?.default),
      this.envOverrides.pointFilters?.default,
    );
    const iosPointFilters = this.mergePointFilters(
      this.clonePointFilters(baseConfig.pointFilters?.ios),
      this.envOverrides.pointFilters?.ios,
    );
    const androidPointFilters = this.mergePointFilters(
      this.clonePointFilters(baseConfig.pointFilters?.android),
      this.envOverrides.pointFilters?.android,
    );

    if (user) {
      const roleOverrides = this.envOverrides.roleOverrides?.[user.role];
      this.mergeProfiles(iosProfiles, roleOverrides?.ios);
      this.mergeProfiles(androidProfiles, roleOverrides?.android);
      this.mergeProfiles(defaultProfiles, roleOverrides?.default);
      this.mergePointFilters(iosPointFilters, roleOverrides?.pointFilters?.ios);
      this.mergePointFilters(androidPointFilters, roleOverrides?.pointFilters?.android);
      this.mergePointFilters(defaultPointFilters, roleOverrides?.pointFilters?.default);

      const userOverrides = this.envOverrides.userOverrides?.[user.id];
      this.mergeProfiles(iosProfiles, userOverrides?.ios);
      this.mergeProfiles(androidProfiles, userOverrides?.android);
      this.mergeProfiles(defaultProfiles, userOverrides?.default);
      this.mergePointFilters(iosPointFilters, userOverrides?.pointFilters?.ios);
      this.mergePointFilters(androidPointFilters, userOverrides?.pointFilters?.android);
      this.mergePointFilters(defaultPointFilters, userOverrides?.pointFilters?.default);

      const emailOverrides = this.envOverrides.emailOverrides?.[user.email.trim().toLowerCase()];
      this.mergeProfiles(iosProfiles, emailOverrides?.ios);
      this.mergeProfiles(androidProfiles, emailOverrides?.android);
      this.mergeProfiles(defaultProfiles, emailOverrides?.default);
      this.mergePointFilters(iosPointFilters, emailOverrides?.pointFilters?.ios);
      this.mergePointFilters(androidPointFilters, emailOverrides?.pointFilters?.android);
      this.mergePointFilters(defaultPointFilters, emailOverrides?.pointFilters?.default);
    }

    return {
      version: this.envOverrides.version ?? baseConfig.version,
      updatedAt: this.normalizeUpdatedAt(
        this.envOverrides.updatedAt ?? baseConfig.updatedAt,
        baseConfig.updatedAt,
      ),
      profiles: {
        ios: this.mergeProfiles(iosProfiles, defaultProfiles),
        android: this.mergeProfiles(androidProfiles, defaultProfiles),
      },
      pointFilters: {
        ios: this.mergePointFilters(iosPointFilters, defaultPointFilters),
        android: this.mergePointFilters(androidPointFilters, defaultPointFilters),
      },
    };
  }

  private async getBaseConfig(): Promise<MobileRecordingConfigResponse> {
    const record = await this.databaseService.mobileRecordingConfig.upsert({
      where: { id: MobileRecordingConfigService.DEFAULT_CONFIG_ID },
      create: {
        id: MobileRecordingConfigService.DEFAULT_CONFIG_ID,
        configJson: BUILT_IN_RECORDING_CONFIG as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });

    const normalized = this.normalizeBaseConfig(record.configJson);

    if (normalized) {
      return normalized;
    }

    await this.databaseService.mobileRecordingConfig.update({
      where: { id: MobileRecordingConfigService.DEFAULT_CONFIG_ID },
      data: {
        configJson: BUILT_IN_RECORDING_CONFIG as unknown as Prisma.InputJsonValue,
      },
    });

    return BUILT_IN_RECORDING_CONFIG;
  }

  private normalizeBaseConfig(value: unknown): MobileRecordingConfigResponse | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const candidate = value as MobileRecordingConfigResponse;

    if (
      typeof candidate.version !== "number" ||
      !Number.isFinite(candidate.version) ||
      candidate.version < 1 ||
      typeof candidate.updatedAt !== "string" ||
      Number.isNaN(Date.parse(candidate.updatedAt)) ||
      !candidate.profiles ||
      typeof candidate.profiles !== "object"
    ) {
      return null;
    }

    return {
      version: candidate.version,
      updatedAt: this.normalizeUpdatedAt(candidate.updatedAt, BUILT_IN_RECORDING_CONFIG.updatedAt),
      profiles: {
        default: this.mergeProfiles({}, candidate.profiles.default),
        ios: this.mergeProfiles({}, candidate.profiles.ios),
        android: this.mergeProfiles({}, candidate.profiles.android),
      },
      pointFilters: {
        default: this.mergePointFilters({}, candidate.pointFilters?.default),
        ios: this.mergePointFilters({}, candidate.pointFilters?.ios),
        android: this.mergePointFilters({}, candidate.pointFilters?.android),
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

  private clonePointFilters(
    pointFilters: PlatformPointFilterProfilesResponse | undefined,
  ): PlatformPointFilterProfilesResponse {
    if (!pointFilters) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(pointFilters).map(([mode, config]) => [mode, { ...config }]),
    ) as PlatformPointFilterProfilesResponse;
  }

  private mergePointFilters(
    basePointFilters: PlatformPointFilterProfilesResponse,
    overrides: PartialPlatformPointFilterProfiles | undefined,
  ): PlatformPointFilterProfilesResponse {
    if (!overrides) {
      return basePointFilters;
    }

    for (const [mode, override] of Object.entries(overrides)) {
      if (!override) {
        continue;
      }

      const existing = basePointFilters[mode as keyof PlatformPointFilterProfilesResponse];
      const normalized = this.normalizePointFilterProfile(
        override as Partial<PointFilterProfileConfigResponse>,
        existing,
      );

      if (normalized) {
        basePointFilters[mode as keyof PlatformPointFilterProfilesResponse] = normalized;
      }
    }

    return basePointFilters;
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

  private normalizePointFilterProfile(
    config: Partial<PointFilterProfileConfigResponse>,
    fallback: PointFilterProfileConfigResponse | undefined,
  ): PointFilterProfileConfigResponse | null {
    const maxAccuracyMeters = this.normalizeNonNegativeNumber(config.maxAccuracyMeters, fallback?.maxAccuracyMeters);
    const maxJumpDistanceMeters = this.normalizeNonNegativeNumber(
      config.maxJumpDistanceMeters,
      fallback?.maxJumpDistanceMeters,
    );
    const maxImpliedSpeedKmh = this.normalizeNonNegativeNumber(
      config.maxImpliedSpeedKmh,
      fallback?.maxImpliedSpeedKmh,
    );
    const minMovementMeters = this.normalizeNonNegativeNumber(config.minMovementMeters, fallback?.minMovementMeters);

    if (
      maxAccuracyMeters === null ||
      maxJumpDistanceMeters === null ||
      maxImpliedSpeedKmh === null ||
      minMovementMeters === null
    ) {
      return fallback ? { ...fallback } : null;
    }

    return {
      maxAccuracyMeters,
      maxJumpDistanceMeters,
      maxImpliedSpeedKmh,
      minMovementMeters,
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

  private normalizeNonNegativeNumber(value: number | undefined, fallback: number | undefined): number | null {
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
