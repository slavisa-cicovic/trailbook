import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type {
  TripDiagnosticsAccuracyHistogram,
  TripDiagnostics,
  TripDiagnosticsPlatform,
  TripDiagnosticsRecentEvent,
} from "../domain/trip-diagnostics";
import type { RecordingMode } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

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

function normalizeAccuracyHistogram(
  value: Partial<TripDiagnosticsAccuracyHistogram> | undefined,
): TripDiagnosticsAccuracyHistogram {
  return {
    gte120m: value?.gte120m ?? 0,
    lt10m: value?.lt10m ?? 0,
    lt20m: value?.lt20m ?? 0,
    lt30m: value?.lt30m ?? 0,
    lt50m: value?.lt50m ?? 0,
    lt80m: value?.lt80m ?? 0,
    lt120m: value?.lt120m ?? 0,
    unknown: value?.unknown ?? 0,
  };
}

function normalizeTripDiagnostics(
  value: Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">,
): TripDiagnostics {
  return {
    accepted: value.accepted ?? 0,
    acceptedAfterLongGap: value.acceptedAfterLongGap ?? 0,
    accuracyHistogram: normalizeAccuracyHistogram(value.accuracyHistogram),
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

interface TripDiagnosticsRow {
  accepted: number;
  accepted_after_long_gap: number;
  accuracy_histogram_json: string;
  background_accepted: number;
  background_callbacks: number;
  background_rejected: number;
  callback_count: number;
  decision_count: number;
  duplicate_coordinates: number;
  duplicate_timestamp: number;
  foreground_accepted: number;
  foreground_callbacks: number;
  foreground_rejected: number;
  max_callback_gap_ms: number;
  max_recorded_gap_ms: number;
  platform: TripDiagnosticsPlatform;
  recent_events_json: string;
  recording_mode: RecordingMode;
  rejected_by_accuracy: number;
  rejected_by_implied_speed: number;
  rejected_by_jump_distance: number;
  rejected_by_min_movement: number;
  session_duplicate_recorded_at: number;
  trip_local_id: string;
  updated_at: string;
}

function toTripDiagnosticsRow(tripDiagnostics: TripDiagnostics): TripDiagnosticsRow {
  return {
    accepted: tripDiagnostics.accepted,
    accepted_after_long_gap: tripDiagnostics.acceptedAfterLongGap,
    accuracy_histogram_json: JSON.stringify(tripDiagnostics.accuracyHistogram),
    background_accepted: tripDiagnostics.backgroundAccepted,
    background_callbacks: tripDiagnostics.backgroundCallbacks,
    background_rejected: tripDiagnostics.backgroundRejected,
    callback_count: tripDiagnostics.callbackCount,
    decision_count: tripDiagnostics.decisionCount,
    duplicate_coordinates: tripDiagnostics.duplicateCoordinates,
    duplicate_timestamp: tripDiagnostics.duplicateTimestamp,
    foreground_accepted: tripDiagnostics.foregroundAccepted,
    foreground_callbacks: tripDiagnostics.foregroundCallbacks,
    foreground_rejected: tripDiagnostics.foregroundRejected,
    max_callback_gap_ms: tripDiagnostics.maxCallbackGapMs,
    max_recorded_gap_ms: tripDiagnostics.maxRecordedGapMs,
    platform: tripDiagnostics.platform,
    recent_events_json: JSON.stringify(tripDiagnostics.recentEvents),
    recording_mode: tripDiagnostics.recordingMode,
    rejected_by_accuracy: tripDiagnostics.rejectedByAccuracy,
    rejected_by_implied_speed: tripDiagnostics.rejectedByImpliedSpeed,
    rejected_by_jump_distance: tripDiagnostics.rejectedByJumpDistance,
    rejected_by_min_movement: tripDiagnostics.rejectedByMinMovement,
    session_duplicate_recorded_at: tripDiagnostics.sessionDuplicateRecordedAt,
    trip_local_id: tripDiagnostics.tripLocalId,
    updated_at: tripDiagnostics.updatedAt,
  };
}

function toTripDiagnosticsFromRow(row: TripDiagnosticsRow): TripDiagnostics {
  return normalizeTripDiagnostics({
    accepted: row.accepted,
    acceptedAfterLongGap: row.accepted_after_long_gap,
    accuracyHistogram: JSON.parse(row.accuracy_histogram_json) as TripDiagnosticsAccuracyHistogram,
    backgroundAccepted: row.background_accepted,
    backgroundCallbacks: row.background_callbacks,
    backgroundRejected: row.background_rejected,
    callbackCount: row.callback_count,
    decisionCount: row.decision_count,
    duplicateCoordinates: row.duplicate_coordinates,
    duplicateTimestamp: row.duplicate_timestamp,
    foregroundAccepted: row.foreground_accepted,
    foregroundCallbacks: row.foreground_callbacks,
    foregroundRejected: row.foreground_rejected,
    maxCallbackGapMs: row.max_callback_gap_ms,
    maxRecordedGapMs: row.max_recorded_gap_ms,
    platform: row.platform,
    recentEvents: JSON.parse(row.recent_events_json) as TripDiagnosticsRecentEvent[],
    recordingMode: row.recording_mode,
    rejectedByAccuracy: row.rejected_by_accuracy,
    rejectedByImpliedSpeed: row.rejected_by_implied_speed,
    rejectedByJumpDistance: row.rejected_by_jump_distance,
    rejectedByMinMovement: row.rejected_by_min_movement,
    sessionDuplicateRecordedAt: row.session_duplicate_recorded_at,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
  });
}

async function loadLegacyTripDiagnosticsFromAsyncStorage(): Promise<TripDiagnostics[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripDiagnostics);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as Array<Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">>).map(
    normalizeTripDiagnostics,
  );
}

