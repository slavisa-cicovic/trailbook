import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type {
  TripDiagnostics,
  TripDiagnosticsPlatform,
  TripDiagnosticsRecentEvent,
} from "../domain/trip-diagnostics";
import type { RecordingMode } from "../domain/trips";

function normalizeRecentEvent(
  value: Partial<TripDiagnosticsRecentEvent> & Pick<TripDiagnosticsRecentEvent, "receivedAt" | "recordedAt">,
): TripDiagnosticsRecentEvent {
  return {
    accuracy: value.accuracy ?? null,
    altitude: value.altitude ?? null,
    decision: value.decision ?? null,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    receivedAt: value.receivedAt,
    recordedAt: value.recordedAt,
    source: value.source ?? "foreground",
    speed: value.speed ?? null,
  };
}

function normalizePlatform(value: string | undefined): TripDiagnosticsPlatform {
  switch (value) {
    case "android":
    case "ios":
    case "web":
      return value;
    default:
      return "unknown";
  }
}

function normalizeRecordingMode(value: string | undefined): RecordingMode {
  switch (value) {
    case "walk":
    case "bike":
    case "drive":
    case "boat":
    case "plane":
    case "auto":
      return value;
    default:
      return "walk";
  }
}

function normalizeTripDiagnostics(
  value: Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">,
): TripDiagnostics {
  return {
    accepted: value.accepted ?? 0,
    backgroundAccepted: value.backgroundAccepted ?? 0,
    backgroundCallbacks: value.backgroundCallbacks ?? 0,
    backgroundRejected: value.backgroundRejected ?? 0,
    callbackCount: value.callbackCount ?? 0,
    decisionCount: value.decisionCount ?? 0,
    duplicateCoordinates: value.duplicateCoordinates ?? 0,
    duplicateTimestamp: value.duplicateTimestamp ?? 0,
    foregroundAccepted: value.foregroundAccepted ?? 0,
    foregroundCallbacks: value.foregroundCallbacks ?? 0,
    foregroundRejected: value.foregroundRejected ?? 0,
    maxCallbackGapMs: value.maxCallbackGapMs ?? 0,
    maxRecordedGapMs: value.maxRecordedGapMs ?? 0,
    platform: normalizePlatform(value.platform),
    recentEvents: Array.isArray(value.recentEvents) ? value.recentEvents.map(normalizeRecentEvent) : [],
    recordingMode: normalizeRecordingMode(value.recordingMode),
    rejectedByAccuracy: value.rejectedByAccuracy ?? 0,
    rejectedByImpliedSpeed: value.rejectedByImpliedSpeed ?? 0,
    rejectedByJumpDistance: value.rejectedByJumpDistance ?? 0,
    rejectedByMinMovement: value.rejectedByMinMovement ?? 0,
    sessionDuplicateRecordedAt: value.sessionDuplicateRecordedAt ?? 0,
    tripLocalId: value.tripLocalId,
    updatedAt: value.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function loadTripDiagnostics(): Promise<TripDiagnostics[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripDiagnostics);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as Array<Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">>).map(
    normalizeTripDiagnostics,
  );
}

export async function saveTripDiagnostics(tripDiagnostics: TripDiagnostics[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.tripDiagnostics, JSON.stringify(tripDiagnostics));
}
