import { Platform } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type {
  CachedMobileRecordingConfig,
  MobileRecordingConfig,
  PlatformTrackingProfiles,
  RecordingConfigAccuracy,
  RecordingConfigPlatform,
  TrackingProfileConfig,
} from "../../domain/recording-config";
import type { RecordingMode } from "../../domain/trips";
import { requestFromBackend } from "../api/mobile-api.service";
import { refreshActiveIdentitySessionIfPossible } from "../../state/session-store";
import { loadRecordingConfig, saveRecordingConfig } from "../../storage/recording-config-storage";

const MIN_DISTANCE_INTERVAL = 0;
const MAX_DISTANCE_INTERVAL = 10_000;
const MIN_TIME_INTERVAL_MS = 0;
const MAX_TIME_INTERVAL_MS = 60 * 60 * 1000;

let activeRecordingConfig: MobileRecordingConfig | null = null;
let activeRecordingConfigUserId: string | null = null;

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

export async function syncResolvedRecordingConfig(
  identitySession: AuthenticatedDeviceSession | null,
): Promise<void> {
  const cachedRecord = await loadRecordingConfig().catch(() => null);
  const authenticatedSession =
    identitySession?.mode === "authenticated" && identitySession.sessionToken ? identitySession : null;

  if (
    cachedRecord &&
    authenticatedSession &&
    cachedRecord.resolvedForUserId === authenticatedSession.userId &&
    isValidMobileRecordingConfig(cachedRecord.config)
  ) {
    activeRecordingConfig = cachedRecord.config;
    activeRecordingConfigUserId = cachedRecord.resolvedForUserId;
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
      "/auth/mobile/recording-config",
      { method: "GET" },
      sessionForRequest.sessionToken ?? undefined,
    );

    if (!isValidMobileRecordingConfig(remoteConfig)) {
      return;
    }

    const record: CachedMobileRecordingConfig = {
      resolvedForUserId: authenticatedSession.userId,
      config: remoteConfig,
    };

    activeRecordingConfig = remoteConfig;
    activeRecordingConfigUserId = authenticatedSession.userId;
    await saveRecordingConfig(record);
  } catch {
    if (activeRecordingConfigUserId !== authenticatedSession.userId) {
      activeRecordingConfig = null;
      activeRecordingConfigUserId = null;
    }
  }
}

function isValidMobileRecordingConfig(config: unknown): config is MobileRecordingConfig {
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
    isValidPlatformProfiles(candidate.profiles.default)
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
