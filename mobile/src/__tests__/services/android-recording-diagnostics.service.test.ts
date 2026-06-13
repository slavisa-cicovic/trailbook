import { describe, expect, it } from "vitest";

import type { DiagnosticEvent } from "../../domain/diagnostic-event";
import type { RecordingNativeEvent, RecordingNativeEventType } from "../../domain/recording-native-event";
import type { RecordingProfile } from "../../domain/trips";
import type { RawLocationEventTripSummary } from "../../repositories/raw-location-events-repository";
import {
  buildAndroidRecordingDiagnostics,
  type AndroidRecordingDiagnosticsBundle,
} from "../../services/support/android-recording-diagnostics.service";
import type { TrailbookPermissionStatus } from "../../services/permissions/permission-manager.service";

const permissionStatus: TrailbookPermissionStatus = {
  allRequiredGranted: true,
  backgroundLocationGranted: true,
  backgroundLocationSupported: true,
  batteryOptimizationIgnored: true,
  batteryOptimizationSupported: true,
  cameraGranted: true,
  foregroundLocationGranted: true,
  mediaLibraryGranted: true,
  missingRequired: [],
  motionActivityGranted: true,
  notificationsGranted: true,
};

function nativeEvent(input: {
  eventType: RecordingNativeEventType;
  payload?: Record<string, unknown> | null;
  recordedAt: string;
  tripLocalId?: string | null;
}): RecordingNativeEvent {
  return {
    createdAt: input.recordedAt,
    eventType: input.eventType,
    localId: `native-${input.eventType}-${input.recordedAt}`,
    payload: input.payload ?? null,
    recordedAt: input.recordedAt,
    tripLocalId: input.tripLocalId === undefined ? "trip-1" : input.tripLocalId,
  };
}

function processingTrace(input: {
  acceptedPointCount?: number;
  activeProfile?: RecordingProfile;
  duplicateRawEventCount?: number;
  duplicateRecordedAtCount?: number;
  firstRecordedAt?: string;
  lastRecordedAt?: string;
  maxAcceptedGapMs?: number;
  maxRawGapMs?: number;
  previousProfile?: RecordingProfile;
  rawInsertedCount?: number;
  recoveredPointCount?: number;
  rejectedPointCount?: number;
  transitionChanged?: boolean;
  tripLocalId?: string;
}): DiagnosticEvent {
  return {
    category: "recording",
    createdAt: input.lastRecordedAt ?? "2026-06-03T10:00:00.000Z",
    localId: `diagnostic-${input.tripLocalId ?? "trip-1"}`,
    name: "processing_trace",
    payload: {
      acceptedPointCount: input.acceptedPointCount ?? 0,
      activeProfile: input.activeProfile,
      duplicateRawEventCount: input.duplicateRawEventCount ?? 0,
      duplicateRecordedAtCount: input.duplicateRecordedAtCount ?? 0,
      firstRecordedAt: input.firstRecordedAt,
      lastRecordedAt: input.lastRecordedAt,
      maxAcceptedGapMs: input.maxAcceptedGapMs ?? 0,
      maxRawGapMs: input.maxRawGapMs ?? 0,
      previousProfile: input.previousProfile,
      rawInsertedCount: input.rawInsertedCount ?? 0,
      recoveredPointCount: input.recoveredPointCount ?? 0,
      rejectedPointCount: input.rejectedPointCount ?? 0,
      transitionChanged: input.transitionChanged ?? false,
      tripLocalId: input.tripLocalId ?? "trip-1",
    },
    recordedAt: input.lastRecordedAt ?? "2026-06-03T10:00:00.000Z",
    segmentLocalId: null,
    severity: "debug",
    tripLocalId: input.tripLocalId ?? "trip-1",
  };
}

function rawSummary(input: Partial<RawLocationEventTripSummary> = {}): RawLocationEventTripSummary {
  return {
    acceptedCount: input.acceptedCount ?? 0,
    duplicateCount: input.duplicateCount ?? 0,
    firstRecordedAt: input.firstRecordedAt ?? "2026-06-03T10:00:00.000Z",
    lastRecordedAt: input.lastRecordedAt ?? "2026-06-03T10:01:00.000Z",
    pendingCount: input.pendingCount ?? 0,
    processedCount: input.processedCount ?? 0,
    rawEventCount: input.rawEventCount ?? 0,
    rejectedCount: input.rejectedCount ?? 0,
    tripLocalId: input.tripLocalId ?? "trip-1",
  };
}

