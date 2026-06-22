import { describe, expect, it } from "vitest";

import type { RawActivitySample, RawLocationSample, TripBundleCore } from "../../core/trips";
import { processTripBundle, segmentTrip } from "../../core/trips";

function at(second: number): string {
  return new Date(Date.UTC(2026, 0, 1, 10, 0, second)).toISOString();
}

function location(second: number, speedMps: number | null, latitudeOffset = second * 0.00001): RawLocationSample {
  return {
    accuracyM: 8,
    altitudeM: null,
    bearingDeg: null,
    latitude: 45 + latitudeOffset,
    longitude: 19,
    provider: "simulation",
    speedMps,
    timestamp: at(second),
    tripId: "trip-1",
  };
}

function activity(second: number, activityType: number, confidence = 90): RawActivitySample {
  return {
    results: [{ activityType, confidence }],
    timestamp: at(second),
    tripId: "trip-1",
  };
}

describe("Vellora-style trip segmenter", () => {
  it("segments speed-only raw locations into walk and drive", () => {
    const segments = segmentTrip(
      {
        activities: [],
        locations: [
          location(0, 1.2),
          location(30, 1.3),
          location(90, 1.2),
          location(180, 13),
          location(240, 14),
          location(300, 13),
        ],
        tripId: "trip-1",
      },
      {
        driveMinSpeedMps: 4,
        maxAccuracyForDistanceM: 50,
        maxActivityGapS: 90,
        minSegmentDurationS: 30,
        planeSpeedThresholdMps: 83.3,
        smoothingWindowHalf: 0,
        stationaryMaxSpeedMps: 0.5,
      },
    );

    expect(segments.map((segment) => segment.segmentType)).toEqual(["walk", "drive"]);
    expect(segments[0]).toMatchObject({ index: 0, startedAt: at(0), endedAt: at(90) });
    expect(segments[1]).toMatchObject({ index: 1, startedAt: at(180), endedAt: at(300) });
    expect(segments[1].distanceM).toBeGreaterThan(0);
  });

  it("uses activity recognition over ambiguous speed", () => {
    const segments = segmentTrip(
      {
        activities: [
          activity(0, 1),
          activity(60, 1),
          activity(120, 0),
          activity(180, 0),
        ],
        locations: [
          location(0, 5),
          location(60, 5),
          location(120, 5),
          location(180, 5),
        ],
        tripId: "trip-1",
      },
      {
        driveMinSpeedMps: 4,
        maxAccuracyForDistanceM: 50,
        maxActivityGapS: 90,
        minSegmentDurationS: 30,
        planeSpeedThresholdMps: 83.3,
        smoothingWindowHalf: 0,
        stationaryMaxSpeedMps: 0.5,
      },
    );

    expect(segments.map((segment) => segment.segmentType)).toEqual(["bike", "drive"]);
  });

  it("reprocesses from the trip bundle raw samples", () => {
    const bundle: TripBundleCore = {
      activities: [],
      captureMeta: {
        appVersion: "1.0.0",
        captureSchemaVersion: 1,
        captureTimeZone: "Europe/Belgrade",
        deviceModel: "test",
        osApiLevel: "test",
        tripId: "trip-1",
      },
      deviceStates: [],
      locations: [location(0, 0.1), location(60, 0.1), location(120, 8), location(180, 8)],
      segments: [],
      sessionEvents: [],
      trip: {
        clientTripId: "trip-1",
        description: null,
        endedAt: at(180),
        processingVersion: 0,
        startedAt: at(0),
        status: "completed",
        syncState: "pending",
        title: "Test",
      },
      waypoints: [],
    };

    const segments = processTripBundle(bundle, {
      driveMinSpeedMps: 4,
      maxAccuracyForDistanceM: 50,
      maxActivityGapS: 90,
      minSegmentDurationS: 30,
      planeSpeedThresholdMps: 83.3,
      smoothingWindowHalf: 0,
      stationaryMaxSpeedMps: 0.5,
    });

    expect(segments.map((segment) => segment.segmentType)).toEqual(["drive"]);
    expect(segments[0].tripId).toBe("trip-1");
  });
});
