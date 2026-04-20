import type { CurrentLocationSnapshot } from "../location/location.service";
import type { RecordingMode } from "../../domain/trips";

export type LocationCallbackSource = "foreground" | "background";

export type TripPointDiagnosticReason =
  | "accepted"
  | "duplicate-timestamp"
  | "duplicate-coordinates"
  | "session-duplicate-recorded-at"
  | "accuracy"
  | "min-movement"
  | "jump-distance"
  | "implied-speed";

interface LocationCallbackEvent {
  accuracy: number | null;
  altitude: number | null;
  decision: TripPointDiagnosticReason | null;
  latitude: number;
  longitude: number;
  receivedAt: string;
  recordedAt: string;
  source: LocationCallbackSource;
  speed: number | null;
}

interface TripPointDiagnostics {
  accepted: number;
  accuracy: number;
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
  impliedSpeed: number;
  jumpDistance: number;
  lastCallbackReceivedAtMs: number | null;
  lastLoggedAtCallbackCount: number;
  lastRecordedAtMs: number | null;
  maxCallbackGapMs: number;
  maxRecordedGapMs: number;
  minMovement: number;
  recentEvents: LocationCallbackEvent[];
  sessionDuplicateRecordedAt: number;
}

interface RecordTripPointDiagnosticOptions {
  recordedAt?: string;
  source?: LocationCallbackSource;
}

const MAX_RECENT_EVENTS = 200;

const diagnosticsByTripLocalId = new Map<string, TripPointDiagnostics>();

function createEmptyDiagnostics(): TripPointDiagnostics {
  return {
    accepted: 0,
    accuracy: 0,
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
    impliedSpeed: 0,
    jumpDistance: 0,
    lastCallbackReceivedAtMs: null,
    lastLoggedAtCallbackCount: 0,
    lastRecordedAtMs: null,
    maxCallbackGapMs: 0,
    maxRecordedGapMs: 0,
    minMovement: 0,
    recentEvents: [],
    sessionDuplicateRecordedAt: 0,
  };
}

function getDiagnostics(tripLocalId: string) {
  const existing = diagnosticsByTripLocalId.get(tripLocalId);

  if (existing) {
    return existing;
  }

  const created = createEmptyDiagnostics();
  diagnosticsByTripLocalId.set(tripLocalId, created);
  return created;
}

function trimRecentEvents(diagnostics: TripPointDiagnostics) {
  if (diagnostics.recentEvents.length <= MAX_RECENT_EVENTS) {
    return;
  }

  diagnostics.recentEvents.splice(0, diagnostics.recentEvents.length - MAX_RECENT_EVENTS);
}

function buildSummary(tripLocalId: string, diagnostics: TripPointDiagnostics) {
  return {
    accepted: diagnostics.accepted,
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
    rejectedByAccuracy: diagnostics.accuracy,
    rejectedByImpliedSpeed: diagnostics.impliedSpeed,
    rejectedByJumpDistance: diagnostics.jumpDistance,
    rejectedByMinMovement: diagnostics.minMovement,
    sessionDuplicateRecordedAt: diagnostics.sessionDuplicateRecordedAt,
    tripLocalId,
    undecidedCallbacks: diagnostics.callbackCount - diagnostics.decisionCount,
  };
}

function maybeLogDiagnostics(tripLocalId: string, diagnostics: TripPointDiagnostics) {
  if (diagnostics.callbackCount - diagnostics.lastLoggedAtCallbackCount < 10) {
    return;
  }

  diagnostics.lastLoggedAtCallbackCount = diagnostics.callbackCount;

  console.info("[Trailbook][location-summary]", buildSummary(tripLocalId, diagnostics));
}

function attachDecisionToRecentEvent(
  diagnostics: TripPointDiagnostics,
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
      event.decision === null &&
      (!options.source || event.source === options.source)
    ) {
      event.decision = reason;
      return;
    }
  }
}

export function recordLocationCallback(
  tripLocalId: string,
  recordingMode: RecordingMode,
  source: LocationCallbackSource,
  snapshot: CurrentLocationSnapshot,
) {
  const diagnostics = getDiagnostics(tripLocalId);
  const receivedAt = new Date().toISOString();
  const receivedAtMs = Date.now();
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  diagnostics.callbackCount += 1;

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

  console.info("[Trailbook][location-callback]", {
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
  });

  maybeLogDiagnostics(tripLocalId, diagnostics);
}

export function recordTripPointDiagnostic(
  tripLocalId: string,
  recordingMode: RecordingMode,
  reason: TripPointDiagnosticReason,
  options: RecordTripPointDiagnosticOptions = {},
) {
  const diagnostics = getDiagnostics(tripLocalId);

  switch (reason) {
    case "accepted":
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
      diagnostics.accuracy += 1;
      break;
    case "min-movement":
      diagnostics.minMovement += 1;
      break;
    case "jump-distance":
      diagnostics.jumpDistance += 1;
      break;
    case "implied-speed":
      diagnostics.impliedSpeed += 1;
      break;
  }

  diagnostics.decisionCount += 1;

  if (options.source === "foreground") {
    if (reason === "accepted") {
      diagnostics.foregroundAccepted += 1;
    } else {
      diagnostics.foregroundRejected += 1;
    }
  }

  if (options.source === "background") {
    if (reason === "accepted") {
      diagnostics.backgroundAccepted += 1;
    } else {
      diagnostics.backgroundRejected += 1;
    }
  }

  attachDecisionToRecentEvent(diagnostics, reason, options);

  console.info("[Trailbook][location-decision]", {
    reason,
    recordedAt: options.recordedAt ?? null,
    recordingMode,
    source: options.source ?? null,
    tripLocalId,
  });

  maybeLogDiagnostics(tripLocalId, diagnostics);
}

export function resetTripPointDiagnostics(tripLocalId: string) {
  diagnosticsByTripLocalId.delete(tripLocalId);
}

export function flushTripPointDiagnostics(tripLocalId: string) {
  const diagnostics = diagnosticsByTripLocalId.get(tripLocalId);

  if (!diagnostics) {
    return;
  }

  console.info("[Trailbook][location-summary][final]", {
    ...buildSummary(tripLocalId, diagnostics),
    recentEvents: diagnostics.recentEvents.slice(-20),
  });
}
