import type { RawLocationSample } from '../model/rawSamples';
import type { GeoPoint } from './types';
import { V1 } from './types';

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function cleanLocations(samples: RawLocationSample[]): GeoPoint[] {
  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Stage 1: accuracy filter
  const accurate = sorted.filter((s) => (s.accuracyM ?? 0) <= V1.maxAccuracyM);

  // Stage 2: speed spike filter
  const cleaned: GeoPoint[] = [];
  for (let i = 0; i < accurate.length; i++) {
    const s = accurate[i];
    if (cleaned.length === 0) {
      cleaned.push({ timestamp: s.timestamp, latitude: s.latitude, longitude: s.longitude, speedMps: s.speedMps, altitudeM: s.altitudeM });
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    const dtMs = s.timestamp.getTime() - prev.timestamp.getTime();
    if (dtMs <= 0) continue; // duplicate timestamp

    const d = distanceM(prev.latitude, prev.longitude, s.latitude, s.longitude);
    const impliedSpeed = d / (dtMs / 1000);

    // Only drop spike if the time window is short (GPS jump, not legitimate fast travel)
    if (impliedSpeed > V1.speedSpikeThresholdMs && dtMs < V1.speedSpikeWindowMs) {
      continue; // drop outlier
    }

    cleaned.push({ timestamp: s.timestamp, latitude: s.latitude, longitude: s.longitude, speedMps: s.speedMps, altitudeM: s.altitudeM });
  }

  return cleaned;
}
