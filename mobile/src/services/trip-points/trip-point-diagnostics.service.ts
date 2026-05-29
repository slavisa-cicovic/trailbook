import { Platform } from "react-native";

import type { CurrentLocationSnapshot } from "../location/location.service";
import type {
  TripDiagnosticsAccuracyHistogram,
  TripDiagnostics,
  TripDiagnosticsPlatform,
  TripDiagnosticsRecentEvent,
} from "../../domain/trip-diagnostics";
import type { RecordingMode } from "../../domain/trips";
import { STATIC_FLAGS } from "../../constants/feature-flags";
import {
  loadTripDiagnostics as loadPersistedTripDiagnostics,
  saveTripDiagnostics,
} from "../../storage/trip-diagnostics-storage";

export type LocationCallbackSource = "foreground" | "background";

export type TripPointDiagnosticReason =
  | "accepted"
  | "accepted-after-long-gap"
  | "accepted-early-session"
  | "accepted-after-resume"
  | "confirmed-pending-continuity"
  | "duplicate-timestamp"
  | "duplicate-coordinates"
  | "session-duplicate-recorded-at"
  | "accuracy"
  | "min-movement"
  | "jump-distance"
  | "implied-speed"
  | "rejected-pending-continuity"
  | "removed-as-spike";

interface MutableTripPointDiagnostics {
  accepted: number;
  acceptedAfterLongGap: number;
  accuracyHistogram: TripDiagnosticsAccuracyHistogram;
  backgroundAccepted: number;
  backgroundCallbacks: number;
  backgroundRejected: number;
  callbackCount: number;
  decisionCount: number;
  duplicateCoordinates: number;
  duplicateTimestamp: number;
  foregroundAccepted: number;
  foregroundCallbacks: number;
  foregroundRejected: number;
  lastCallbackReceivedAtMs: number | null;
  lastLoggedAtCallbackCount: number;
  lastRecordedAtMs: number | null;
  maxCallbackGapMs: number;
  maxRecordedGapMs: number;
  recentEvents: TripDiagnosticsRecentEvent[];
  recordingMode: RecordingMode;
  rejectedByAccuracy: number;
  rejectedByImpliedSpeed: number;
  rejectedByJumpDistance: number;
  rejectedByMinMovement: number;
  sessionDuplicateRecordedAt: number;
  tripLocalId: string;
  updatedAt: string;
}

interface RecordTripPointDiagnosticOptions {
  recordedAt?: string;
  source?: LocationCallbackSource;
}

const MAX_IN_MEMORY_RECENT_EVENTS = 200;
const MAX_PERSISTED_RECENT_EVENTS = 20;
const diagnosticsByTripLocalId = new Map<string, MutableTripPointDiagnostics>();
let diagnosticsHydrationPromise: Promise<void> | null = null;
let diagnosticsPersistenceQueue = Promise.resolve();

function getPlatform(): TripDiagnosticsPlatform {
  switch (Platform.OS) {
    case "android":
    case "ios":
    case "web":
      return Platform.OS;
    default:
      return "unknown";
  }
}

export function isTripDiagnosticsEnabled() {
  return STATIC_FLAGS.tripDiagnosticsEnabled;
}

function createEmptyDiagnostics(
  tripLocalId: string,
  recordingMode: RecordingMode,
): MutableTripPointDiagnostics {
  return {
    accepted: 0,
    acceptedAfterLongGap: 0,
    accuracyHistogram: {
      gte120m: 0,
      lt10m: 0,
      lt20m: 0,
      lt30m: 0,
      lt50m: 0,
      lt80m: 0,
      lt120m: 0,
      unknown: 0,
    },
    backgroundAccepted: 0,
    backgroundCallbacks: 0,
    backgroundRejected: 0,
    callbackCount: 0,
    decisionCount: 0,
    duplicateCoordinates: 0,
    duplicateTimestamp: 0,
    foregroundAccepted: 0,
    foregroundCallbacks: 0,
    foregroundRejected: 0,
    lastCallbackReceivedAtMs: null,
    lastLoggedAtCallbackCount: 0,
    lastRecordedAtMs: null,
    maxCallbackGapMs: 0,
    maxRecordedGapMs: 0,
    recentEvents: [],
    recordingMode,
    rejectedByAccuracy: 0,
    rejectedByImpliedSpeed: 0,
    rejectedByJumpDistance: 0,
    rejectedByMinMovement: 0,
    sessionDuplicateRecordedAt: 0,
    tripLocalId,
    updatedAt: new Date().toISOString(),
  };
}

