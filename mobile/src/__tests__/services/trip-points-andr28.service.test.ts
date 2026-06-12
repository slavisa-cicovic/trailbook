// Regression test based on real trip "Andr 28 1" (2026-05-28).
//
// Android received 20 location callbacks in 45 minutes.
// A 16-minute gap (09:14:44 → 09:31:20) was followed by a batch of 8 points
// covering 09:15:21–09:16:43. Within that batch the implied-speed filter
// created a cascade:
//
//   09:16:28  accepted  (9.6 km/h)
//   09:16:33  FAIL      (13.3 km/h > 12 km/h walk threshold) ← correct
//   09:16:38  FAIL      (11.8 km/h but implies 14.0 km/h vs stale anchor) ← cascade
//
// With sequential tracking the anchor for 09:16:38 becomes 09:16:33 (5s, 15.4m):
// implied speed = 11.1 km/h < 12 km/h → accepted.

import { describe, expect, it, vi } from "vitest";

import type { TripPoint } from "../../domain/trips";
import { appendTripPointIfUseful } from "../../services/trip-points/trip-points.service";

vi.mock("../../services/recording/recording-config.service", () => ({
  getRuntimePointFilterProfileConfig: vi.fn().mockReturnValue(null),
}));

vi.mock("../../services/trip-points/trip-point-diagnostics.service", () => ({
  isTripDiagnosticsEnabled: vi.fn().mockReturnValue(false),
  recordLocationCallback: vi.fn(),
  recordTripPointDiagnostic: vi.fn(),
  resetTripPointDiagnostics: vi.fn(),
}));

function makePoint(
  id: string,
  lat: number,
  lon: number,
  recordedAt: string,
  speedMs: number,
  accuracy: number,
): TripPoint {
  return {
    localId: id,
    serverId: null,
    tripLocalId: "andr28",
    segmentLocalId: "seg-1",
    deviceId: "device-1",
    userId: "user-1",
    latitude: lat,
    longitude: lon,
    recordedAt,
    accuracy,
    altitude: 90,
    speed: speedMs,
    syncStatus: "local-only",
  };
}

// Actual accepted trip points from the real-time phase (before the 16-min gap).
// These form the "stale anchor" situation that the batch encounters.
const realtimePoints: TripPoint[] = [
  makePoint("rt1", 45.0145713, 19.8117069, "2026-05-28T09:13:17.326Z", 1.0 / 3.6,  24.8),
  makePoint("rt2", 45.0146343, 19.8116564, "2026-05-28T09:13:27.730Z", 4.3 / 3.6,  33.1),
  makePoint("rt3", 45.0147133, 19.8116761, "2026-05-28T09:13:33.089Z", 23.1 / 3.6, 29.7),
  makePoint("rt4", 45.014718,  19.8115205, "2026-05-28T09:13:38.104Z", 25.0 / 3.6, 35.7),
  makePoint("rt5", 45.0145868, 19.8114539, "2026-05-28T09:13:43.103Z", 2.6 / 3.6,  49.7),
  makePoint("rt6", 45.0145398, 19.8115068, "2026-05-28T09:14:13.538Z", 2.6 / 3.6,   7.3),
  makePoint("rt7", 45.0145213, 19.8115647, "2026-05-28T09:14:21.737Z", 0.6 / 3.6,   5.8),
  makePoint("rt8", 45.0145296, 19.8116273, "2026-05-28T09:14:44.135Z", 1.0 / 3.6,   6.3),
];

// Batch points (all received at 09:31:20, recorded at 09:15:21–09:16:43).
// rt8 (09:14:44) is the stale last-accepted anchor when this batch arrives.
const batchPoints: TripPoint[] = [
  makePoint("b1", 45.0145263, 19.8116789, "2026-05-28T09:15:21.121Z", 0.5 / 3.6,  6.1),
  makePoint("b2", 45.0145312, 19.8116727, "2026-05-28T09:15:26.457Z", 0.2 / 3.6,  5.7),
  makePoint("b3", 45.0145105, 19.8116851, "2026-05-28T09:15:55.982Z", 0.3 / 3.6,  5.7),
  makePoint("b4", 45.0145086, 19.8117500, "2026-05-28T09:16:08.168Z", 0.3 / 3.6,  3.9),
  makePoint("b5", 45.0145395, 19.8118226, "2026-05-28T09:16:23.179Z", 4.3 / 3.6,  3.9),
  makePoint("b6", 45.0146561, 19.8119092, "2026-05-28T09:16:28.181Z", 9.6 / 3.6,  3.1),
  makePoint("b7", 45.0148672, 19.8119134, "2026-05-28T09:16:33.167Z", 13.3 / 3.6, 4.0), // above walk threshold
  makePoint("b8", 45.0150056, 19.8119304, "2026-05-28T09:16:38.181Z", 11.8 / 3.6, 8.6), // cascade victim
  makePoint("b9", 45.0150072, 19.8123924, "2026-05-28T09:16:43.200Z", 17.7 / 3.6, 4.0),
];

function runBatch(withSequential: boolean): { accepted: string[]; rejected: string[] } {
  let tripPoints: TripPoint[] = [];
  let lastSequentialTripPoint: TripPoint | null = null;

  const accepted: string[] = [];
  const rejected: string[] = [];

  const allPoints = [...realtimePoints, ...batchPoints];

  for (const point of allPoints) {
    const before = tripPoints.length;

    tripPoints = appendTripPointIfUseful(
      tripPoints,
      point,
      "walk",
      "background",
      {
        lastSequentialTripPoint: withSequential ? lastSequentialTripPoint : null,
      },
    );

    lastSequentialTripPoint = point;

    if (tripPoints.length > before) {
      accepted.push(point.localId);
    } else {
      rejected.push(point.localId);
    }
  }

  return { accepted, rejected };
}

describe("Andr 28 1 batch regression", () => {
  it("b7 (13.3 km/h) correctly fails walk threshold in both modes", () => {
    const without = runBatch(false);
    const with_ = runBatch(true);

    expect(without.rejected).toContain("b7");
    expect(with_.rejected).toContain("b7");
  });

  it("b8 (11.8 km/h) fails as cascade victim without sequential tracking", () => {
    const { rejected } = runBatch(false);
    expect(rejected).toContain("b8");
  });

  it("b8 (11.8 km/h) is accepted with sequential tracking", () => {
    const { accepted } = runBatch(true);
    expect(accepted).toContain("b8");
  });

  it("sequential tracking accepts more points total from the batch", () => {
    const without = runBatch(false);
    const with_ = runBatch(true);

    expect(with_.accepted.length).toBeGreaterThan(without.accepted.length);
  });
});
