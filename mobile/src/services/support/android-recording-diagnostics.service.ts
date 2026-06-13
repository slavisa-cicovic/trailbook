import type { DiagnosticEvent } from "../../domain/diagnostic-event";
import type { RecordingNativeEvent, RecordingNativeEventType } from "../../domain/recording-native-event";
import type { RecordingSessionSummary, RecordingProfile } from "../../domain/trips";
import type { TripDiagnostics } from "../../domain/trip-diagnostics";
import type { RawLocationEventTripSummary } from "../../repositories/raw-location-events-repository";
import type { AndroidRecordingEnvironmentStatus } from "../device/android-power-management.service";
import type { TrailbookPermissionStatus } from "../permissions/permission-manager.service";

const RECENT_TRIP_LIMIT = 20;
const UNASSIGNED_EVENT_LIMIT = 20;
const LARGE_CALLBACK_GAP_MS = 2 * 60 * 1000;
const LARGE_RAW_GAP_MS = 2 * 60 * 1000;
const LONG_SLEEP_BATCH_SPAN_MS = 2 * 60 * 1000;

const NATIVE_CALLBACK_EVENT_TYPES = new Set<RecordingNativeEventType>([
  "native_location_callback",
  "native_location_batch",
]);

const RESTART_REQUESTED_EVENT_TYPES = new Set<RecordingNativeEventType>([
  "native_location_restart_requested",
  "background_tracking_restart_requested",
]);

const RESTART_SUCCEEDED_EVENT_TYPES = new Set<RecordingNativeEventType>([
  "native_location_restart_succeeded",
  "background_tracking_restart_succeeded",
]);

const RESTART_FAILED_EVENT_TYPES = new Set<RecordingNativeEventType>([
  "native_location_restart_failed",
  "background_tracking_restart_failed",
]);

export type AndroidRecordingSuspiciousFinding =
  | "background-permission-missing"
  | "batch-delivered-after-long-sleep"
  | "battery-optimization-not-ignored"
  | "large-native-callback-gap"
  | "large-raw-recorded-gap"
  | "native-tracking-not-started"
  | "no-background-callbacks-after-start"
  | "raw-events-without-accepted-points"
  | "restart-failed"
  | "watchdog-stale-detected";

export interface AndroidRecordingTripDiagnostics {
  acceptedPointCount: number;
  batteryOptimizationWarningCount: number;
  callbackCount: number;
  duplicateRawEventCount: number;
  duplicateRecordedAtCount: number;
  firstRawRecordedAt: string | null;
  lastActiveProfile: RecordingProfile | null;
  lastRawRecordedAt: string | null;
  latestNativeTrackingState: unknown | null;
  maxAcceptedPointGapMs: number;
  maxNativeCallbackGapMs: number;
  maxRawRecordedGapMs: number;
  nativeBatchCount: number;
  nativeCallbackCount: number;
  permissionMissingCount: number;
  rawEventCount: number;
  recoveredPointCount: number;
  recordingStartedAt: string | null;
  rejectedPointCount: number;
  restartFailedCount: number;
  restartRequestedCount: number;
  restartSucceededCount: number;
  suspiciousFindings: AndroidRecordingSuspiciousFinding[];
  transitionCount: number;
  tripLocalId: string;
  watchdogStaleCount: number;
  watchdogTickCount: number;
}

export interface AndroidRecordingUnassignedEvent {
  eventType: RecordingNativeEventType;
  payload: Record<string, unknown> | null;
  recordedAt: string;
}

export interface AndroidRecordingDiagnosticsBundle {
  currentSession: Pick<
    RecordingSessionSummary,
    "activeSegmentId" | "activeTripId" | "lastPointRecordedAt" | "recordingProfile" | "startedAt" | "status"
  > | null;
  environmentFindings: AndroidRecordingSuspiciousFinding[];
  generatedAt: string;
  recentTrips: AndroidRecordingTripDiagnostics[];
  unassignedEvents: AndroidRecordingUnassignedEvent[];
}

interface BuildAndroidRecordingDiagnosticsInput {
  androidRecordingEnvironment: AndroidRecordingEnvironmentStatus | null;
  diagnosticEvents: DiagnosticEvent[];
  generatedAt?: string;
  nativeEvents: RecordingNativeEvent[];
  permissionStatus: TrailbookPermissionStatus;
  rawLocationEventTrips: RawLocationEventTripSummary[];
  recordingSession: RecordingSessionSummary | null;
  tripDiagnostics: TripDiagnostics[];
}

