import AsyncStorage from "@react-native-async-storage/async-storage";

import { STORAGE_KEYS } from "../constants/storage-keys";
import type { Trip } from "../domain/trips";

export async function loadTrips(): Promise<Trip[]> {
  const rawValue = await AsyncStorage.getItem(STORAGE_KEYS.trips);

  if (!rawValue) {
    return [];
  }

  return JSON.parse(rawValue) as Trip[];
}

export async function saveTrips(trips: Trip[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.trips, JSON.stringify(trips));
}
