import { Platform } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type {
  CachedMobileRecordingConfig,
  MobileRecordingConfig,
  PlatformPointFilterProfiles,
  PointFilterProfileConfig,
  RecordingConfigPlatform,
} from "../../domain/recording-config";
import type { RecordingProfile } from "../../domain/trips";
import { API_ROUTES } from "../../constants/api-routes";
import { requestFromBackend } from "../api/mobile-api.service";
import { refreshActiveIdentitySessionIfPossible } from "../../state/session-store";
import { loadRecordingConfig, saveRecordingConfig } from "../../storage/recording-config-storage";

const MIN_POINT_FILTER_VALUE = 0;
const MAX_POINT_FILTER_VALUE = 1_000_000;
const RECORDING_CONFIG_PROFILE_KEYS: RecordingProfile[] = ["walk", "bike", "drive", "boat", "plane"];

let activeRecordingConfig: MobileRecordingConfig | null = null;
let activeRecordingConfigUserId: string | null = null;

function cloneRecordingConfig(config: MobileRecordingConfig): MobileRecordingConfig {
  return JSON.parse(JSON.stringify(config)) as MobileRecordingConfig;
}

function sanitizePointFilterProfiles(
  pointFilters: PlatformPointFilterProfiles | undefined,
): PlatformPointFilterProfiles | undefined {
  if (!pointFilters) {
    return undefined;
  }

  const sanitizedProfiles: PlatformPointFilterProfiles = {};

  for (const profile of RECORDING_CONFIG_PROFILE_KEYS) {
    const config = pointFilters[profile];

    if (config) {
      sanitizedProfiles[profile] = { ...config };
    }
  }

  return sanitizedProfiles;
}

function sanitizeMobileRecordingConfig(config: MobileRecordingConfig): MobileRecordingConfig {
  return {
    version: config.version,
    updatedAt: config.updatedAt,
    pointFilters: {
      ios: sanitizePointFilterProfiles(config.pointFilters.ios),
      android: sanitizePointFilterProfiles(config.pointFilters.android),
      default: sanitizePointFilterProfiles(config.pointFilters.default),
    },
  };
}

function getEffectiveConfig(record: CachedMobileRecordingConfig): MobileRecordingConfig {
  return record.localOverrideConfig ?? record.config;
}

function normalizeCachedRecord(
  record: CachedMobileRecordingConfig | null,
  userId: string,
): CachedMobileRecordingConfig | null {
  if (!record || record.resolvedForUserId !== userId) {
    return null;
  }

  const remoteConfig = normalizeMobileRecordingConfig(record.remoteConfig ?? record.config);
  const localOverrideConfig = record.localOverrideConfig
    ? normalizeMobileRecordingConfig(record.localOverrideConfig)
    : null;

  if (!remoteConfig) {
    return null;
  }

  if (record.localOverrideConfig && !localOverrideConfig) {
    return null;
  }

  return {
    resolvedForUserId: userId,
    remoteConfig,
    localOverrideConfig,
    config: localOverrideConfig ?? remoteConfig,
  };
}

export function getActiveRecordingConfigSnapshot(): MobileRecordingConfig | null {
  return activeRecordingConfig ? sanitizeMobileRecordingConfig(activeRecordingConfig) : null;
}

export function getRuntimePointFilterProfileConfig(
  profile: RecordingProfile,
  platform: RecordingConfigPlatform = Platform.OS === "ios" ? "ios" : "android",
): PointFilterProfileConfig | null {
  if (!activeRecordingConfig?.pointFilters) {
    return null;
  }

  const platformProfiles = activeRecordingConfig.pointFilters[platform];
  const defaultProfiles = activeRecordingConfig.pointFilters.default;

  return platformProfiles?.[profile] ?? defaultProfiles?.[profile] ?? null;
}

export async function syncResolvedRecordingConfig(
  identitySession: AuthenticatedDeviceSession | null,
): Promise<void> {
  const cachedRecord = await loadRecordingConfig().catch(() => null);
  const authenticatedSession =
    identitySession?.mode === "authenticated" && identitySession.sessionToken ? identitySession : null;

  if (authenticatedSession) {
    const normalizedRecord = normalizeCachedRecord(cachedRecord, authenticatedSession.userId);
    activeRecordingConfig = normalizedRecord ? sanitizeMobileRecordingConfig(getEffectiveConfig(normalizedRecord)) : null;
    activeRecordingConfigUserId = normalizedRecord?.resolvedForUserId ?? null;
  } else {
    activeRecordingConfig = null;
    activeRecordingConfigUserId = null;
  }

  if (!authenticatedSession) {
    return;
  }

  try {
    const refreshedSession = await refreshActiveIdentitySessionIfPossible();
    const sessionForRequest =
      refreshedSession?.mode === "authenticated" && refreshedSession.sessionToken
        ? refreshedSession
        : authenticatedSession;

    const remoteConfig = await requestFromBackend<unknown>(
      API_ROUTES.auth.recordingConfig,
      { method: "GET" },
      sessionForRequest.sessionToken ?? undefined,
    );
    const sanitizedRemoteConfig = normalizeMobileRecordingConfig(remoteConfig);

    if (!sanitizedRemoteConfig) {
      return;
    }

    const normalizedCachedRecord = normalizeCachedRecord(cachedRecord, authenticatedSession.userId);
    const record: CachedMobileRecordingConfig = {
      resolvedForUserId: authenticatedSession.userId,
      remoteConfig: sanitizedRemoteConfig,
      localOverrideConfig: normalizedCachedRecord?.localOverrideConfig ?? null,
      config: normalizedCachedRecord?.localOverrideConfig ?? sanitizedRemoteConfig,
    };

    activeRecordingConfig = sanitizeMobileRecordingConfig(getEffectiveConfig(record));
    activeRecordingConfigUserId = authenticatedSession.userId;
    await saveRecordingConfig(record);
  } catch {
    if (activeRecordingConfigUserId !== authenticatedSession.userId) {
      activeRecordingConfig = null;
      activeRecordingConfigUserId = null;
    }
  }
}