interface ProcessingTracePayload {
  acceptedPointCount: number;
  activeProfile: RecordingProfile | null;
  duplicateRawEventCount: number;
  duplicateRecordedAtCount: number;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  maxAcceptedGapMs: number;
  maxRawGapMs: number;
  previousProfile: RecordingProfile | null;
  rawInsertedCount: number;
  recoveredPointCount: number;
  rejectedPointCount: number;
  transitionChanged: boolean;
  tripLocalId: string | null;
}

function getFiniteDateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getMaxRecordedAtGapMs(values: string[]): number {
  const orderedTimes = values
    .map(getFiniteDateMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  let maxGapMs = 0;

  for (let index = 1; index < orderedTimes.length; index += 1) {
    maxGapMs = Math.max(maxGapMs, orderedTimes[index] - orderedTimes[index - 1]);
  }

  return maxGapMs;
}

function maxNumber(values: number[]): number {
  return values.reduce((maxValue, value) => Math.max(maxValue, Number.isFinite(value) ? value : 0), 0);
}

function sumNumber(values: number[]): number {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function payloadNumber(payload: Record<string, unknown>, key: keyof ProcessingTracePayload): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function payloadString(payload: Record<string, unknown>, key: keyof ProcessingTracePayload): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function payloadBoolean(payload: Record<string, unknown>, key: keyof ProcessingTracePayload): boolean {
  return payload[key] === true;
}

function payloadProfile(payload: Record<string, unknown>, key: keyof ProcessingTracePayload): RecordingProfile | null {
  const value = payload[key];

  switch (value) {
    case "walk":
    case "bike":
    case "drive":
    case "boat":
    case "plane":
    case "stationary":
      return value;
    default:
      return null;
  }
}

function toProcessingTracePayload(event: DiagnosticEvent): ProcessingTracePayload | null {
  if (event.category !== "recording" || event.name !== "processing_trace" || !event.payload) {
    return null;
  }

  return {
    acceptedPointCount: payloadNumber(event.payload, "acceptedPointCount"),
    activeProfile: payloadProfile(event.payload, "activeProfile"),
    duplicateRawEventCount: payloadNumber(event.payload, "duplicateRawEventCount"),
    duplicateRecordedAtCount: payloadNumber(event.payload, "duplicateRecordedAtCount"),
    firstRecordedAt: payloadString(event.payload, "firstRecordedAt"),
    lastRecordedAt: payloadString(event.payload, "lastRecordedAt"),
    maxAcceptedGapMs: payloadNumber(event.payload, "maxAcceptedGapMs"),
    maxRawGapMs: payloadNumber(event.payload, "maxRawGapMs"),
    previousProfile: payloadProfile(event.payload, "previousProfile"),
    rawInsertedCount: payloadNumber(event.payload, "rawInsertedCount"),
    recoveredPointCount: payloadNumber(event.payload, "recoveredPointCount"),
    rejectedPointCount: payloadNumber(event.payload, "rejectedPointCount"),
    transitionChanged: payloadBoolean(event.payload, "transitionChanged"),
    tripLocalId: payloadString(event.payload, "tripLocalId") ?? event.tripLocalId,
  };
}

function getLatestRecordedAt(values: (string | null | undefined)[]): string | null {
  return [...values]
    .filter((value): value is string => typeof value === "string" && getFiniteDateMs(value) !== null)
    .sort()
    .at(-1) ?? null;
}

function getEarliestRecordedAt(values: (string | null | undefined)[]): string | null {
  return [...values]
    .filter((value): value is string => typeof value === "string" && getFiniteDateMs(value) !== null)
    .sort()[0] ?? null;
}

function getNativePayloadObject(event: RecordingNativeEvent, key: string): unknown | null {
  if (!event.payload) {
    return null;
  }

  const value = event.payload[key];
  return typeof value === "object" && value !== null ? value : null;
}

function getNativePayloadDateSpanMs(event: RecordingNativeEvent): number {
  if (!event.payload) {
    return 0;
  }

  const firstRecordedAt = typeof event.payload.firstRecordedAt === "string" ? event.payload.firstRecordedAt : null;
  const lastRecordedAt = typeof event.payload.lastRecordedAt === "string" ? event.payload.lastRecordedAt : null;
  const firstRecordedAtMs = getFiniteDateMs(firstRecordedAt);
  const lastRecordedAtMs = getFiniteDateMs(lastRecordedAt);

  if (firstRecordedAtMs === null || lastRecordedAtMs === null) {
    return 0;
  }

  return Math.max(0, lastRecordedAtMs - firstRecordedAtMs);
}

function getLatestNativeTrackingState(nativeEvents: RecordingNativeEvent[]): unknown | null {
  for (const event of [...nativeEvents].sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))) {
    const backgroundTrackingState = getNativePayloadObject(event, "backgroundTrackingState");

    if (backgroundTrackingState) {
      return backgroundTrackingState;
    }

    const trackingState = getNativePayloadObject(event, "trackingState");

    if (trackingState) {
      return trackingState;
    }
  }

  return null;
}

