import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type {
  TripDiagnosticsAccuracyHistogram,
  TripDiagnostics,
  TripDiagnosticsPlatform,
  TripDiagnosticsRecentEvent,
} from "../domain/trip-diagnostics";
import type { RecordingMode } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { tripDiagnostics as tripDiagnosticsTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";

type TripDiagnosticsRow = typeof tripDiagnosticsTable.$inferSelect;
type TripDiagnosticsInsert = typeof tripDiagnosticsTable.$inferInsert;

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
    case "stationary":
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
    maxSilentGapMs: value.maxSilentGapMs ?? 0,
    platform: normalizePlatform(value.platform),
    recentEvents: Array.isArray(value.recentEvents) ? value.recentEvents.map(normalizeRecentEvent) : [],
    recordingMode: normalizeRecordingMode(value.recordingMode),
    rejectedByAccuracy: value.rejectedByAccuracy ?? 0,
    rejectedByImpliedSpeed: value.rejectedByImpliedSpeed ?? 0,
    rejectedByJumpDistance: value.rejectedByJumpDistance ?? 0,
    rejectedByMinMovement: value.rejectedByMinMovement ?? 0,
    sessionDuplicateRecordedAt: value.sessionDuplicateRecordedAt ?? 0,
    silentGapCount: value.silentGapCount ?? 0,
    tripLocalId: value.tripLocalId,
    updatedAt: value.updatedAt ?? new Date(0).toISOString(),
  };
}

function toTripDiagnosticsRow(tripDiagnostics: TripDiagnostics): TripDiagnosticsInsert {
  return {
    accepted: tripDiagnostics.accepted,
    acceptedAfterLongGap: tripDiagnostics.acceptedAfterLongGap,
    accuracyHistogramJson: JSON.stringify(tripDiagnostics.accuracyHistogram),
    backgroundAccepted: tripDiagnostics.backgroundAccepted,
    backgroundCallbacks: tripDiagnostics.backgroundCallbacks,
    backgroundRejected: tripDiagnostics.backgroundRejected,
    callbackCount: tripDiagnostics.callbackCount,
    decisionCount: tripDiagnostics.decisionCount,
    duplicateCoordinates: tripDiagnostics.duplicateCoordinates,
    duplicateTimestamp: tripDiagnostics.duplicateTimestamp,
    foregroundAccepted: tripDiagnostics.foregroundAccepted,
    foregroundCallbacks: tripDiagnostics.foregroundCallbacks,
    foregroundRejected: tripDiagnostics.foregroundRejected,
    maxCallbackGapMs: tripDiagnostics.maxCallbackGapMs,
    maxRecordedGapMs: tripDiagnostics.maxRecordedGapMs,
    maxSilentGapMs: tripDiagnostics.maxSilentGapMs,
    platform: tripDiagnostics.platform,
    recentEventsJson: JSON.stringify(tripDiagnostics.recentEvents),
    recordingMode: tripDiagnostics.recordingMode,
    rejectedByAccuracy: tripDiagnostics.rejectedByAccuracy,
    rejectedByImpliedSpeed: tripDiagnostics.rejectedByImpliedSpeed,
    rejectedByJumpDistance: tripDiagnostics.rejectedByJumpDistance,
    rejectedByMinMovement: tripDiagnostics.rejectedByMinMovement,
    sessionDuplicateRecordedAt: tripDiagnostics.sessionDuplicateRecordedAt,
    silentGapCount: tripDiagnostics.silentGapCount,
    tripLocalId: tripDiagnostics.tripLocalId,
    updatedAt: tripDiagnostics.updatedAt,
  };
}

function toTripDiagnosticsFromRow(row: TripDiagnosticsRow): TripDiagnostics {
  return normalizeTripDiagnostics({
    accepted: row.accepted,
    acceptedAfterLongGap: row.acceptedAfterLongGap,
    accuracyHistogram: JSON.parse(row.accuracyHistogramJson) as TripDiagnosticsAccuracyHistogram,
    backgroundAccepted: row.backgroundAccepted,
    backgroundCallbacks: row.backgroundCallbacks,
    backgroundRejected: row.backgroundRejected,
    callbackCount: row.callbackCount,
    decisionCount: row.decisionCount,
    duplicateCoordinates: row.duplicateCoordinates,
    duplicateTimestamp: row.duplicateTimestamp,
    foregroundAccepted: row.foregroundAccepted,
    foregroundCallbacks: row.foregroundCallbacks,
    foregroundRejected: row.foregroundRejected,
    maxCallbackGapMs: row.maxCallbackGapMs,
    maxRecordedGapMs: row.maxRecordedGapMs,
    maxSilentGapMs: row.maxSilentGapMs,
    platform: row.platform as TripDiagnosticsPlatform,
    recentEvents: JSON.parse(row.recentEventsJson) as TripDiagnosticsRecentEvent[],
    recordingMode: row.recordingMode as RecordingMode,
    rejectedByAccuracy: row.rejectedByAccuracy,
    rejectedByImpliedSpeed: row.rejectedByImpliedSpeed,
    rejectedByJumpDistance: row.rejectedByJumpDistance,
    rejectedByMinMovement: row.rejectedByMinMovement,
    sessionDuplicateRecordedAt: row.sessionDuplicateRecordedAt,
    silentGapCount: row.silentGapCount,
    tripLocalId: row.tripLocalId,
    updatedAt: row.updatedAt,
  });
}

async function loadLegacyTripDiagnosticsFromAsyncStorage(): Promise<TripDiagnostics[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripDiagnostics);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as (Partial<TripDiagnostics> & Pick<TripDiagnostics, "tripLocalId">)[]).map(
    normalizeTripDiagnostics,
  );
}

async function ensureTripDiagnosticsMigrated(): Promise<void> {
  await migrateOnce("async-storage/trip-diagnostics", async () => {
    const database = await getDrizzleDatabase();
    const existingRows = await database
      .select({ tripLocalId: tripDiagnosticsTable.tripLocalId })
      .from(tripDiagnosticsTable)
      .limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyTripDiagnostics = await loadLegacyTripDiagnosticsFromAsyncStorage();

    if (legacyTripDiagnostics.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(tripDiagnosticsTable).values(legacyTripDiagnostics.map(toTripDiagnosticsRow));
    });
  });
}

export async function loadTripDiagnostics(): Promise<TripDiagnostics[]> {
  await ensureTripDiagnosticsMigrated();

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripDiagnosticsTable)
    .orderBy(asc(tripDiagnosticsTable.updatedAt), asc(tripDiagnosticsTable.tripLocalId));

  return rows.map(toTripDiagnosticsFromRow);
}

export async function saveTripDiagnostics(tripDiagnostics: TripDiagnostics[]): Promise<void> {
  await ensureTripDiagnosticsMigrated();

  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripDiagnosticsTable);

    if (tripDiagnostics.length > 0) {
      await database.insert(tripDiagnosticsTable).values(tripDiagnostics.map(toTripDiagnosticsRow));
    }
  });
}
