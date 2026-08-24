import type { RawLocationSample } from '../model/rawSamples';
import type { SegmentType } from '../model/segment';
import type { GeoPoint } from './types';
import { V1 } from './types';

export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function shouldConnectGeoPoints(
  previous: GeoPoint,
  current: GeoPoint,
  segmentType?: SegmentType,
): boolean {
  const dtMs = current.timestamp.getTime() - previous.timestamp.getTime();
  if (dtMs <= 0) return false;
  if (dtMs > V1.routeGapSplitThresholdMs) return false;

  if (!segmentType) return true;

  const distance = distanceM(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  );
  const impliedSpeedMps = distance / (dtMs / 1000);
  return impliedSpeedMps <= V1.routeConnectionMaxMps[segmentType];
}

export function splitLocationsOnRouteGaps(
  locations: GeoPoint[],
  segmentType?: SegmentType,
): GeoPoint[][] {
  if (locations.length === 0) return [];

  const chunks: GeoPoint[][] = [[locations[0]]];
  for (let index = 1; index < locations.length; index += 1) {
    const previous = locations[index - 1];
    const current = locations[index];
    if (shouldConnectGeoPoints(previous, current, segmentType)) {
      chunks[chunks.length - 1].push(current);
    } else {
      chunks.push([current]);
    }
  }

  return chunks;
}

export function cleanLocations(samples: RawLocationSample[]): GeoPoint[] {
  const sorted = [...samples].sort((a, b) => {
    const timestampDifference = a.timestamp.getTime() - b.timestamp.getTime();
    if (timestampDifference !== 0) return timestampDifference;

    // Callback order is not stable when Android drains delayed batches. Pick a
    // deterministic winner for equal timestamps so replay order cannot change
    // the displayed or processed route.
    const accuracyDifference = (a.accuracyM ?? Number.POSITIVE_INFINITY) -
      (b.accuracyM ?? Number.POSITIVE_INFINITY);
    if (accuracyDifference !== 0) return accuracyDifference;
    if (a.latitude !== b.latitude) return a.latitude - b.latitude;
    if (a.longitude !== b.longitude) return a.longitude - b.longitude;
    return a.provider.localeCompare(b.provider);
  });

  // Stage 1: accuracy filter
  const accurate = sorted.filter((s) => (s.accuracyM ?? 0) <= V1.maxAccuracyM);

  // Stage 2: speed spike filter
  const cleaned: GeoPoint[] = [];
  for (let i = 0; i < accurate.length; i++) {
    const s = accurate[i];
    if (cleaned.length === 0) {
      cleaned.push({
        timestamp: s.timestamp,
        latitude: s.latitude,
        longitude: s.longitude,
        speedMps: s.speedMps,
        altitudeM: s.altitudeM,
      });
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    const dtMs = s.timestamp.getTime() - prev.timestamp.getTime();
    if (dtMs <= 0) continue; // duplicate timestamp

    const d = distanceM(prev.latitude, prev.longitude, s.latitude, s.longitude);
    const impliedSpeed = d / (dtMs / 1000);

    if (impliedSpeed > V1.speedSpikeThresholdMps) {
      continue; // GPS teleport - drop regardless of time gap
    }

    cleaned.push({
      timestamp: s.timestamp,
      latitude: s.latitude,
      longitude: s.longitude,
      speedMps: s.speedMps,
      altitudeM: s.altitudeM,
    });
  }

  return cleaned;
}
