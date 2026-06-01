import type { LocationObject } from "expo-location";

export type SimulationActivity = "walk" | "bike" | "drive" | "pause";

export interface ScenarioSegment {
  activity: SimulationActivity;
  durationMs: number;
}

// Speed and accuracy values tuned to match auto-recording detection thresholds:
// WALK_MAX_KMH=6 (1.67 m/s), BIKE_MIN=8.5 (2.36), DRIVE_MIN=28 (7.78), STATIONARY_MAX=2 (0.56)
const ACTIVITY_CONFIG: Record<
  SimulationActivity,
  {
    speedMs: number;
    speedJitter: number;
    accuracy: number;
    intervalMs: number;
    headingJitter: number;
  }
> = {
  walk: { speedMs: 1.2, speedJitter: 0.2, accuracy: 5, intervalMs: 10_000, headingJitter: 20 },
  bike: { speedMs: 4.0, speedJitter: 0.8, accuracy: 5, intervalMs: 15_000, headingJitter: 12 },
  drive: { speedMs: 12.0, speedJitter: 2.0, accuracy: 6, intervalMs: 20_000, headingJitter: 6 },
  pause: { speedMs: 0, speedJitter: 0, accuracy: 8, intervalMs: 20_000, headingJitter: 0 },
};

const EARTH_RADIUS_M = 6_371_000;

function jitter(range: number): number {
  return (Math.random() * 2 - 1) * range;
}

function moveCoordinate(
  lat: number,
  lon: number,
  headingDeg: number,
  distanceM: number,
): { latitude: number; longitude: number } {
  const headingRad = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const d = distanceM / EARTH_RADIUS_M;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(headingRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(headingRad) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { latitude: (lat2 * 180) / Math.PI, longitude: (lon2 * 180) / Math.PI };
}

// BATCH_DETECTION_LAG_MS = 2 * 60 * 1000 in the pipeline.
// Transition scenarios are injected by the simulation runner in chunks smaller
// than the batch threshold, so they can use historical timestamps without being
// treated as a sleep-recovery batch.
// Sleep scenarios are injected as one large batch and intentionally trigger
// batch processing.
export type ScenarioTimestampStrategy = "transition" | "sleep";

export function generateScenarioLocations(
  segments: ScenarioSegment[],
  startLat = 43.8563,
  startLon = 18.4131,
  strategy: ScenarioTimestampStrategy = "sleep",
): LocationObject[] {
  const totalMs = segments.reduce((sum, s) => sum + s.durationMs, 0);
  const startTs = Date.now() - totalMs - 15_000;

  const locations: LocationObject[] = [];
  let lat = startLat;
  let lon = startLon;
  let heading = 45;
  let ts = startTs;

  for (const segment of segments) {
    const cfg = ACTIVITY_CONFIG[segment.activity];
    const segmentEndTs = ts + segment.durationMs;

    while (ts < segmentEndTs) {
      const speed =
        segment.activity === "pause" ? 0 : Math.max(0, cfg.speedMs + jitter(cfg.speedJitter));
      const accuracy = Math.max(1, cfg.accuracy + jitter(2));
      const distanceM = speed * (cfg.intervalMs / 1_000);

      heading = (heading + jitter(cfg.headingJitter) + 360) % 360;

      if (segment.activity !== "pause" && distanceM > 0) {
        const next = moveCoordinate(lat, lon, heading, distanceM);
        lat = next.latitude;
        lon = next.longitude;
      } else {
        lat += jitter(0.000005);
        lon += jitter(0.000005);
      }

      locations.push({
        coords: {
          latitude: lat,
          longitude: lon,
          altitude: 200 + jitter(5),
          accuracy,
          altitudeAccuracy: 5,
          heading,
          speed,
        },
        timestamp: ts,
      });

      ts = Math.min(ts + cfg.intervalMs, segmentEndTs);
    }
  }

  return locations;
}

export function totalScenarioDurationMs(segments: ScenarioSegment[]): number {
  return segments.reduce((sum, s) => sum + s.durationMs, 0);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (seconds === 0) {
    return `${minutes}min`;
  }

  return `${minutes}min ${seconds}s`;
}
