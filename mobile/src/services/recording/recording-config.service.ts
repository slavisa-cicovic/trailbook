import { Platform } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type {
  CachedMobileRecordingConfig,
  MobileRecordingConfig,
  PlatformPointFilterProfiles,
  PlatformTrackingProfiles,
  PointFilterProfileConfig,
  RecordingConfigAccuracy,
  RecordingConfigPlatform,
  TrackingProfileConfig,
} from "../../domain/recording-config";
import type { RecordingMode } from "../../domain/trips";
import { API_ROUTES } from "../../constants/api-routes";
import { requestFromBackend } from "../api/mobile-api.service";
import { refreshActiveIdentitySessionIfPossible } from "../../state/session-store";
import { loadRecordingConfig, saveRecordingConfig } from "../../storage/recording-config-storage";

const MIN_DISTANCE_INTERVAL = 0;
const MAX_DISTANCE_INTERVAL = 10_000;
const MIN_TIME_INTERVAL_MS = 0;
const MAX_TIME_INTERVAL_MS = 60 * 60 * 1000;
const MIN_POINT_FILTER_VALUE = 0;
const MAX_POINT_FILTER_VALUE = 1_000_000;

let activeRecordingConfig: MobileRecordingConfig | null = null;
let activeRecordingConfigUserId: string | null = null;

function cloneRecordingConfig(config: MobileRecordingConfig): MobileRecordingConfig {
  return JSON.parse(JSON.stringify(config)) as MobileRecordingConfig;
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

  const remoteConfig = record.remoteConfig ?? record.config;
  const localOverrideConfig = record.localOverrideConfig ?? null;

  if (!isValidMobileRecordingConfig(remoteConfig)) {
    return null;
  }

  if (localOverrideConfig && !isValidMobileRecordingConfig(localOverrideConfig)) {
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
  return activeRecordingConfig ? cloneRecordingConfig(activeRecordingConfig) : null;
}

export function getRuntimeTrackingProfileConfig(
  profile: RecordingMode,
  platform: RecordingConfigPlatform = Platform.OS === "ios" ? "ios" : "android",
): TrackingProfileConfig | null {
  if (!activeRecordingConfig) {
    return null;
  }

  const platformProfiles = activeRecordingConfig.profiles[platform];
  const defaultProfiles = activeRecordingConfig.profiles.default;

  return platformProfiles?.[profile] ?? defaultProfiles?.[profile] ?? null;
}

export function getRuntimePointFilterProfileConfig(
  profile: RecordingMode,
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

  if (
    authenticatedSession &&
    normalizeCachedRecord(cachedRecord, authenticatedSession.userId)
  ) {
    const normalizedRecord = normalizeCachedRecord(cachedRecord, authenticatedSession.userId);
    activeRecordingConfig = normalizedRecord ? getEffectiveConfig(normalizedRecord) : null;
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

    const remoteConfig = await requestFromBackend<MobileRecordingConfig>(
      API_ROUTES.auth.recordingConfig,
      { method: "GET" },
      sessionForRequest.sessionToken ?? undefined,
    );

    if (!isValidMobileRecordingConfig(remoteConfig)) {
      return;
    }

    const normalizedCachedRecord = normalizeCachedRecord(cachedRecord, authenticatedSession.userId);
    const record: CachedMobileRecordingConfig = {
      resolvedForUserId: authenticatedSession.userId,
      remoteConfig,
      localOverrideConfig: normalizedCachedRecord?.localOverrideConfig ?? null,
      config: normalizedCachedRecord?.localOverrideConfig ?? remoteConfig,
    };

    activeRecordingConfig = getEffectiveConfig(record);
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
  if (!isValidMobileRecordingConfig(config)) {
    throw new Error("Recording config is invalid.");
  }

  const cachedRecord = await loadEditableRecordingConfig(identitySession);
  const remoteConfig = cachedRecord?.remoteConfig ?? cachedRecord?.config ?? config;
  const updatedConfig = {
    ...cloneRecordingConfig(config),
    updatedAt: new Date().toISOString(),
    version: Math.max(1, Math.trunc(config.version || 1)),
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
  const remoteConfig = await requestFromBackend<MobileRecordingConfig>(
    API_ROUTES.auth.recordingConfig,
    { method: "GET" },
    identitySession.sessionToken ?? undefined,
  );

  if (!isValidMobileRecordingConfig(remoteConfig)) {
    throw new Error("Server recording config is invalid.");
  }

  const record: CachedMobileRecordingConfig = {
    resolvedForUserId: identitySession.userId,
    remoteConfig,
    localOverrideConfig: null,
    config: remoteConfig,
  };

  activeRecordingConfig = remoteConfig;
  activeRecordingConfigUserId = identitySession.userId;
  await saveRecordingConfig(record);

  return remoteConfig;
}

export function isValidMobileRecordingConfig(config: unknown): config is MobileRecordingConfig {
  if (!config || typeof config !== "object") {
    return false;
  }

  const candidate = config as MobileRecordingConfig;

  if (
    typeof candidate.version !== "number" ||
    !Number.isFinite(candidate.version) ||
    candidate.version < 1 ||
    typeof candidate.updatedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.updatedAt)) ||
    !candidate.profiles ||
    typeof candidate.profiles !== "object"
  ) {
    return false;
  }

  return (
    isValidPlatformProfiles(candidate.profiles.ios) &&
    isValidPlatformProfiles(candidate.profiles.android) &&
    isValidPlatformProfiles(candidate.profiles.default) &&
    isValidPlatformPointFilterProfiles(candidate.pointFilters?.ios) &&
    isValidPlatformPointFilterProfiles(candidate.pointFilters?.android) &&
    isValidPlatformPointFilterProfiles(candidate.pointFilters?.default)
  );
}

function isValidPlatformProfiles(profiles: PlatformTrackingProfiles | undefined): boolean {
  if (profiles === undefined) {
    return true;
  }

  if (!profiles || typeof profiles !== "object") {
    return false;
  }

  return Object.values(profiles).every((profile) => isValidTrackingProfileConfig(profile));
}

function isValidTrackingProfileConfig(config: TrackingProfileConfig | undefined): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }

  return (
    isValidAccuracy(config.accuracy) &&
    isFiniteInRange(config.distanceInterval, MIN_DISTANCE_INTERVAL, MAX_DISTANCE_INTERVAL) &&
    isFiniteInRange(config.timeIntervalMs, MIN_TIME_INTERVAL_MS, MAX_TIME_INTERVAL_MS)
  );
}

function isValidPlatformPointFilterProfiles(profiles: PlatformPointFilterProfiles | undefined): boolean {
  if (profiles === undefined) {
    return true;
  }

  if (!profiles || typeof profiles !== "object") {
    return false;
  }

  return Object.values(profiles).every((profile) => isValidPointFilterProfileConfig(profile));
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

function isValidAccuracy(value: unknown): value is RecordingConfigAccuracy {
  switch (value) {
    case "lowest":
    case "low":
    case "balanced":
    case "high":
    case "highest":
    case "bestForNavigation":
      return true;
    default:
      return false;
  }
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