function cloneAccuracyHistogram(
  histogram: TripDiagnosticsAccuracyHistogram,
): TripDiagnosticsAccuracyHistogram {
  return { ...histogram };
}

function recordAccuracyHistogramBucket(
  histogram: TripDiagnosticsAccuracyHistogram,
  accuracy: number | null,
) {
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy < 0) {
    histogram.unknown += 1;
    return;
  }

  if (accuracy < 10) {
    histogram.lt10m += 1;
    return;
  }

  if (accuracy < 20) {
    histogram.lt20m += 1;
    return;
  }

  if (accuracy < 30) {
    histogram.lt30m += 1;
    return;
  }

  if (accuracy < 50) {
    histogram.lt50m += 1;
    return;
  }

  if (accuracy < 80) {
    histogram.lt80m += 1;
    return;
  }

  if (accuracy < 120) {
    histogram.lt120m += 1;
    return;
  }

  histogram.gte120m += 1;
}

function cloneRecentEvent(event: TripDiagnosticsRecentEvent): TripDiagnosticsRecentEvent {
  return {
    accuracy: event.accuracy,
    altitude: event.altitude,
    decision: event.decision,
    latitude: event.latitude,
    longitude: event.longitude,
    receivedAt: event.receivedAt,
    recordedAt: event.recordedAt,
    source: event.source,
    speed: event.speed,
  };
}

function mergeDiagnostics(
  target: MutableTripPointDiagnostics,
  source: TripDiagnostics,
): MutableTripPointDiagnostics {
  target.accepted += source.accepted;
  target.acceptedAfterLongGap += source.acceptedAfterLongGap;
  target.accuracyHistogram.gte120m += source.accuracyHistogram.gte120m;
  target.accuracyHistogram.lt10m += source.accuracyHistogram.lt10m;
  target.accuracyHistogram.lt20m += source.accuracyHistogram.lt20m;
  target.accuracyHistogram.lt30m += source.accuracyHistogram.lt30m;
  target.accuracyHistogram.lt50m += source.accuracyHistogram.lt50m;
  target.accuracyHistogram.lt80m += source.accuracyHistogram.lt80m;
  target.accuracyHistogram.lt120m += source.accuracyHistogram.lt120m;
  target.accuracyHistogram.unknown += source.accuracyHistogram.unknown;
  target.backgroundAccepted += source.backgroundAccepted;
  target.backgroundCallbacks += source.backgroundCallbacks;
  target.backgroundRejected += source.backgroundRejected;
  target.callbackCount += source.callbackCount;
  target.decisionCount += source.decisionCount;
  target.duplicateCoordinates += source.duplicateCoordinates;
  target.duplicateTimestamp += source.duplicateTimestamp;
  target.foregroundAccepted += source.foregroundAccepted;
  target.foregroundCallbacks += source.foregroundCallbacks;
  target.foregroundRejected += source.foregroundRejected;
  target.maxCallbackGapMs = Math.max(target.maxCallbackGapMs, source.maxCallbackGapMs);
  target.maxRecordedGapMs = Math.max(target.maxRecordedGapMs, source.maxRecordedGapMs);
  target.recentEvents = [...source.recentEvents.map(cloneRecentEvent), ...target.recentEvents].slice(
    -MAX_IN_MEMORY_RECENT_EVENTS,
  );
  target.recordingMode = source.recordingMode;
  target.rejectedByAccuracy += source.rejectedByAccuracy;
  target.rejectedByImpliedSpeed += source.rejectedByImpliedSpeed;
  target.rejectedByJumpDistance += source.rejectedByJumpDistance;
  target.rejectedByMinMovement += source.rejectedByMinMovement;
  target.sessionDuplicateRecordedAt += source.sessionDuplicateRecordedAt;
  target.updatedAt =
    new Date(source.updatedAt).getTime() > new Date(target.updatedAt).getTime()
      ? source.updatedAt
      : target.updatedAt;

  return target;
}