export async function loadEditableRecordingConfig(
  identitySession: AuthenticatedDeviceSession | null,
): Promise<CachedMobileRecordingConfig | null> {
  const authenticatedSession =
    identitySession?.mode === "authenticated" && identitySession.sessionToken ? identitySession : null;

  if (!authenticatedSession) {
    return null;
  }

  let cachedRecord = normalizeCachedRecord(
    await loadRecordingConfig().catch(() => null),
    authenticatedSession.userId,
  );

  if (!cachedRecord) {
    await syncResolvedRecordingConfig(authenticatedSession);
    cachedRecord = normalizeCachedRecord(
      await loadRecordingConfig().catch(() => null),
      authenticatedSession.userId,
    );
  }

  return cachedRecord;
}

export async function saveLocalRecordingConfigOverride(
  identitySession: AuthenticatedDeviceSession,
  config: MobileRecordingConfig,
): Promise<void> {
  const normalizedConfig = normalizeMobileRecordingConfig(config);

  if (!normalizedConfig) {
    throw new Error("Recording config is invalid.");
  }

  const cachedRecord = await loadEditableRecordingConfig(identitySession);
  const remoteConfig = cachedRecord?.remoteConfig ?? cachedRecord?.config ?? normalizedConfig;
  const updatedConfig = {
    ...sanitizeMobileRecordingConfig(cloneRecordingConfig(normalizedConfig)),
    updatedAt: new Date().toISOString(),
    version: Math.max(1, Math.trunc(normalizedConfig.version || 1)),
  };
  const record: CachedMobileRecordingConfig = {
    resolvedForUserId: identitySession.userId,
    remoteConfig,
    localOverrideConfig: updatedConfig,
    config: updatedConfig,
  };

  activeRecordingConfig = updatedConfig;
  activeRecordingConfigUserId = identitySession.userId;
  await saveRecordingConfig(record);
}

export async function resetRecordingConfigToServerDefaults(
  identitySession: AuthenticatedDeviceSession,
): Promise<MobileRecordingConfig> {
  const remoteConfig = await requestFromBackend<unknown>(
    API_ROUTES.auth.recordingConfig,
    { method: "GET" },
    identitySession.sessionToken ?? undefined,
  );
  const sanitizedRemoteConfig = normalizeMobileRecordingConfig(remoteConfig);

  if (!sanitizedRemoteConfig) {
    throw new Error("Server recording config is invalid.");
  }

  const record: CachedMobileRecordingConfig = {
    resolvedForUserId: identitySession.userId,
    remoteConfig: sanitizedRemoteConfig,
    localOverrideConfig: null,
    config: sanitizedRemoteConfig,
  };

  activeRecordingConfig = sanitizedRemoteConfig;
  activeRecordingConfigUserId = identitySession.userId;
  await saveRecordingConfig(record);

  return sanitizedRemoteConfig;
}

export function isValidMobileRecordingConfig(config: unknown): config is MobileRecordingConfig {
  return normalizeMobileRecordingConfig(config) !== null;
}

function normalizeMobileRecordingConfig(config: unknown): MobileRecordingConfig | null {
  if (!config || typeof config !== "object") {
    return null;
  }

  const candidate = config as MobileRecordingConfig;

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

  if (
    !isValidPlatformPointFilterProfiles(candidate.pointFilters.ios) ||
    !isValidPlatformPointFilterProfiles(candidate.pointFilters.android) ||
    !isValidPlatformPointFilterProfiles(candidate.pointFilters.default)
  ) {
    return null;
  }

  return sanitizeMobileRecordingConfig(candidate);
}

function isValidPlatformPointFilterProfiles(pointFilters: PlatformPointFilterProfiles | undefined): boolean {
  if (pointFilters === undefined) {
    return true;
  }

  if (!pointFilters || typeof pointFilters !== "object") {
    return false;
  }

  return Object.values(pointFilters).every((profile) => isValidPointFilterProfileConfig(profile));
}

function isValidPointFilterProfileConfig(config: PointFilterProfileConfig | undefined): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }

  return (
    isFiniteInRange(config.maxAccuracyMeters, MIN_POINT_FILTER_VALUE, MAX_POINT_FILTER_VALUE) &&
    isFiniteInRange(config.maxJumpDistanceMeters, MIN_POINT_FILTER_VALUE, MAX_POINT_FILTER_VALUE) &&
    isFiniteInRange(config.maxImpliedSpeedKmh, MIN_POINT_FILTER_VALUE, MAX_POINT_FILTER_VALUE) &&
    isFiniteInRange(config.minMovementMeters, MIN_POINT_FILTER_VALUE, MAX_POINT_FILTER_VALUE)
  );
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function clearRecordingConfigCache(): void {
  activeRecordingConfig = null;
  activeRecordingConfigUserId = null;
}
