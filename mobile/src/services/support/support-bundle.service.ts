import Constants from "expo-constants";
import { Platform } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { getApiBaseUrl } from "../api/mobile-api.service";
import { getAndroidRecordingEnvironmentStatusAsync } from "../device/android-power-management.service";
import { getTrailbookPermissionStatus } from "../permissions/permission-manager.service";
import { loadRecordingSession } from "../../storage/recording-storage";
import {
  loadRecentRecordingNativeEvents,
  loadRecordingNativeEventSummary,
} from "../../storage/recording-native-events-storage";
import { loadRawLocationEventTripSummaries } from "../../storage/raw-location-events-storage";
import { loadSyncOutboxSummary } from "../../storage/sync-outbox-storage";
import { loadTripDiagnostics } from "../../storage/trip-diagnostics-storage";

export interface TrailbookSupportBundle {
  apiBaseUrl: string;
  app: {
    build: string;
    name: string;
    runtime: string;
    version: string;
  };
  androidRecordingEnvironment: Awaited<ReturnType<typeof getAndroidRecordingEnvironmentStatusAsync>>;
  generatedAt: string;
  permissionStatus: Awaited<ReturnType<typeof getTrailbookPermissionStatus>>;
  platform: {
    os: string;
    version: string;
  };
  rawLocationEventTrips: Array<{
    acceptedCount: number;
    duplicateCount: number;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
    pendingCount: number;
    processedCount: number;
    rawEventCount: number;
    rejectedCount: number;
    tripLocalId: string;
  }>;
  recentDiagnostics: Array<{
    accepted: number;
    callbackCount: number;
    maxCallbackGapMs: number;
    maxRecordedGapMs: number;
    maxSilentGapMs: number;
    platform: string;
    recordingMode: string;
    silentGapCount: number;
    tripLocalId: string;
    updatedAt: string;
  }>;
  recordingSession: Awaited<ReturnType<typeof loadRecordingSession>>;
  recentRecordingNativeEvents: Awaited<ReturnType<typeof loadRecentRecordingNativeEvents>>;
  recordingNativeEventSummary: Awaited<ReturnType<typeof loadRecordingNativeEventSummary>>;
  syncOutbox: Awaited<ReturnType<typeof loadSyncOutboxSummary>>;
  user: {
    deviceId: string | null;
    email: string | null;
    mode: string | null;
    role: string | null;
    userId: string | null;
  };
}

function getRuntimeLabel() {
  return Constants.appOwnership === "expo" ? "Expo Go" : "Native build";
}

export async function buildTrailbookSupportBundle(input: {
  deviceId: string | null;
  identitySession: AuthenticatedDeviceSession | null;
}): Promise<TrailbookSupportBundle> {
  const [
    androidRecordingEnvironment,
    permissionStatus,
    recordingNativeEventSummary,
    recentRecordingNativeEvents,
    recordingSession,
    rawLocationEventTrips,
    syncOutbox,
    diagnostics,
  ] =
    await Promise.all([
      getAndroidRecordingEnvironmentStatusAsync(),
      getTrailbookPermissionStatus(),
      loadRecordingNativeEventSummary(),
      loadRecentRecordingNativeEvents(50),
      loadRecordingSession(),
      loadRawLocationEventTripSummaries(),
      loadSyncOutboxSummary(),
      loadTripDiagnostics(),
    ]);

  return {
    apiBaseUrl: getApiBaseUrl(),
    app: {
      build: Constants.nativeBuildVersion ?? "Development",
      name: Constants.expoConfig?.name ?? "Trailbook",
      runtime: getRuntimeLabel(),
      version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.0",
    },
    androidRecordingEnvironment,
    generatedAt: new Date().toISOString(),
    permissionStatus,
    platform: {
      os: Platform.OS,
      version: String(Platform.Version),
    },
    rawLocationEventTrips: rawLocationEventTrips.slice(0, 20),
    recentDiagnostics: diagnostics
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 20)
      .map((entry) => ({
        accepted: entry.accepted,
        callbackCount: entry.callbackCount,
        maxCallbackGapMs: entry.maxCallbackGapMs,
        maxRecordedGapMs: entry.maxRecordedGapMs,
        maxSilentGapMs: entry.maxSilentGapMs,
        platform: entry.platform,
        recordingMode: entry.recordingMode,
        silentGapCount: entry.silentGapCount,
        tripLocalId: entry.tripLocalId,
        updatedAt: entry.updatedAt,
    })),
    recordingSession,
    recentRecordingNativeEvents,
    recordingNativeEventSummary,
    syncOutbox,
    user: {
      deviceId: input.deviceId,
      email: input.identitySession?.userEmail ?? null,
      mode: input.identitySession?.mode ?? null,
      role: input.identitySession?.role ?? null,
      userId: input.identitySession?.userId ?? null,
    },
  };
}

export function serializeTrailbookSupportBundle(bundle: TrailbookSupportBundle): string {
  return JSON.stringify(bundle, null, 2);
}