function nativeTrackingStateStarted(nativeTrackingState: unknown): boolean | null {
  if (typeof nativeTrackingState !== "object" || nativeTrackingState === null || Array.isArray(nativeTrackingState)) {
    return null;
  }

  const value = (nativeTrackingState as Record<string, unknown>).started;
  return typeof value === "boolean" ? value : null;
}

function buildEnvironmentFindings(input: BuildAndroidRecordingDiagnosticsInput): AndroidRecordingSuspiciousFinding[] {
  const findings = new Set<AndroidRecordingSuspiciousFinding>();

  if (
    !input.permissionStatus.backgroundLocationGranted ||
    input.androidRecordingEnvironment?.backgroundLocationPermissionGranted === false
  ) {
    findings.add("background-permission-missing");
  }

  if (
    (input.permissionStatus.batteryOptimizationSupported && !input.permissionStatus.batteryOptimizationIgnored) ||
    input.androidRecordingEnvironment?.batteryOptimizationIgnored === false
  ) {
    findings.add("battery-optimization-not-ignored");
  }

  return [...findings];
}

function buildSuspiciousFindings(input: {
  acceptedPointCount: number;
  batteryOptimizationWarningCount: number;
  latestNativeTrackingState: unknown | null;
  maxNativeCallbackGapMs: number;
  maxRawRecordedGapMs: number;
  nativeBatchCount: number;
  nativeCallbackTimelineCount: number;
  nativeServiceStartedCount: number;
  permissionMissingCount: number;
  rawEventCount: number;
  restartFailedCount: number;
  watchdogStaleCount: number;
  nativeEvents: RecordingNativeEvent[];
}): AndroidRecordingSuspiciousFinding[] {
  const findings = new Set<AndroidRecordingSuspiciousFinding>();

  if (input.nativeServiceStartedCount > 0 && input.nativeCallbackTimelineCount === 0) {
    findings.add("no-background-callbacks-after-start");
  }

  if (input.maxNativeCallbackGapMs >= LARGE_CALLBACK_GAP_MS) {
    findings.add("large-native-callback-gap");
  }

  if (input.maxRawRecordedGapMs >= LARGE_RAW_GAP_MS) {
    findings.add("large-raw-recorded-gap");
  }

  if (input.rawEventCount > 0 && input.acceptedPointCount === 0) {
    findings.add("raw-events-without-accepted-points");
  }

  if (input.watchdogStaleCount > 0) {
    findings.add("watchdog-stale-detected");
  }

  if (input.restartFailedCount > 0) {
    findings.add("restart-failed");
  }

  if (input.batteryOptimizationWarningCount > 0) {
    findings.add("battery-optimization-not-ignored");
  }

  if (input.permissionMissingCount > 0) {
    findings.add("background-permission-missing");
  }

  if (nativeTrackingStateStarted(input.latestNativeTrackingState) === false) {
    findings.add("native-tracking-not-started");
  }

  if (
    input.nativeBatchCount > 0 &&
    (input.maxRawRecordedGapMs >= LARGE_RAW_GAP_MS ||
      input.nativeEvents.some((event) => event.eventType === "native_location_batch" &&
        getNativePayloadDateSpanMs(event) >= LONG_SLEEP_BATCH_SPAN_MS))
  ) {
    findings.add("batch-delivered-after-long-sleep");
  }

  return [...findings];
}

function getCurrentSessionSummary(
  session: RecordingSessionSummary | null,
): AndroidRecordingDiagnosticsBundle["currentSession"] {
  if (!session) {
    return null;
  }

  return {
    activeSegmentId: session.activeSegmentId,
    activeTripId: session.activeTripId,
    lastPointRecordedAt: session.lastPointRecordedAt,
    recordingProfile: session.recordingProfile,
    startedAt: session.startedAt,
    status: session.status,
  };
}

