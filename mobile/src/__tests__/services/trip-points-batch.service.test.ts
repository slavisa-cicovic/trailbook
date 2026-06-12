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

// 1 degree of latitude ≈ 111,111 meters
const METERS_PER_DEGREE = 111_111;

function metersToDegreesLat(meters: number): number {
  return meters / METERS_PER_DEGREE;
}

function makePoint(overrides: {
  localId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  speed: number;
}): TripPoint {
  return {
    localId: overrides.localId,
    serverId: null,
    tripLocalId: "trip-1",
    segmentLocalId: "segment-1",
    deviceId: "device-1",
    userId: "user-1",
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    recordedAt: overrides.recordedAt,
    accuracy: 6,
    altitude: 100,
    speed: overrides.speed,
    syncStatus: "local-only",
  };
}

function toIso(offsetSeconds: number): string {
  return new Date(1_748_540_000_000 + offsetSeconds * 1000).toISOString();
}

function appendAll(
  points: TripPoint[],
  withSequential: boolean,
): { accepted: string[]; rejected: string[] } {
  let tripPoints: TripPoint[] = [];
  let lastSequentialTripPoint: TripPoint | null = null;
  const accepted: string[] = [];
  const rejected: string[] = [];

  for (const point of points) {
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

describe("batch implied-speed cascade prevention", () => {
  // Scenario (walk profile, max 12 km/h):
  //
  //   P0 (stale anchor, T=0)
  //   ──── 3-minute gap, phone bikes at ~14 km/h = 700m north ────
  //   P1-P5  bike speed (~14 km/h, 5s intervals)   ← should fail walk threshold
  //   P6-P8  walk speed (~4 km/h, 5s intervals)    ← should pass
  //
  // WITHOUT sequential: P6-P8 fail because cumulative distance from P0
  //   implies ~14 km/h even though each step is only 4 km/h.
  // WITH sequential: P6-P8 compare to immediate predecessor → 4 km/h → pass.

  const baseLat = 45.0;
  const baseLon = 19.8;

  const BIKE_SPEED_MS = 14 / 3.6;  // m/s
  const WALK_SPEED_MS = 4 / 3.6;   // m/s
  const STEP_S = 5;                 // seconds between points

  // P0: stale anchor from 3 minutes ago
  const p0 = makePoint({
    localId: "p0",
    latitude: baseLat,
    longitude: baseLon,
    recordedAt: toIso(0),
    speed: WALK_SPEED_MS,
  });

  // After 3-minute gap, phone biked 700m north.
  // P1–P5: consecutive bike-speed points (5s apart, ~19m per step)
  const bikeStepDeg = metersToDegreesLat(BIKE_SPEED_MS * STEP_S);

  const bikePoints = Array.from({ length: 5 }, (_, i) => {
    const t = 180 + i * STEP_S;
    return makePoint({
      localId: `p${i + 1}`,
      latitude: baseLat + metersToDegreesLat(700) + i * bikeStepDeg,
      longitude: baseLon,
      recordedAt: toIso(t),
      speed: BIKE_SPEED_MS,
    });
  });

  // P6–P8: walk-speed points following the bike section (5s apart, ~5.6m per step)
  const lastBike = bikePoints[bikePoints.length - 1]!;
  const WALK_STEP_S = 10; // longer interval → 11m per step, above iOS min-movement of 8m
  const walkStepDeg = metersToDegreesLat(WALK_SPEED_MS * WALK_STEP_S);

  const walkPoints = Array.from({ length: 3 }, (_, i) => {
    const t = 180 + 5 * STEP_S + (i + 1) * WALK_STEP_S;
    return makePoint({
      localId: `pw${i + 1}`,
      latitude: lastBike.latitude + (i + 1) * walkStepDeg,
      longitude: baseLon,
      recordedAt: toIso(t),
      speed: WALK_SPEED_MS,
    });
  });

  // Verify the scenario setup is correct
  it("confirms stale anchor causes cascade failure without sequential tracking", () => {
    const allPoints = [p0, ...bikePoints, ...walkPoints];
    const { accepted, rejected } = appendAll(allPoints, false);

    // P0 always accepted (first point)
    expect(accepted).toContain("p0");

    // Bike-speed points should fail walk threshold (correct behavior)
    expect(rejected).toContain("p1");
    expect(rejected).toContain("p2");
    expect(rejected).toContain("p3");

    // Walk-speed points after bike ALSO fail without sequential — CASCADE
    expect(rejected).toContain("pw1");
    expect(rejected).toContain("pw2");
    expect(rejected).toContain("pw3");
  });

  it("accepts walk-speed points after bike section with sequential tracking", () => {
    const allPoints = [p0, ...bikePoints, ...walkPoints];
    const { accepted, rejected } = appendAll(allPoints, true);

    // P0 accepted
    expect(accepted).toContain("p0");

    // Bike-speed points still fail walk threshold (correct)
    expect(rejected).toContain("p1");
    expect(rejected).toContain("p2");
    expect(rejected).toContain("p3");

    // Walk-speed points now PASS — cascade prevented
    expect(accepted).toContain("pw1");
    expect(accepted).toContain("pw2");
    expect(accepted).toContain("pw3");
  });

  it("sequential tracking accepts more points total", () => {
    const allPoints = [p0, ...bikePoints, ...walkPoints];
    const without = appendAll(allPoints, false);
    const with_ = appendAll(allPoints, true);

    expect(with_.accepted.length).toBeGreaterThan(without.accepted.length);
  });
});
