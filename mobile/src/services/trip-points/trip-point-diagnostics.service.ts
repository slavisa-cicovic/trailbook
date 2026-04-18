import { Platform } from "react-native";

import type { RecordingMode } from "../../domain/trips";

type WalkRejectReason =
  | "accepted"
  | "duplicate-timestamp"
  | "duplicate-coordinates"
  | "accuracy"
  | "min-movement"
  | "jump-distance"
  | "implied-speed";

interface WalkPointDiagnostics {
  accepted: number;
  accuracy: number;
  duplicateCoordinates: number;
  duplicateTimestamp: number;
  impliedSpeed: number;
  jumpDistance: number;
  lastLoggedAtEventCount: number;
  minMovement: number;
}

const diagnosticsByTripLocalId = new Map<string, WalkPointDiagnostics>();

function createEmptyDiagnostics(): WalkPointDiagnostics {
  return {
    accepted: 0,
    accuracy: 0,
    duplicateCoordinates: 0,
    duplicateTimestamp: 0,
    impliedSpeed: 0,
    jumpDistance: 0,
    lastLoggedAtEventCount: 0,
    minMovement: 0,
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

function getTotalEventCount(diagnostics: WalkPointDiagnostics) {
  return (
    diagnostics.accepted +
    diagnostics.accuracy +
    diagnostics.duplicateCoordinates +
    diagnostics.duplicateTimestamp +
    diagnostics.impliedSpeed +
    diagnostics.jumpDistance +
    diagnostics.minMovement
  );
}

function maybeLogDiagnostics(tripLocalId: string, diagnostics: WalkPointDiagnostics) {
  const eventCount = getTotalEventCount(diagnostics);

  if (eventCount - diagnostics.lastLoggedAtEventCount < 10) {
    return;
  }

  diagnostics.lastLoggedAtEventCount = eventCount;

  console.info("[Trailbook][walk-diagnostics]", {
    accepted: diagnostics.accepted,
    duplicateTimestamp: diagnostics.duplicateTimestamp,
    duplicateCoordinates: diagnostics.duplicateCoordinates,
    platform: Platform.OS,
    rejectedByAccuracy: diagnostics.accuracy,
    rejectedByImpliedSpeed: diagnostics.impliedSpeed,
    rejectedByJumpDistance: diagnostics.jumpDistance,
    rejectedByMinMovement: diagnostics.minMovement,
    tripLocalId,
  });
}

export function recordTripPointDiagnostic(
  tripLocalId: string,
  recordingMode: RecordingMode,
  reason: WalkRejectReason,
) {
  if (recordingMode !== "walk" || Platform.OS !== "android") {
    return;
  }

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

  console.info("[Trailbook][walk-diagnostics][final]", {
    accepted: diagnostics.accepted,
    duplicateTimestamp: diagnostics.duplicateTimestamp,
    duplicateCoordinates: diagnostics.duplicateCoordinates,
    platform: Platform.OS,
    rejectedByAccuracy: diagnostics.accuracy,
    rejectedByImpliedSpeed: diagnostics.impliedSpeed,
    rejectedByJumpDistance: diagnostics.jumpDistance,
    rejectedByMinMovement: diagnostics.minMovement,
    tripLocalId,
  });
}