function getTripLatestActivityAt(input: {
  diagnostics: TripDiagnostics | null;
  nativeEvents: RecordingNativeEvent[];
  rawSummary: RawLocationEventTripSummary | null;
  traces: ProcessingTracePayload[];
}): string | null {
  return getLatestRecordedAt([
    input.rawSummary?.lastRecordedAt,
    input.diagnostics?.updatedAt,
    ...input.nativeEvents.map((event) => event.recordedAt),
    ...input.traces.map((trace) => trace.lastRecordedAt ?? trace.firstRecordedAt),
  ]);
}

function buildTripDiagnostics(input: {
  diagnostics: TripDiagnostics | null;
  nativeEvents: RecordingNativeEvent[];
  rawSummary: RawLocationEventTripSummary | null;
  traces: ProcessingTracePayload[];
  tripLocalId: string;
}): AndroidRecordingTripDiagnostics {
  const nativeCallbackTimeline = input.nativeEvents.filter((event) => NATIVE_CALLBACK_EVENT_TYPES.has(event.eventType));
  const nativeCallbackCount = input.nativeEvents.filter((event) => event.eventType === "native_location_callback").length;
  const nativeBatchCount = input.nativeEvents.filter((event) => event.eventType === "native_location_batch").length;
  const acceptedPointCount = input.traces.length > 0
    ? sumNumber(input.traces.map((trace) => trace.acceptedPointCount))
    : input.rawSummary?.acceptedCount ?? 0;
  const rejectedPointCount = input.traces.length > 0
    ? sumNumber(input.traces.map((trace) => trace.rejectedPointCount))
    : input.rawSummary?.rejectedCount ?? 0;
  const recoveredPointCount = sumNumber(input.traces.map((trace) => trace.recoveredPointCount));
  const duplicateRawEventCount = input.traces.length > 0
    ? sumNumber(input.traces.map((trace) => trace.duplicateRawEventCount))
    : input.rawSummary?.duplicateCount ?? 0;
  const duplicateRecordedAtCount = sumNumber(input.traces.map((trace) => trace.duplicateRecordedAtCount));
  const latestTrace = [...input.traces]
    .sort((left, right) =>
      String(right.lastRecordedAt ?? right.firstRecordedAt ?? "").localeCompare(
        String(left.lastRecordedAt ?? left.firstRecordedAt ?? ""),
      ),
    )[0] ?? null;
  const latestNativeTrackingState = getLatestNativeTrackingState(input.nativeEvents);
  const transitionCount = input.traces.filter((trace) => trace.transitionChanged).length;
  const watchdogStaleCount = input.nativeEvents.filter((event) => event.eventType === "native_watchdog_stale").length;
  const restartFailedCount = input.nativeEvents.filter((event) => RESTART_FAILED_EVENT_TYPES.has(event.eventType)).length;
  const batteryOptimizationWarningCount = input.nativeEvents.filter(
    (event) => event.eventType === "battery_optimization_not_ignored",
  ).length;
  const permissionMissingCount = input.nativeEvents.filter((event) => event.eventType === "permission_missing").length;
  const rawEventCount = input.rawSummary?.rawEventCount ?? sumNumber(input.traces.map((trace) => trace.rawInsertedCount));
  const maxNativeCallbackGapMs = getMaxRecordedAtGapMs(nativeCallbackTimeline.map((event) => event.recordedAt));
  const maxRawRecordedGapMs = maxNumber(input.traces.map((trace) => trace.maxRawGapMs));
  const maxAcceptedPointGapMs = maxNumber([
    ...input.traces.map((trace) => trace.maxAcceptedGapMs),
    input.diagnostics?.maxRecordedGapMs ?? 0,
  ]);

  return {
    acceptedPointCount,
    batteryOptimizationWarningCount,
    callbackCount: input.diagnostics?.callbackCount ?? nativeCallbackTimeline.length,
    duplicateRawEventCount,
    duplicateRecordedAtCount,
    firstRawRecordedAt: getEarliestRecordedAt([
      input.rawSummary?.firstRecordedAt,
      ...input.traces.map((trace) => trace.firstRecordedAt),
    ]),
    lastActiveProfile: latestTrace?.activeProfile ?? latestTrace?.previousProfile ?? null,
    lastRawRecordedAt: getLatestRecordedAt([
      input.rawSummary?.lastRecordedAt,
      ...input.traces.map((trace) => trace.lastRecordedAt),
    ]),
    latestNativeTrackingState,
    maxAcceptedPointGapMs,
    maxNativeCallbackGapMs,
    maxRawRecordedGapMs,
    nativeBatchCount,
    nativeCallbackCount,
    permissionMissingCount,
    rawEventCount,
    recoveredPointCount,
    recordingStartedAt: getEarliestRecordedAt(
      input.nativeEvents
        .filter((event) => event.eventType === "native_service_started")
        .map((event) => event.recordedAt),
    ),
    rejectedPointCount,
    restartFailedCount,
    restartRequestedCount: input.nativeEvents.filter((event) => RESTART_REQUESTED_EVENT_TYPES.has(event.eventType)).length,
    restartSucceededCount: input.nativeEvents.filter((event) => RESTART_SUCCEEDED_EVENT_TYPES.has(event.eventType)).length,
    suspiciousFindings: buildSuspiciousFindings({
      acceptedPointCount,
      batteryOptimizationWarningCount,
      latestNativeTrackingState,
      maxNativeCallbackGapMs,
      maxRawRecordedGapMs,
      nativeBatchCount,
      nativeCallbackTimelineCount: nativeCallbackTimeline.length,
      nativeEvents: input.nativeEvents,
      nativeServiceStartedCount: input.nativeEvents.filter((event) => event.eventType === "native_service_started").length,
      permissionMissingCount,
      rawEventCount,
      restartFailedCount,
      watchdogStaleCount,
    }),
    transitionCount,
    tripLocalId: input.tripLocalId,
    watchdogStaleCount,
    watchdogTickCount: input.nativeEvents.filter((event) => event.eventType === "native_watchdog_tick").length,
  };
}

