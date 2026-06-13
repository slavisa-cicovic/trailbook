import { beforeEach, describe, expect, it, vi } from "vitest";

const locationMocks = vi.hoisted(() => ({
  hasStartedLocationUpdatesAsync: vi.fn(),
  startLocationUpdatesAsync: vi.fn(),
  stopLocationUpdatesAsync: vi.fn(),
}));

vi.mock("expo-location", () => ({
  Accuracy: {
    Balanced: "balanced",
    High: "high",
    Low: "low",
    Lowest: "lowest",
    Highest: "highest",
    BestForNavigation: "bestForNavigation",
  },
  LocationActivityType: {
    Airborne: "airborne",
    AutomotiveNavigation: "automotiveNavigation",
    Fitness: "fitness",
    OtherNavigation: "otherNavigation",
  },
  getCurrentPositionAsync: vi.fn(),
  getLastKnownPositionAsync: vi.fn(),
  hasStartedLocationUpdatesAsync: locationMocks.hasStartedLocationUpdatesAsync,
  startLocationUpdatesAsync: locationMocks.startLocationUpdatesAsync,
  stopLocationUpdatesAsync: locationMocks.stopLocationUpdatesAsync,
  watchPositionAsync: vi.fn(),
}));

vi.mock("expo-task-manager", () => ({
  getTaskOptionsAsync: vi.fn(),
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/recording/recording-native-events.service", () => ({
  recordRecordingNativeEvent: vi.fn().mockResolvedValue(undefined),
}));

const { getUnifiedAutoTrackingProfile, syncBackgroundLocationTracking } = await import(
  "../../services/location/location.service"
);

describe("location service background tracking profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationMocks.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    locationMocks.startLocationUpdatesAsync.mockResolvedValue(undefined);
    locationMocks.stopLocationUpdatesAsync.mockResolvedValue(undefined);
  });

  it("keeps native tracking on the unified AUTO bootstrap profile", () => {
    expect(getUnifiedAutoTrackingProfile()).toBe("walk");
  });

  it("starts AUTO background tracking with stable walk options", async () => {
    await syncBackgroundLocationTracking("recording", "trip-1");

    expect(locationMocks.startLocationUpdatesAsync).toHaveBeenCalledWith(
      "trailbook.background-recording-location",
      expect.objectContaining({
        accuracy: "high",
        activityType: "fitness",
        distanceInterval: 12,
        pausesUpdatesAutomatically: false,
        timeInterval: 15000,
      }),
    );
  });

  it("ignores inferred profile when choosing native tracking options", async () => {
    await syncBackgroundLocationTracking("recording", "trip-1", "drive");

    expect(locationMocks.startLocationUpdatesAsync).toHaveBeenCalledWith(
      "trailbook.background-recording-location",
      expect.objectContaining({
        activityType: "fitness",
        distanceInterval: 12,
        timeInterval: 15000,
      }),
    );
  });
});
