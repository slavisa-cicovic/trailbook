import * as SecureStore from 'expo-secure-store';

const KEY = 'vellora.active_trip_id';

export async function setActiveRecordingTripId(tripId: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, tripId);
}

export async function clearActiveRecordingTripId(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export async function getActiveRecordingTripId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}
