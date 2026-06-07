// No mocks needed — inference service is pure math with no storage or Expo deps.

import { describe, expect, it } from "vitest";

import type { MotionActivity } from "../../domain/motion-activity";
import { inferAutoRecordingProfile } from "../../services/recording/auto-recording-inference.service";
import {
  ACTIVITY_INFERENCE_WINDOW_MS,
  MOTION_ACTIVITY_MAX_AGE_MS,
  type AutoLocationPoint,
} from "../../services/recording/auto-recording.utils";

const BASE_MS = 1_748_570_493_000;

function pt(offsetSeconds: number, speedMs: number): AutoLocationPoint {
  return {
    accuracy: 5,
    latitude: 45.015 + offsetSeconds * 0.000001,
    longitude: 19.811,
    recordedAt: new Date(BASE_MS + offsetSeconds * 1000).toISOString(),
    speed: speedMs,
  };
}

// 5 evenly spaced points, all within ACTIVITY_INFERENCE_WINDOW_MS of the last one.
function makePoints(speedMs: number, count = 5): AutoLocationPoint[] {
  const stepS = Math.floor(ACTIVITY_INFERENCE_WINDOW_MS / 1000 / (count + 1)); // ~20 s
  return Array.from({ length: count }, (_, i) => pt(i * stepS, speedMs));
}

function freshMotion(
  type: MotionActivity["type"],
  confidence: MotionActivity["confidence"],
  latestPoint: AutoLocationPoint,
): MotionActivity {
  return { confidence, recordedAt: latestPoint.recordedAt, sourcePlatform: "android", type };
}

describe("inferAutoRecordingProfile", () => {
  it("returns null for empty input", () => {
    expect(inferAutoRecordingProfile([], null)).toBeNull();
  });

  it("returns null when fewer than 3 speed-derivable points exist", () => {
    expect(inferAutoRecordingProfile([pt(0, 1.2), pt(20, 1.2)], null)).toBeNull();
  });

  it("returns null for stationary-only samples", () => {
    // 0.4 m/s = 1.44 km/h ≤ STATIONARY_MAX_KMH (2) → not moving → all windows empty
    expect(inferAutoRecordingProfile(makePoints(0.4), null)).toBeNull();
  });

  it("detects walk from walk-speed samples", () => {
    // 1.2 m/s = 4.32 km/h: moving, ≤ WALK_MAX_KMH (6)
    expect(inferAutoRecordingProfile(makePoints(1.2), null)).toBe("walk");
  });

  it("detects bike from bike-speed samples", () => {
    // 3.0 m/s = 10.8 km/h: BIKE_MIN_KMH (8.5) ≤ 10.8 ≤ BIKE_MAX_KMH (35)
    expect(inferAutoRecordingProfile(makePoints(3.0), null)).toBe("bike");
  });

  it("detects drive from drive-speed samples", () => {
    // 10.0 m/s = 36 km/h: ≥ DRIVE_MIN_KMH (28) and > BIKE_MAX_KMH (35)
    expect(inferAutoRecordingProfile(makePoints(10.0), null)).toBe("drive");
  });

  it("motion drive high confidence overrides walk-speed GPS", () => {
    const points = makePoints(1.2);
    const motion = freshMotion("drive", "high", points[points.length - 1]!);
    expect(inferAutoRecordingProfile(points, motion)).toBe("drive");
  });

  it("motion bike high confidence overrides walk-speed GPS", () => {
    const points = makePoints(1.2);
    const motion = freshMotion("bike", "high", points[points.length - 1]!);
    expect(inferAutoRecordingProfile(points, motion)).toBe("bike");
  });

  it("stale motion is ignored — falls back to GPS-only result", () => {
    const points = makePoints(1.2);
    const latestMs = new Date(points[points.length - 1]!.recordedAt).getTime();
    const stale: MotionActivity = {
      confidence: "high",
      recordedAt: new Date(latestMs - MOTION_ACTIVITY_MAX_AGE_MS - 1).toISOString(),
      sourcePlatform: "android",
      type: "bike",
    };
    expect(inferAutoRecordingProfile(points, stale)).toBe("walk");
  });

  it("drive-speed GPS overrides walk motion activity", () => {
    // GPS maxSpeed = 36 km/h > 12 → walk motion-guided path returns null → GPS drive wins
    const points = makePoints(10.0);
    const motion = freshMotion("walk", "high", points[points.length - 1]!);
    expect(inferAutoRecordingProfile(points, motion)).toBe("drive");
  });
});