function ensureDiagnosticsHydrated() {
  if (!isTripDiagnosticsEnabled()) {
    return;
  }

  if (!diagnosticsHydrationPromise) {
    diagnosticsHydrationPromise = loadPersistedTripDiagnostics()
      .then((persistedDiagnostics) => {
        for (const persistedDiagnosticsEntry of persistedDiagnostics) {
          const existing = diagnosticsByTripLocalId.get(persistedDiagnosticsEntry.tripLocalId);

          if (existing) {
            mergeDiagnostics(existing, persistedDiagnosticsEntry);
            continue;
          }

          diagnosticsByTripLocalId.set(
            persistedDiagnosticsEntry.tripLocalId,
            mergeDiagnostics(
              createEmptyDiagnostics(
                persistedDiagnosticsEntry.tripLocalId,
                persistedDiagnosticsEntry.recordingMode,
              ),
              persistedDiagnosticsEntry,
            ),
          );
        }
      })
      .catch(() => undefined);
  }
}

function trimRecentEvents(diagnostics: MutableTripPointDiagnostics) {
  if (diagnostics.recentEvents.length <= MAX_IN_MEMORY_RECENT_EVENTS) {
    return;
  }

  diagnostics.recentEvents.splice(0, diagnostics.recentEvents.length - MAX_IN_MEMORY_RECENT_EVENTS);
}

function toTripDiagnosticsSummary(diagnostics: MutableTripPointDiagnostics): TripDiagnostics {
  return {
    accepted: diagnostics.accepted,
    acceptedAfterLongGap: diagnostics.acceptedAfterLongGap,
    accuracyHistogram: cloneAccuracyHistogram(diagnostics.accuracyHistogram),
    backgroundAccepted: diagnostics.backgroundAccepted,
    backgroundCallbacks: diagnostics.backgroundCallbacks,
    backgroundRejected: diagnostics.backgroundRejected,
    callbackCount: diagnostics.callbackCount,
    decisionCount: diagnostics.decisionCount,
    duplicateCoordinates: diagnostics.duplicateCoordinates,
    duplicateTimestamp: diagnostics.duplicateTimestamp,
    foregroundAccepted: diagnostics.foregroundAccepted,
    foregroundCallbacks: diagnostics.foregroundCallbacks,
    foregroundRejected: diagnostics.foregroundRejected,
    maxCallbackGapMs: diagnostics.maxCallbackGapMs,
    maxRecordedGapMs: diagnostics.maxRecordedGapMs,
    platform: getPlatform(),
    recentEvents: diagnostics.recentEvents.slice(-MAX_PERSISTED_RECENT_EVENTS).map(cloneRecentEvent),
    recordingMode: diagnostics.recordingMode,
    rejectedByAccuracy: diagnostics.rejectedByAccuracy,
    rejectedByImpliedSpeed: diagnostics.rejectedByImpliedSpeed,
    rejectedByJumpDistance: diagnostics.rejectedByJumpDistance,
    rejectedByMinMovement: diagnostics.rejectedByMinMovement,
    sessionDuplicateRecordedAt: diagnostics.sessionDuplicateRecordedAt,
    tripLocalId: diagnostics.tripLocalId,
    updatedAt: diagnostics.updatedAt,
  };
}

function buildSummary(diagnostics: MutableTripPointDiagnostics) {
  return {
    ...toTripDiagnosticsSummary(diagnostics),
    undecidedCallbacks: diagnostics.callbackCount - diagnostics.decisionCount,
  };
}

function queueDiagnosticsPersist() {
  if (!isTripDiagnosticsEnabled()) {
    return;
  }

  diagnosticsPersistenceQueue = diagnosticsPersistenceQueue
    .then(async () => {
      const serializedDiagnostics = [...diagnosticsByTripLocalId.values()].map(toTripDiagnosticsSummary);
      await saveTripDiagnostics(serializedDiagnostics);
    })
    .catch(() => undefined);
}

function getDiagnostics(tripLocalId: string, recordingMode: RecordingMode) {
  if (!isTripDiagnosticsEnabled()) {
    return null;
  }

  ensureDiagnosticsHydrated();

  const existing = diagnosticsByTripLocalId.get(tripLocalId);

  if (existing) {
    existing.recordingMode = recordingMode;
    return existing;
  }

  const created = createEmptyDiagnostics(tripLocalId, recordingMode);
  diagnosticsByTripLocalId.set(tripLocalId, created);
  queueDiagnosticsPersist();
  return created;
}

