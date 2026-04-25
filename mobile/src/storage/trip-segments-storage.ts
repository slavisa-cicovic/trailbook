import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripSegment } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

function normalizeTripSegment(
  value: Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripSegment {
  const fallbackDate = new Date(0).toISOString();

  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    deviceId: value.deviceId,
    userId: value.userId,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    startedAt: value.startedAt ?? fallbackDate,
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? fallbackDate,
    updatedAt: value.updatedAt ?? value.startedAt ?? fallbackDate,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface TripSegmentRow {
  created_at: string;
  device_id: string;
  ended_at: string | null;
  local_id: string;
  recording_profile: TripSegment["recordingProfile"];
  server_id: string | null;
  started_at: string;
  sync_status: TripSegment["syncStatus"];
  trip_local_id: string;
  updated_at: string;
  user_id: string;
}

function toTripSegmentRow(tripSegment: TripSegment): TripSegmentRow {
  return {
    created_at: tripSegment.createdAt,
    device_id: tripSegment.deviceId,
    ended_at: tripSegment.endedAt,
    local_id: tripSegment.localId,
    recording_profile: tripSegment.recordingProfile,
    server_id: tripSegment.serverId,
    started_at: tripSegment.startedAt,
    sync_status: tripSegment.syncStatus,
    trip_local_id: tripSegment.tripLocalId,
    updated_at: tripSegment.updatedAt,
    user_id: tripSegment.userId,
  };
}

function toTripSegmentFromRow(row: TripSegmentRow): TripSegment {
  return normalizeTripSegment({
    createdAt: row.created_at,
    deviceId: row.device_id,
    endedAt: row.ended_at,
    localId: row.local_id,
    recordingProfile: row.recording_profile,
    serverId: row.server_id,
    startedAt: row.started_at,
    syncStatus: row.sync_status,
    tripLocalId: row.trip_local_id,
    updatedAt: row.updated_at,
    userId: row.user_id,
  });
}

async function loadLegacyTripSegmentsFromAsyncStorage(): Promise<TripSegment[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripSegments);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<TripSegment> & Pick<TripSegment, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeTripSegment);
}

async function ensureTripSegmentsMigrated(): Promise<void> {
  const database = await getDatabase();
  const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trip_segments");

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyTripSegments = await loadLegacyTripSegmentsFromAsyncStorage();

  if (legacyTripSegments.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const tripSegment of legacyTripSegments) {
      const row = toTripSegmentRow(tripSegment);
      await database.runAsync(
        `INSERT OR REPLACE INTO trip_segments (
          local_id,
          server_id,
          trip_local_id,
          device_id,
          user_id,
          recording_profile,
          started_at,
          ended_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.device_id,
        row.user_id,
        row.recording_profile,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.sync_status,
      );
    }
  });
}

export async function loadTripSegments(): Promise<TripSegment[]> {
  await ensureTripSegmentsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripSegmentRow>(
    "SELECT * FROM trip_segments ORDER BY started_at ASC, local_id ASC",
  );

  return rows.map(toTripSegmentFromRow);
}

export async function saveTripSegments(tripSegments: TripSegment[]): Promise<void> {
  await ensureTripSegmentsMigrated();

  const database = await getDatabase();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trip_segments");

    for (const tripSegment of tripSegments) {
      const row = toTripSegmentRow(tripSegment);
      await database.runAsync(
        `INSERT INTO trip_segments (
          local_id,
          server_id,
          trip_local_id,
          device_id,
          user_id,
          recording_profile,
          started_at,
          ended_at,
          created_at,
          updated_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.device_id,
        row.user_id,
        row.recording_profile,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.sync_status,
      );
    }
  });
}
