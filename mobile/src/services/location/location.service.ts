import * as Location from "expo-location";

export interface CurrentLocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  recordedAt: string;
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

export async function watchForegroundLocation(
  onLocation: (snapshot: CurrentLocationSnapshot) => void,
): Promise<() => void> {
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      distanceInterval: 5,
      timeInterval: 5000,
    },
    (location: Location.LocationObject) => {
      onLocation(toSnapshot(location));
    },
  );

  return () => subscription.remove();
}
