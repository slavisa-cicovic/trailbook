import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { TripPoint } from "../domain/trips";
import { getDatabase } from "./sqlite/db";

function normalizeTripPoint(
  value: Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">,
): TripPoint {
  return {
    localId: value.localId,
    serverId: value.serverId ?? null,
    tripLocalId: value.tripLocalId,
    segmentLocalId: value.segmentLocalId ?? null,
    deviceId: value.deviceId,
    userId: value.userId,
    latitude: value.latitude ?? 0,
    longitude: value.longitude ?? 0,
    recordedAt: value.recordedAt ?? new Date(0).toISOString(),
    accuracy: value.accuracy ?? null,
    altitude: value.altitude ?? null,
    speed: value.speed ?? null,
    syncStatus: value.syncStatus ?? "local-only",
  };
}

interface TripPointRow {
  accuracy: number | null;
  altitude: number | null;
  device_id: string;
  latitude: number;
  local_id: string;
  longitude: number;
  recorded_at: string;
  segment_local_id: string | null;
  server_id: string | null;
  speed: number | null;
  sync_status: TripPoint["syncStatus"];
  trip_local_id: string;
  user_id: string;
}

function toTripPointRow(tripPoint: TripPoint): TripPointRow {
  return {
    accuracy: tripPoint.accuracy,
    altitude: tripPoint.altitude,
    device_id: tripPoint.deviceId,
    latitude: tripPoint.latitude,
    local_id: tripPoint.localId,
    longitude: tripPoint.longitude,
    recorded_at: tripPoint.recordedAt,
    segment_local_id: tripPoint.segmentLocalId,
    server_id: tripPoint.serverId,
    speed: tripPoint.speed,
    sync_status: tripPoint.syncStatus,
    trip_local_id: tripPoint.tripLocalId,
    user_id: tripPoint.userId,
  };
}

function toTripPointFromRow(row: TripPointRow): TripPoint {
  return normalizeTripPoint({
    accuracy: row.accuracy,
    altitude: row.altitude,
    deviceId: row.device_id,
    latitude: row.latitude,
    localId: row.local_id,
    longitude: row.longitude,
    recordedAt: row.recorded_at,
    segmentLocalId: row.segment_local_id,
    serverId: row.server_id,
    speed: row.speed,
    syncStatus: row.sync_status,
    tripLocalId: row.trip_local_id,
    userId: row.user_id,
  });
}

async function loadLegacyTripPointsFromAsyncStorage(): Promise<TripPoint[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.tripPoints);

  if (!rawValue) {
    return [];
  }

  return (
    JSON.parse(rawValue) as Array<
      Partial<TripPoint> & Pick<TripPoint, "localId" | "tripLocalId" | "deviceId" | "userId">
    >
  ).map(normalizeTripPoint);
}

async function ensureTripPointsMigrated(): Promise<void> {
  const database = await getDatabase();
  const countRow = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM trip_points");

  if ((countRow?.count ?? 0) > 0) {
    return;
  }

  const legacyTripPoints = await loadLegacyTripPointsFromAsyncStorage();

  if (legacyTripPoints.length === 0) {
    return;
  }

  await database.withTransactionAsync(async () => {
    for (const tripPoint of legacyTripPoints) {
      const row = toTripPointRow(tripPoint);
      await database.runAsync(
        `INSERT OR REPLACE INTO trip_points (
          local_id,
          server_id,
          trip_local_id,
          segment_local_id,
          device_id,
          user_id,
          latitude,
          longitude,
          recorded_at,
          accuracy,
          altitude,
          speed,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.segment_local_id,
        row.device_id,
        row.user_id,
        row.latitude,
        row.longitude,
        row.recorded_at,
        row.accuracy,
        row.altitude,
        row.speed,
        row.sync_status,
      );
    }
  });
}

export async function loadTripPoints(): Promise<TripPoint[]> {
  await ensureTripPointsMigrated();

  const database = await getDatabase();
  const rows = await database.getAllAsync<TripPointRow>(
    "SELECT * FROM trip_points ORDER BY recorded_at ASC, local_id ASC",
  );

  return rows.map(toTripPointFromRow);
}

export async function saveTripPoints(tripPoints: TripPoint[]): Promise<void> {
  await ensureTripPointsMigrated();

  const database = await getDatabase();

  await database.withTransactionAsync(async () => {
    await database.runAsync("DELETE FROM trip_points");

    for (const tripPoint of tripPoints) {
      const row = toTripPointRow(tripPoint);
      await database.runAsync(
        `INSERT INTO trip_points (
          local_id,
          server_id,
          trip_local_id,
          segment_local_id,
          device_id,
          user_id,
          latitude,
          longitude,
          recorded_at,
          accuracy,
          altitude,
          speed,
          sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.local_id,
        row.server_id,
        row.trip_local_id,
        row.segment_local_id,
        row.device_id,
        row.user_id,
        row.latitude,
        row.longitude,
        row.recorded_at,
        row.accuracy,
        row.altitude,
        row.speed,
        row.sync_status,
      );
    }
  });
}
