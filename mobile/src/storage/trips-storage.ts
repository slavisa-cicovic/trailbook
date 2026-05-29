import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_RECORDING_PROFILE, normalizeRecordingProfile } from "../constants/recording-profiles";
import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Trip, TripStatus } from "../domain/trips";
import { getDatabase, runExclusiveDatabaseWrite } from "./sqlite/db";
import { migrateOnce } from "./sqlite/migrate-once";

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
    recordingConfig: value.recordingConfig ?? null,
    batteryStartLevelPercent: value.batteryStartLevelPercent ?? null,
    batteryStartState: value.batteryStartState ?? null,
    batteryEndLevelPercent: value.batteryEndLevelPercent ?? null,
    batteryEndState: value.batteryEndState ?? null,
    pointCount: value.pointCount ?? null,
    distanceMeters: value.distanceMeters ?? null,
    statsUpdatedAt: value.statsUpdatedAt ?? null,
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
  recording_config_json: string | null;
  battery_start_level_percent: number | null;
  battery_start_state: string | null;
  battery_end_level_percent: number | null;
  battery_end_state: string | null;
  point_count: number | null;
  distance_meters: number | null;
  stats_updated_at: string | null;
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
    recording_config_json: trip.recordingConfig ? JSON.stringify(trip.recordingConfig) : null,
    battery_start_level_percent: trip.batteryStartLevelPercent,
    battery_start_state: trip.batteryStartState,
    battery_end_level_percent: trip.batteryEndLevelPercent,
    battery_end_state: trip.batteryEndState,
    point_count: trip.pointCount,
    distance_meters: trip.distanceMeters,
    stats_updated_at: trip.statsUpdatedAt,
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
    recordingConfig: row.recording_config_json ? JSON.parse(row.recording_config_json) : null,
    batteryStartLevelPercent: row.battery_start_level_percent,
    batteryStartState: row.battery_start_state,
    batteryEndLevelPercent: row.battery_end_level_percent,
    batteryEndState: row.battery_end_state,
    pointCount: row.point_count,
    distanceMeters: row.distance_meters,
    statsUpdatedAt: row.stats_updated_at,
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
  await migrateOnce("async-storage/trips", async () => {
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
            recording_config_json,
            battery_start_level_percent,
            battery_start_state,
            battery_end_level_percent,
            battery_end_state,
            point_count,
            distance_meters,
            stats_updated_at,
            status,
            started_at,
            ended_at,
            created_at,
            updated_at,
            deleted_at,
            sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row.local_id,
          row.server_id,
          row.device_id,
          row.user_id,
          row.title,
          row.description,
          row.recording_profile,
          row.recording_config_json,
          row.battery_start_level_percent,
          row.battery_start_state,
          row.battery_end_level_percent,
          row.battery_end_state,
          row.point_count,
          row.distance_meters,
          row.stats_updated_at,
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
          recording_config_json,
          battery_start_level_percent,
          battery_start_state,
          battery_end_level_percent,
          battery_end_state,
          point_count,
          distance_meters,
          stats_updated_at,
          status,
          started_at,
          ended_at,
          created_at,
          updated_at,
          deleted_at,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.device_id,
        row.user_id,
        row.title,
        row.description,
        row.recording_profile,
        row.recording_config_json,
        row.battery_start_level_percent,
        row.battery_start_state,
        row.battery_end_level_percent,
        row.battery_end_state,
        row.point_count,
        row.distance_meters,
        row.stats_updated_at,
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