function maybeLogDiagnostics(diagnostics: MutableTripPointDiagnostics) {
  if (diagnostics.callbackCount - diagnostics.lastLoggedAtCallbackCount < 10) {
    return;
  }

  diagnostics.lastLoggedAtCallbackCount = diagnostics.callbackCount;

  console.info("[Trailbook][location-summary]", JSON.stringify(buildSummary(diagnostics)));
}

function attachDecisionToRecentEvent(
  diagnostics: MutableTripPointDiagnostics,
  reason: TripPointDiagnosticReason,
  options: RecordTripPointDiagnosticOptions,
) {
  if (!options.recordedAt) {
    return;
  }

  for (let index = diagnostics.recentEvents.length - 1; index >= 0; index -= 1) {
    const event = diagnostics.recentEvents[index];

    if (
      event.recordedAt === options.recordedAt &&
      (!options.source || event.source === options.source)
    ) {
      if (event.decision !== null && reason !== "removed-as-spike") {
        continue;
      }

      event.decision = reason;
      return;
    }
  }
}

function isAcceptedDecisionReason(reason: TripPointDiagnosticReason) {
  return (
    reason === "accepted" ||
    reason === "accepted-after-long-gap" ||
    reason === "accepted-early-session" ||
    reason === "accepted-after-resume" ||
    reason === "confirmed-pending-continuity"
  );
}

function shouldAffectDecisionCounters(reason: TripPointDiagnosticReason) {
  return reason !== "removed-as-spike";
}

export function recordLocationCallback(
  tripLocalId: string,
  recordingMode: RecordingMode,
  source: LocationCallbackSource,
  snapshot: CurrentLocationSnapshot,
) {
  const diagnostics = getDiagnostics(tripLocalId, recordingMode);

  if (!diagnostics) {
    return;
  }

  const receivedAt = new Date().toISOString();
  const receivedAtMs = Date.now();
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  diagnostics.callbackCount += 1;
  diagnostics.updatedAt = receivedAt;
  recordAccuracyHistogramBucket(diagnostics.accuracyHistogram, snapshot.accuracy);

  if (source === "foreground") {
    diagnostics.foregroundCallbacks += 1;
  } else {
    diagnostics.backgroundCallbacks += 1;
  }

  if (diagnostics.lastCallbackReceivedAtMs !== null) {
    diagnostics.maxCallbackGapMs = Math.max(
      diagnostics.maxCallbackGapMs,
      receivedAtMs - diagnostics.lastCallbackReceivedAtMs,
    );
  }

  if (diagnostics.lastRecordedAtMs !== null && Number.isFinite(recordedAtMs)) {
    diagnostics.maxRecordedGapMs = Math.max(
      diagnostics.maxRecordedGapMs,
      recordedAtMs - diagnostics.lastRecordedAtMs,
    );
  }

  diagnostics.lastCallbackReceivedAtMs = receivedAtMs;
  diagnostics.lastRecordedAtMs = Number.isFinite(recordedAtMs) ? recordedAtMs : diagnostics.lastRecordedAtMs;
  diagnostics.recentEvents.push({
    accuracy: snapshot.accuracy,
    altitude: snapshot.altitude,
    decision: null,
    latitude: snapshot.latitude,
    longitude: snapshot.longitude,
    receivedAt,
    recordedAt: snapshot.recordedAt,
    source,
    speed: snapshot.speed,
  });
  trimRecentEvents(diagnostics);

  console.info(
    "[Trailbook][location-callback]",
    JSON.stringify({
      accuracy: snapshot.accuracy,
      altitude: snapshot.altitude,
      latitude: snapshot.latitude,
      longitude: snapshot.longitude,
      receivedAt,
      recordedAt: snapshot.recordedAt,
      recordingMode,
      source,
      speed: snapshot.speed,
      tripLocalId,
    }),
  );

  maybeLogDiagnostics(diagnostics);
  queueDiagnosticsPersist();
}

