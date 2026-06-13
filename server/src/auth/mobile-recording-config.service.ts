import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { AuthUserResponse } from "./auth.types";
import type {
  MobileRecordingConfigOverrides,
  MobileRecordingConfigResponse,
  PartialPlatformPointFilterProfiles,
  PlatformPointFilterProfilesResponse,
  PointFilterProfileConfigResponse,
  RecordingProfileConfigName,
} from "./mobile-recording-config.types";

const RECORDING_CONFIG_PROFILE_KEYS: RecordingProfileConfigName[] = ["walk", "bike", "drive", "boat", "plane"];

const BUILT_IN_RECORDING_CONFIG: MobileRecordingConfigResponse = {
  version: 3,
  updatedAt: "2026-06-03T00:00:00.000Z",
  pointFilters: {
    ios: {
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
      this.mergePointFilters(iosPointFilters, roleOverrides?.pointFilters?.ios);
      this.mergePointFilters(androidPointFilters, roleOverrides?.pointFilters?.android);
      this.mergePointFilters(defaultPointFilters, roleOverrides?.pointFilters?.default);

      const userOverrides = this.envOverrides.userOverrides?.[user.id];
      this.mergePointFilters(iosPointFilters, userOverrides?.pointFilters?.ios);
      this.mergePointFilters(androidPointFilters, userOverrides?.pointFilters?.android);
      this.mergePointFilters(defaultPointFilters, userOverrides?.pointFilters?.default);

      const emailOverrides = this.envOverrides.emailOverrides?.[user.email.trim().toLowerCase()];
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
      !candidate.pointFilters ||
      typeof candidate.pointFilters !== "object"
    ) {
      return null;
    }

    return {
      version: candidate.version,
      updatedAt: this.normalizeUpdatedAt(candidate.updatedAt, BUILT_IN_RECORDING_CONFIG.updatedAt),
      pointFilters: {
        default: this.mergePointFilters({}, candidate.pointFilters?.default),
        ios: this.mergePointFilters({}, candidate.pointFilters?.ios),
        android: this.mergePointFilters({}, candidate.pointFilters?.android),
      },
    };
  }

  private clonePointFilters(
    pointFilters: PlatformPointFilterProfilesResponse | undefined,
  ): PlatformPointFilterProfilesResponse {
    if (!pointFilters) {
      return {};
    }

    return Object.fromEntries(
      RECORDING_CONFIG_PROFILE_KEYS.flatMap((mode) => {
        const config = pointFilters[mode];

        return config ? [[mode, { ...config }]] : [];
      }),
    ) as PlatformPointFilterProfilesResponse;
  }

  private mergePointFilters(
    basePointFilters: PlatformPointFilterProfilesResponse,
    overrides: PartialPlatformPointFilterProfiles | undefined,
  ): PlatformPointFilterProfilesResponse {
    if (!overrides) {
      return basePointFilters;
    }

    for (const mode of RECORDING_CONFIG_PROFILE_KEYS) {
      const override = overrides[mode];

      if (!override) {
        continue;
      }

      const existing = basePointFilters[mode];
      const normalized = this.normalizePointFilterProfile(
        override as Partial<PointFilterProfileConfigResponse>,
        existing,
      );

      if (normalized) {
        basePointFilters[mode] = normalized;
      }
    }

    return basePointFilters;
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
