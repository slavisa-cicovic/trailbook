import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatMissingTrailbookPermissions,
  getTrailbookPermissionLabel,
  getTrailbookPermissionStatus,
} from "../../services/permissions/permission-manager.service";

vi.mock("expo-constants", () => ({
  default: { executionEnvironment: "standalone" },
}));

vi.mock("expo-task-manager", () => ({
  isAvailableAsync: vi.fn().mockResolvedValue(true),
}));

const mockForegroundPermissions = vi.fn().mockResolvedValue({ granted: true });
const mockBackgroundPermissions = vi.fn().mockResolvedValue({ granted: true });

vi.mock("expo-location", () => ({
  getForegroundPermissionsAsync: () => mockForegroundPermissions(),
  getBackgroundPermissionsAsync: () => mockBackgroundPermissions(),
  requestForegroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestBackgroundPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
}));

vi.mock("expo-image-picker", () => ({
  getCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  getMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestCameraPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: vi.fn().mockResolvedValue({ granted: true }),
}));

vi.mock("../../services/motion/motion-activity.service", () => ({
  isMotionActivityAvailableAsync: vi.fn().mockResolvedValue(false),
}));

vi.mock("../../services/device/android-power-management.service", () => ({
  isAndroidBatteryOptimizationIgnoredAsync: vi.fn().mockResolvedValue(true),
  isAndroidBatteryOptimizationStatusSupported: vi.fn().mockReturnValue(false),
  openAndroidBatteryOptimizationSettingsAsync: vi.fn().mockResolvedValue(undefined),
}));

describe("getTrailbookPermissionLabel", () => {
  it.each([
    ["foregroundLocation", "Location: While using the app"],
    ["backgroundLocation", "Location: Allow all the time"],
    ["batteryOptimization", "Battery: Unrestricted"],
    ["motionActivity", "Physical activity"],
    ["notifications", "Notifications"],
    ["camera", "Camera"],
    ["mediaLibrary", "Photos"],
  ] as const)("returns label for %s", (key, expected) => {
    expect(getTrailbookPermissionLabel(key)).toBe(expected);
  });
});

describe("formatMissingTrailbookPermissions", () => {
  it("returns empty string when status is null", () => {
    expect(formatMissingTrailbookPermissions(null)).toBe("");
  });

  it("returns empty string when all required are granted", () => {
    expect(
      formatMissingTrailbookPermissions({
        allRequiredGranted: true,
        missingRequired: [],
        backgroundLocationGranted: true,
        backgroundLocationSupported: true,
        batteryOptimizationIgnored: true,
        batteryOptimizationSupported: false,
        cameraGranted: true,
        foregroundLocationGranted: true,
        mediaLibraryGranted: true,
        motionActivityGranted: true,
        notificationsGranted: true,
      }),
    ).toBe("");
  });

  it("formats a single missing permission", () => {
    expect(
      formatMissingTrailbookPermissions({
        allRequiredGranted: false,
        missingRequired: ["foregroundLocation"],
        backgroundLocationGranted: false,
        backgroundLocationSupported: true,
        batteryOptimizationIgnored: true,
        batteryOptimizationSupported: false,
        cameraGranted: true,
        foregroundLocationGranted: false,
        mediaLibraryGranted: true,
        motionActivityGranted: true,
        notificationsGranted: true,
      }),
    ).toBe("Location: While using the app");
  });

  it("joins multiple missing permissions with a comma", () => {
    const text = formatMissingTrailbookPermissions({
      allRequiredGranted: false,
      missingRequired: ["foregroundLocation", "camera"],
      backgroundLocationGranted: true,
      backgroundLocationSupported: true,
      batteryOptimizationIgnored: true,
      batteryOptimizationSupported: false,
      cameraGranted: false,
      foregroundLocationGranted: false,
      mediaLibraryGranted: true,
      motionActivityGranted: true,
      notificationsGranted: true,
    });
    expect(text).toBe("Location: While using the app, Camera");
  });
});

describe("getTrailbookPermissionStatus", () => {
  beforeEach(() => {
    mockForegroundPermissions.mockResolvedValue({ granted: true });
    mockBackgroundPermissions.mockResolvedValue({ granted: true });
  });

  it("returns allRequiredGranted true when all permissions are granted", async () => {
    const status = await getTrailbookPermissionStatus();
    expect(status.allRequiredGranted).toBe(true);
    expect(status.missingRequired).toHaveLength(0);
  });

  it("includes foregroundLocation in missingRequired when not granted", async () => {
    mockForegroundPermissions.mockResolvedValue({ granted: false });

    const status = await getTrailbookPermissionStatus();

    expect(status.foregroundLocationGranted).toBe(false);
    expect(status.missingRequired).toContain("foregroundLocation");
    expect(status.allRequiredGranted).toBe(false);
  });

  it("includes backgroundLocation in missingRequired when not granted and supported", async () => {
    mockBackgroundPermissions.mockResolvedValue({ granted: false });

    const status = await getTrailbookPermissionStatus();

    expect(status.backgroundLocationGranted).toBe(false);
    expect(status.missingRequired).toContain("backgroundLocation");
    expect(status.allRequiredGranted).toBe(false);
  });

  it("reports backgroundLocationSupported based on TaskManager availability", async () => {
    const { isAvailableAsync } = await import("expo-task-manager");
    vi.mocked(isAvailableAsync).mockResolvedValueOnce(false);

    const status = await getTrailbookPermissionStatus();

    expect(status.backgroundLocationSupported).toBe(false);
  });

  it("does not include motionActivity in missingRequired on iOS when module unavailable", async () => {
    const status = await getTrailbookPermissionStatus();
    expect(status.missingRequired).not.toContain("motionActivity");
    expect(status.motionActivityGranted).toBe(true);
  });
});