function buildDiagnostics(input: {
  diagnosticEvents?: DiagnosticEvent[];
  nativeEvents?: RecordingNativeEvent[];
  rawLocationEventTrips?: RawLocationEventTripSummary[];
}): AndroidRecordingDiagnosticsBundle {
  return buildAndroidRecordingDiagnostics({
    androidRecordingEnvironment: null,
    diagnosticEvents: input.diagnosticEvents ?? [],
    generatedAt: "2026-06-03T10:05:00.000Z",
    nativeEvents: input.nativeEvents ?? [],
    permissionStatus,
    rawLocationEventTrips: input.rawLocationEventTrips ?? [],
    recordingSession: null,
    tripDiagnostics: [],
  });
}

describe("buildAndroidRecordingDiagnostics", () => {
  it("counts native callbacks, batches and processing trace totals per trip", () => {
    const diagnostics = buildDiagnostics({
      diagnosticEvents: [
        processingTrace({
          acceptedPointCount: 3,
          activeProfile: "drive",
          duplicateRawEventCount: 1,
          duplicateRecordedAtCount: 2,
          firstRecordedAt: "2026-06-03T10:00:00.000Z",
          lastRecordedAt: "2026-06-03T10:01:00.000Z",
          maxAcceptedGapMs: 15_000,
          maxRawGapMs: 20_000,
          rawInsertedCount: 5,
          recoveredPointCount: 1,
          rejectedPointCount: 2,
          transitionChanged: true,
        }),
      ],
      nativeEvents: [
        nativeEvent({ eventType: "native_service_started", recordedAt: "2026-06-03T09:59:00.000Z" }),
        nativeEvent({ eventType: "native_location_callback", recordedAt: "2026-06-03T10:00:00.000Z" }),
        nativeEvent({
          eventType: "native_location_batch",
          payload: {
            firstRecordedAt: "2026-06-03T10:00:10.000Z",
            lastRecordedAt: "2026-06-03T10:01:00.000Z",
            locationCount: 4,
          },
          recordedAt: "2026-06-03T10:01:00.000Z",
        }),
      ],
      rawLocationEventTrips: [
        rawSummary({
          acceptedCount: 3,
          lastRecordedAt: "2026-06-03T10:01:00.000Z",
          rawEventCount: 5,
        }),
      ],
    });

    expect(diagnostics.recentTrips).toHaveLength(1);
    expect(diagnostics.recentTrips[0]).toMatchObject({
      acceptedPointCount: 3,
      duplicateRawEventCount: 1,
      duplicateRecordedAtCount: 2,
      lastActiveProfile: "drive",
      nativeBatchCount: 1,
      nativeCallbackCount: 1,
      rawEventCount: 5,
      recoveredPointCount: 1,
      rejectedPointCount: 2,
      recordingStartedAt: "2026-06-03T09:59:00.000Z",
      transitionCount: 1,
      tripLocalId: "trip-1",
    });
  });

  it("flags large native callback gaps", () => {
    const diagnostics = buildDiagnostics({
      nativeEvents: [
        nativeEvent({ eventType: "native_location_callback", recordedAt: "2026-06-03T10:00:00.000Z" }),
        nativeEvent({ eventType: "native_location_callback", recordedAt: "2026-06-03T10:03:30.000Z" }),
      ],
    });

    expect(diagnostics.recentTrips[0].maxNativeCallbackGapMs).toBe(210_000);
    expect(diagnostics.recentTrips[0].suspiciousFindings).toContain("large-native-callback-gap");
  });

  it("flags raw events without accepted points", () => {
    const diagnostics = buildDiagnostics({
      rawLocationEventTrips: [
        rawSummary({
          acceptedCount: 0,
          rawEventCount: 4,
          rejectedCount: 4,
        }),
      ],
    });

    expect(diagnostics.recentTrips[0].suspiciousFindings).toContain("raw-events-without-accepted-points");
  });

  it("keeps unassigned native events separately and sorted by newest first", () => {
    const diagnostics = buildDiagnostics({
      nativeEvents: [
        nativeEvent({
          eventType: "permission_missing",
          payload: { permission: "ACCESS_BACKGROUND_LOCATION" },
          recordedAt: "2026-06-03T10:00:00.000Z",
          tripLocalId: null,
        }),
        nativeEvent({
          eventType: "battery_optimization_not_ignored",
          recordedAt: "2026-06-03T10:01:00.000Z",
          tripLocalId: null,
        }),
      ],
    });

    expect(diagnostics.unassignedEvents).toEqual([
      {
        eventType: "battery_optimization_not_ignored",
        payload: null,
        recordedAt: "2026-06-03T10:01:00.000Z",
      },
      {
        eventType: "permission_missing",
        payload: { permission: "ACCESS_BACKGROUND_LOCATION" },
        recordedAt: "2026-06-03T10:00:00.000Z",
      },
    ]);
  });
});