async function ensureTripDiagnosticsMigrated(): Promise<void> {
  const database = await getDatabase();
  const countRow = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM trip_diagnostics",
  );

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyTripDiagnostics = await loadLegacyTripDiagnosticsFromAsyncStorage();

  if (legacyTripDiagnostics.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const tripDiagnostics of legacyTripDiagnostics) {
      const row = toTripDiagnosticsRow(tripDiagnostics);
      await database.runAsync(
        `INSERT OR REPLACE INTO trip_diagnostics (
          trip_local_id,
          accepted,
          accepted_after_long_gap,
          accuracy_histogram_json,
          background_accepted,
          background_callbacks,
          background_rejected,
          callback_count,
          decision_count,
          duplicate_coordinates,
          duplicate_timestamp,
          foreground_accepted,
          foreground_callbacks,
          foreground_rejected,
          max_callback_gap_ms,
          max_recorded_gap_ms,
          platform,
          recent_events_json,
          recording_mode,
          rejected_by_accuracy,
          rejected_by_implied_speed,
          rejected_by_jump_distance,
          rejected_by_min_movement,
          session_duplicate_recorded_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.trip_local_id,
        row.accepted,
        row.accepted_after_long_gap,
        row.accuracy_histogram_json,
        row.background_accepted,
        row.background_callbacks,
        row.background_rejected,
        row.callback_count,
        row.decision_count,
        row.duplicate_coordinates,
        row.duplicate_timestamp,
        row.foreground_accepted,
        row.foreground_callbacks,
        row.foreground_rejected,
        row.max_callback_gap_ms,
        row.max_recorded_gap_ms,
        row.platform,
        row.recent_events_json,
        row.recording_mode,
        row.rejected_by_accuracy,
        row.rejected_by_implied_speed,
        row.rejected_by_jump_distance,
        row.rejected_by_min_movement,
        row.session_duplicate_recorded_at,
        row.updated_at,
      );
    }
  });
}

export async function loadTripDiagnostics(): Promise<TripDiagnostics[]> {
  await ensureTripDiagnosticsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripDiagnosticsRow>(
    "SELECT * FROM trip_diagnostics ORDER BY updated_at ASC, trip_local_id ASC",
  );

  return rows.map(toTripDiagnosticsFromRow);
}

export async function saveTripDiagnostics(tripDiagnostics: TripDiagnostics[]): Promise<void> {
  await ensureTripDiagnosticsMigrated();

  const database = await getDatabase();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_diagnostics");

    for (const entry of tripDiagnostics) {
      const row = toTripDiagnosticsRow(entry);
      await database.runAsync(
        `INSERT INTO trip_diagnostics (
          trip_local_id,
          accepted,
          accepted_after_long_gap,
          accuracy_histogram_json,
          background_accepted,
          background_callbacks,
          background_rejected,
          callback_count,
          decision_count,
          duplicate_coordinates,
          duplicate_timestamp,
          foreground_accepted,
          foreground_callbacks,
          foreground_rejected,
          max_callback_gap_ms,
          max_recorded_gap_ms,
          platform,
          recent_events_json,
          recording_mode,
          rejected_by_accuracy,
          rejected_by_implied_speed,
          rejected_by_jump_distance,
          rejected_by_min_movement,
          session_duplicate_recorded_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.trip_local_id,
        row.accepted,
        row.accepted_after_long_gap,
        row.accuracy_histogram_json,
        row.background_accepted,
        row.background_callbacks,
        row.background_rejected,
        row.callback_count,
        row.decision_count,
        row.duplicate_coordinates,
        row.duplicate_timestamp,
        row.foreground_accepted,
        row.foreground_callbacks,
        row.foreground_rejected,
        row.max_callback_gap_ms,
        row.max_recorded_gap_ms,
        row.platform,
        row.recent_events_json,
        row.recording_mode,
        row.rejected_by_accuracy,
        row.rejected_by_implied_speed,
        row.rejected_by_jump_distance,
        row.rejected_by_min_movement,
        row.session_duplicate_recorded_at,
        row.updated_at,
      );
    }
  });
}