export function buildAndroidRecordingDiagnostics(
  input: BuildAndroidRecordingDiagnosticsInput,
): AndroidRecordingDiagnosticsBundle {
  const traces = input.diagnosticEvents
    .map(toProcessingTracePayload)
    .filter((trace): trace is ProcessingTracePayload => trace !== null);
  const tripIds = new Set<string>();

  if (input.recordingSession?.activeTripId) {
    tripIds.add(input.recordingSession.activeTripId);
  }

  for (const rawSummary of input.rawLocationEventTrips) {
    tripIds.add(rawSummary.tripLocalId);
  }

  for (const diagnostics of input.tripDiagnostics) {
    tripIds.add(diagnostics.tripLocalId);
  }

  for (const event of input.nativeEvents) {
    if (event.tripLocalId) {
      tripIds.add(event.tripLocalId);
    }
  }

  for (const trace of traces) {
    if (trace.tripLocalId) {
      tripIds.add(trace.tripLocalId);
    }
  }

  const recentTrips = [...tripIds]
    .map((tripLocalId) => {
      const nativeEvents = input.nativeEvents.filter((event) => event.tripLocalId === tripLocalId);
      const tripTraces = traces.filter((trace) => trace.tripLocalId === tripLocalId);
      const rawSummary = input.rawLocationEventTrips.find((summary) => summary.tripLocalId === tripLocalId) ?? null;
      const diagnostics = input.tripDiagnostics.find((entry) => entry.tripLocalId === tripLocalId) ?? null;

      return {
        latestActivityAt: getTripLatestActivityAt({
          diagnostics,
          nativeEvents,
          rawSummary,
          traces: tripTraces,
        }),
        tripDiagnostics: buildTripDiagnostics({
          diagnostics,
          nativeEvents,
          rawSummary,
          traces: tripTraces,
          tripLocalId,
        }),
      };
    })
    .sort((left, right) => String(right.latestActivityAt ?? "").localeCompare(String(left.latestActivityAt ?? "")))
    .slice(0, RECENT_TRIP_LIMIT)
    .map((entry) => entry.tripDiagnostics);

  return {
    currentSession: getCurrentSessionSummary(input.recordingSession),
    environmentFindings: buildEnvironmentFindings(input),
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    recentTrips,
    unassignedEvents: input.nativeEvents
      .filter((event) => event.tripLocalId === null)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, UNASSIGNED_EVENT_LIMIT)
      .map((event) => ({
        eventType: event.eventType,
        payload: event.payload,
        recordedAt: event.recordedAt,
      })),
  };
}