export function recordTripPointDiagnostic(
  tripLocalId: string,
  recordingMode: RecordingMode,
  reason: TripPointDiagnosticReason,
  options: RecordTripPointDiagnosticOptions = {},
) {
  const diagnostics = getDiagnostics(tripLocalId, recordingMode);

  if (!diagnostics) {
    return;
  }

  switch (reason) {
    case "accepted":
      diagnostics.accepted += 1;
      break;
    case "accepted-after-long-gap":
      diagnostics.accepted += 1;
      diagnostics.acceptedAfterLongGap += 1;
      break;
    case "accepted-early-session":
    case "accepted-after-resume":
    case "confirmed-pending-continuity":
      diagnostics.accepted += 1;
      break;
    case "duplicate-timestamp":
      diagnostics.duplicateTimestamp += 1;
      break;
    case "duplicate-coordinates":
      diagnostics.duplicateCoordinates += 1;
      break;
    case "session-duplicate-recorded-at":
      diagnostics.sessionDuplicateRecordedAt += 1;
      break;
    case "accuracy":
      diagnostics.rejectedByAccuracy += 1;
      break;
    case "min-movement":
      diagnostics.rejectedByMinMovement += 1;
      break;
    case "jump-distance":
      diagnostics.rejectedByJumpDistance += 1;
      break;
    case "implied-speed":
      diagnostics.rejectedByImpliedSpeed += 1;
      break;
    case "rejected-pending-continuity":
    case "removed-as-spike":
      break;
  }

  if (shouldAffectDecisionCounters(reason)) {
    diagnostics.decisionCount += 1;
  }
  diagnostics.updatedAt = new Date().toISOString();

  if (options.source === "foreground") {
    if (isAcceptedDecisionReason(reason)) {
      diagnostics.foregroundAccepted += 1;
    } else if (shouldAffectDecisionCounters(reason)) {
      diagnostics.foregroundRejected += 1;
    }
  }

  if (options.source === "background") {
    if (isAcceptedDecisionReason(reason)) {
      diagnostics.backgroundAccepted += 1;
    } else if (shouldAffectDecisionCounters(reason)) {
      diagnostics.backgroundRejected += 1;
    }
  }

  attachDecisionToRecentEvent(diagnostics, reason, options);

  console.info(
    "[Trailbook][location-decision]",
    JSON.stringify({
      reason,
      recordedAt: options.recordedAt ?? null,
      recordingMode,
      source: options.source ?? null,
      tripLocalId,
    }),
  );

  maybeLogDiagnostics(diagnostics);
  queueDiagnosticsPersist();
}

export function resetTripPointDiagnostics(tripLocalId: string) {
  if (!isTripDiagnosticsEnabled()) {
    return;
  }

  diagnosticsByTripLocalId.delete(tripLocalId);
  queueDiagnosticsPersist();
}

export function flushTripPointDiagnostics(tripLocalId: string) {
  if (!isTripDiagnosticsEnabled()) {
    return;
  }

  ensureDiagnosticsHydrated();

  const diagnostics = diagnosticsByTripLocalId.get(tripLocalId);

  if (!diagnostics) {
    return;
  }

  diagnostics.updatedAt = new Date().toISOString();

  console.info(
    "[Trailbook][location-summary][final]",
    JSON.stringify({
      ...buildSummary(diagnostics),
      recentEvents: diagnostics.recentEvents.slice(-20).map(cloneRecentEvent),
    }),
  );

  queueDiagnosticsPersist();
}

export async function getTripDiagnosticsForSync(tripLocalId: string): Promise<TripDiagnostics | null> {
  if (!isTripDiagnosticsEnabled()) {
    return null;
  }

  await diagnosticsPersistenceQueue.catch(() => undefined);
  ensureDiagnosticsHydrated();
  await diagnosticsHydrationPromise?.catch(() => undefined);

  const diagnostics =
    diagnosticsByTripLocalId.get(tripLocalId) ??
    (await loadPersistedTripDiagnostics()).find((entry) => entry.tripLocalId === tripLocalId) ??
    null;

  if (!diagnostics) {
    return null;
  }

  return "lastCallbackReceivedAtMs" in diagnostics
    ? toTripDiagnosticsSummary(diagnostics)
    : diagnostics;
}

void diagnosticsHydrationPromise;
ensureDiagnosticsHydrated();
