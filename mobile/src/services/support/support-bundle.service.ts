import Constants from "expo-constants";
import { Platform } from "react-native";

import { resolveSessionFlags } from "../../constants/feature-flags";
import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { WaypointAttachment } from "../../domain/trips";
import { loadRecentDiagnosticEvents } from "../../repositories/diagnostic-events-repository";
import { loadTripRouteVariantSummary } from "../../repositories/trip-route-variants-repository";
import { loadWaypointAttachments } from "../../repositories/waypoint-attachments-repository";
import { getApiBaseUrl } from "../api/mobile-api.service";
import { getAndroidRecordingEnvironmentStatusAsync } from "../device/android-power-management.service";
import { getTrailbookPermissionStatus } from "../permissions/permission-manager.service";
import { loadRecordingSession } from "../../storage/recording-storage";
import {
  loadRecentRecordingNativeEvents,
  loadRecordingNativeEventSummary,
} from "../../repositories/recording-native-events-repository";
import { loadRawLocationEventTripSummaries } from "../../repositories/raw-location-events-repository";
import { loadSyncOutboxSummary } from "../../repositories/sync-outbox-repository";
import { loadTripDiagnostics } from "../../repositories/trip-diagnostics-repository";
import {
  buildAndroidRecordingDiagnostics,
  type AndroidRecordingDiagnosticsBundle,
} from "./android-recording-diagnostics.service";
import { scrubSupportBundleValue } from "./support-bundle-scrubber.service";

const SUPPORT_BUNDLE_RECENT_EVENT_LIMIT = 100;

export interface SupportBundleV1 {
  apiBaseUrl: string;
  app: {
    build: string;
    name: string;
    runtime: string;
    version: string;
  };
  androidRecordingEnvironment: Awaited<ReturnType<typeof getAndroidRecordingEnvironmentStatusAsync>>;
  androidRecordingDiagnostics: AndroidRecordingDiagnosticsBundle;
  bundleId: string;
  featureFlags: ReturnType<typeof resolveSessionFlags>;
  generatedAt: string;
  mediaSummary: {
    activePhotoCount: number;
    deletedCount: number;
    localPhotoCount: number;
    pendingSyncCount: number;
    remotePhotoCount: number;
    syncErrorCount: number;
    totalAttachments: number;
  };
  permissionStatus: Awaited<ReturnType<typeof getTrailbookPermissionStatus>>;
  platform: {
    os: string;
    version: string;
  };
  rawLocationEventTrips: {
    acceptedCount: number;
    duplicateCount: number;
    firstRecordedAt: string | null;
    lastRecordedAt: string | null;
    pendingCount: number;
    processedCount: number;
    rawEventCount: number;
    rejectedCount: number;
    tripLocalId: string;
  }[];
  recentDiagnostics: {
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
  }[];
  recentDiagnosticEvents: Awaited<ReturnType<typeof loadRecentDiagnosticEvents>>;
  recordingSession: Awaited<ReturnType<typeof loadRecordingSession>>;
  recentRecordingNativeEvents: Awaited<ReturnType<typeof loadRecentRecordingNativeEvents>>;
  recordingNativeEventSummary: Awaited<ReturnType<typeof loadRecordingNativeEventSummary>>;
  routeVariantSummary: Awaited<ReturnType<typeof loadTripRouteVariantSummary>>;
  schemaVersion: 1;
  syncOutbox: Awaited<ReturnType<typeof loadSyncOutboxSummary>>;
  user: {
    deviceId: string | null;
    email: string | null;
    mode: string | null;
    role: string | null;
    userId: string | null;
  };
}

export type TrailbookSupportBundle = SupportBundleV1;

function getRuntimeLabel() {
  return Constants.appOwnership === "expo" ? "Expo Go" : "Native build";
}

function createSupportBundleId(generatedAt: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);

  return `support-bundle-${generatedAt.replace(/[:.]/g, "-")}-${suffix}`;
}

function isRemoteUri(uri: string): boolean {
  return uri.startsWith("http://") || uri.startsWith("https://");
}

function buildMediaSummary(attachments: WaypointAttachment[]): SupportBundleV1["mediaSummary"] {
  const activeAttachments = attachments.filter((attachment) => attachment.deletedAt === null);
  const activePhotos = activeAttachments.filter((attachment) => attachment.type === "photo");

  return {
    activePhotoCount: activePhotos.length,
    deletedCount: attachments.length - activeAttachments.length,
    localPhotoCount: activePhotos.filter((attachment) => !isRemoteUri(attachment.localUri)).length,
    pendingSyncCount: attachments.filter((attachment) => attachment.syncStatus === "pending-sync").length,
    remotePhotoCount: activePhotos.filter((attachment) => isRemoteUri(attachment.localUri)).length,
    syncErrorCount: attachments.filter((attachment) => attachment.syncStatus === "sync-error").length,
    totalAttachments: attachments.length,
  };
}

export async function buildTrailbookSupportBundle(input: {
  deviceId: string | null;
  identitySession: AuthenticatedDeviceSession | null;
}): Promise<SupportBundleV1> {
  const [
    androidRecordingEnvironment,
    permissionStatus,
    recordingNativeEventSummary,
    recentRecordingNativeEvents,
    recordingSession,
    rawLocationEventTrips,
    routeVariantSummary,
    syncOutbox,
    diagnostics,
    waypointAttachments,
    recentDiagnosticEvents,
  ] =
    await Promise.all([
      getAndroidRecordingEnvironmentStatusAsync(),
      getTrailbookPermissionStatus(),
      loadRecordingNativeEventSummary(),
      loadRecentRecordingNativeEvents(SUPPORT_BUNDLE_RECENT_EVENT_LIMIT),
      loadRecordingSession(),
      loadRawLocationEventTripSummaries(),
      loadTripRouteVariantSummary(),
      loadSyncOutboxSummary(),
      loadTripDiagnostics(),
      loadWaypointAttachments(),
      loadRecentDiagnosticEvents(SUPPORT_BUNDLE_RECENT_EVENT_LIMIT),
    ]);
  const generatedAt = new Date().toISOString();
  const androidRecordingDiagnostics = buildAndroidRecordingDiagnostics({
    androidRecordingEnvironment,
    diagnosticEvents: recentDiagnosticEvents,
    generatedAt,
    nativeEvents: recentRecordingNativeEvents,
    permissionStatus,
    rawLocationEventTrips,
    recordingSession,
    tripDiagnostics: diagnostics,
  });

  return {
    apiBaseUrl: getApiBaseUrl(),
    app: {
      build: Constants.nativeBuildVersion ?? "Development",
      name: Constants.expoConfig?.name ?? "Trailbook",
      runtime: getRuntimeLabel(),
      version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "1.0.0",
    },
    androidRecordingEnvironment,
    androidRecordingDiagnostics,
    bundleId: createSupportBundleId(generatedAt),
    featureFlags: resolveSessionFlags(input.identitySession),
    generatedAt,
    mediaSummary: buildMediaSummary(waypointAttachments),
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
    recentDiagnosticEvents,
    recordingSession,
    recentRecordingNativeEvents,
    recordingNativeEventSummary,
    routeVariantSummary,
    schemaVersion: 1,
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
  return JSON.stringify(scrubSupportBundleValue(bundle), null, 2);
}
