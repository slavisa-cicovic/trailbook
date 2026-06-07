import AsyncStorage from "@react-native-async-storage/async-storage";
import { asc } from "drizzle-orm";

import { STORAGE_KEYS } from "../constants/storage-keys";
import { normalizeTrip } from "../domain/normalize-trip";
import type { Trip } from "../domain/trips";
import { getDrizzleDatabase, runExclusiveDrizzleWrite } from "./drizzle/db";
import { trips as tripsTable } from "./drizzle/schema";
import { migrateOnce } from "./sqlite/migrate-once";

type TripRow = typeof tripsTable.$inferSelect;
type TripInsert = typeof tripsTable.$inferInsert;

function toTripRow(trip: Trip): TripInsert {
  return {
    batteryEndLevelPercent: trip.batteryEndLevelPercent,
    batteryEndState: trip.batteryEndState,
    batteryStartLevelPercent: trip.batteryStartLevelPercent,
    batteryStartState: trip.batteryStartState,
    createdAt: trip.createdAt,
    deletedAt: trip.deletedAt,
    description: trip.description,
    deviceId: trip.deviceId,
    distanceMeters: trip.distanceMeters,
    endedAt: trip.endedAt,
    localId: trip.localId,
    pointCount: trip.pointCount,
    recordingConfigJson: trip.recordingConfig ? JSON.stringify(trip.recordingConfig) : null,
    recordingProfile: trip.recordingProfile,
    serverId: trip.serverId,
    startedAt: trip.startedAt,
    statsUpdatedAt: trip.statsUpdatedAt,
    status: trip.status,
    syncStatus: trip.syncStatus,
    title: trip.title,
    updatedAt: trip.updatedAt,
    userId: trip.userId,
  };
}

function toTripFromRow(row: TripRow): Trip {
  return normalizeTrip({
    batteryEndLevelPercent: row.batteryEndLevelPercent,
    batteryEndState: row.batteryEndState,
    batteryStartLevelPercent: row.batteryStartLevelPercent,
    batteryStartState: row.batteryStartState,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    description: row.description,
    deviceId: row.deviceId,
    distanceMeters: row.distanceMeters,
    endedAt: row.endedAt,
    localId: row.localId,
    pointCount: row.pointCount,
    recordingConfig: row.recordingConfigJson ? JSON.parse(row.recordingConfigJson) : null,
    recordingProfile: row.recordingProfile as Trip["recordingProfile"],
    serverId: row.serverId,
    startedAt: row.startedAt,
    statsUpdatedAt: row.statsUpdatedAt,
    status: row.status as Trip["status"],
    syncStatus: row.syncStatus as Trip["syncStatus"],
    title: row.title,
    updatedAt: row.updatedAt,
    userId: row.userId,
  });
}

async function loadLegacyTripsFromAsyncStorage(): Promise<Trip[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.trips);

  if (!rawValue) {
    return [];
  }

  return (JSON.parse(rawValue) as (Partial<Trip> & Pick<Trip, "localId" | "deviceId" | "userId">)[]).map(
    normalizeTrip,
  );
}

async function ensureTripsMigrated(): Promise<void> {
  await migrateOnce("async-storage/trips", async () => {
    const database = await getDrizzleDatabase();
    const existingRows = await database.select({ localId: tripsTable.localId }).from(tripsTable).limit(1);

    if (existingRows.length > 0) {
      return;
    }

    const legacyTrips = await loadLegacyTripsFromAsyncStorage();

    if (legacyTrips.length === 0) {
      return;
    }

    await runExclusiveDrizzleWrite(async (database) => {
      await database.insert(tripsTable).values(legacyTrips.map(toTripRow));
    });
  });
}

export async function loadTrips(): Promise<Trip[]> {
  await ensureTripsMigrated();

  const database = await getDrizzleDatabase();
  const rows = await database
    .select()
    .from(tripsTable)
    .orderBy(asc(tripsTable.startedAt), asc(tripsTable.localId));

  return rows.map(toTripFromRow);
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  await ensureTripsMigrated();

  await runExclusiveDrizzleWrite(async (database) => {
    await database.delete(tripsTable);

    if (trips.length > 0) {
      await database.insert(tripsTable).values(trips.map(toTripRow));
    }
  });
}
