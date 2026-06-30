import type { DisplayRoutePoint } from '../model/displayRoutePoint';
import type { RawLocationSample } from '../model/rawSamples';
import type { GeoPoint } from './types';
import { cleanLocations } from './locationCleaner';

export const MAX_DISPLAY_ROUTE_POINTS = 2_500;

function thinLocationsForDisplay(locations: GeoPoint[]) {
  if (locations.length <= MAX_DISPLAY_ROUTE_POINTS) return locations;

  const step = Math.ceil(locations.length / MAX_DISPLAY_ROUTE_POINTS);
  return locations.filter(
    (_location, index) => index === 0 || index === locations.length - 1 || index % step === 0,
  );
}

export function buildDisplayRoutePoints(
  tripId: string,
  samples: RawLocationSample[],
): DisplayRoutePoint[] {
  return thinLocationsForDisplay(cleanLocations(samples)).map((location, index) => ({
    tripId,
    index,
    timestamp: location.timestamp,
    latitude: location.latitude,
    longitude: location.longitude,
    speedMps: location.speedMps,
  }));
}
