import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Trip, TripStatus } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";

function inferTripStatus(value: Partial<Trip>): TripStatus {
  if (value.status === "active" || value.status === "paused" || value.status === "ended") {
    return value.status;
  }

  return value.endedAt ? "ended" : "active";
}

function normalizeTrip(value: Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">): Trip {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    title: value.title ?? value.localId,
    description: value.description ?? null,
    recordingProfile: normalizeRecordingProfile(value.recordingProfile ?? DEFAULT_RECORDING_PROFILE),
    status: inferTripStatus(value),
    startedAt: value.startedAt ?? new Date(0).toISOString(),
    endedAt: value.endedAt ?? null,
    createdAt: value.createdAt ?? value.startedAt ?? new Date(0).toISOString(),
    updatedAt: value.updatedAt ?? value.startedAt ?? new Date(0).toISOString(),
    deletedAt: value.deletedAt ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface TripRow {
  created_at: string;
  deleted_at: string | null;
  description: string | null;
  device_id: string;
  ended_at: string | null;
  local_id: string;
  recording_profile: Trip["recordingProfile"];
  server_id: string | null;
  started_at: string;
  status: Trip["status"];
  sync_status: Trip["syncStatus"];
  title: string;
  updated_at: string;
  user_id: string;
}

function toTripRow(trip: Trip): TripRow {
  return {
    created_at: trip.createdAt,
    deleted_at: trip.deletedAt,
    description: trip.description,
    device_id: trip.deviceId,
    ended_at: trip.endedAt,
    local_id: trip.localId,
    recording_profile: trip.recordingProfile,
    server_id: trip.serverId,
    started_at: trip.startedAt,
    status: trip.status,
    sync_status: trip.syncStatus,
    title: trip.title,
    updated_at: trip.updatedAt,
    user_id: trip.userId,
  };
}

function toTripFromRow(row: TripRow): Trip {
  return normalizeTrip({
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    description: row.description,
    deviceId: row.device_id,
    endedAt: row.ended_at,
    localId: row.local_id,
    recordingProfile: row.recording_profile,
    serverId: row.server_id,
    startedAt: row.started_at,
    status: row.status,
    syncStatus: row.sync_status,
    title: row.title,
    updatedAt: row.updated_at,
    userId: row.user_id,
  });
}

async function loadLegacyTripsFromAsyncStorage(): Promise<Trip[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.trips);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as Array<Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">>).map(
    normalizeTrip,
  );
}

async function ensureTripsMigrated(): Promise<void> {
  const database = await getDatabase();
  const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trips");

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyTrips = await loadLegacyTripsFromAsyncStorage();

  if (legacyTrips.length === 0) {
    return;
  }

  await runExclusiveDatabaseWrite(async (database) => {
    for (const trip of legacyTrips) {
      const row = toTripRow(trip);
      await database.runAsync(
        `INSERT OR REPLACE INTO trips (
          local_id,
          server_id,
          device_id,
          user_id,
          title,
          description,
          recording_profile,
          status,
          started_at,
          ended_at,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.device_id,
        row.user_id,
        row.title,
        row.description,
        row.recording_profile,
        row.status,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}

export async function loadTrips(): Promise<Trip[]> {
  await ensureTripsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripRow>("SELECT * FROM trips ORDER BY started_at ASC, local_id ASC");

  return rows.map(toTripFromRow);
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  await ensureTripsMigrated();

  const database = await getDatabase();

  await runExclusiveDatabaseWrite(async (database) => {
    await database.runAsync("DELETE FROM trips");

    for (const trip of trips) {
      const row = toTripRow(trip);
      await database.runAsync(
        `INSERT INTO trips (
          local_id,
          server_id,
          device_id,
          user_id,
          title,
          description,
          recording_profile,
          status,
          started_at,
          ended_at,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.device_id,
        row.user_id,
        row.title,
        row.description,
        row.recording_profile,
        row.status,
        row.started_at,
        row.ended_at,
        row.created_at,
        row.updated_at,
        row.deleted_at,
        row.sync_status,
      );
    }
  });
}
