import * as Location from "expo-location";

import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type { RecordingProfile } from "../../domain/trips";

export interface CurrentLocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
}

interface TrackingOptions {
  accuracy: Location.Accuracy;
  distanceInterval: number;
  timeInterval: number;
}

function toSnapshot(location: Location.LocationObject): CurrentLocationSnapshot {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracy: location.coords.accuracy ?? null,
    recordedAt: new Date(location.timestamp).toISOString(),
  };
}

export async function requestForegroundLocationAccess(): Promise<boolean> {
  const permission = await Location.requestForegroundPermissionsAsync();
  return permission.granted;
}

export async function getCurrentForegroundLocation(): Promise<CurrentLocationSnapshot | null> {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return toSnapshot(location);
}

export function getTrackingOptionsForProfile(profile: RecordingProfile): TrackingOptions {
  switch (profile) {
    case "walk_relaxed":
      return {
        accuracy: Location.Accuracy.Low,
        distanceInterval: 50,
        timeInterval: 10 * 60 * 1000,
      };
    case "city_walk":
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 5 * 60 * 1000,
      };
    case "drive_city":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 35,
        timeInterval: 2 * 60 * 1000,
      };
    case "drive_highway":
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 150,
        timeInterval: 3 * 60 * 1000,
      };
    case "frequent":
      return {
        accuracy: Location.Accuracy.High,
        distanceInterval: 10,
        timeInterval: 60 * 1000,
      };
    case "auto":
    default:
      return {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 25,
        timeInterval: 3 * 60 * 1000,
      };
  }
}

export async function watchForegroundLocation(
  profile: RecordingProfile = DEFAULT_RECORDING_PROFILE,
  onLocation: (snapshot: CurrentLocationSnapshot) => void,
): Promise<() => void> {
  const trackingOptions = getTrackingOptionsForProfile(profile);
  const subscription = await Location.watchPositionAsync(
    trackingOptions,
    (location: Location.LocationObject) => {
      onLocation(toSnapshot(location));
    },
  );

  return () => subscription.remove();
}
