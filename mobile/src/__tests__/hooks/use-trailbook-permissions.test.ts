// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __clearAppStateListeners, __simulateAppStateChange } from "../__mocks__/react-native";
import { useTrailbookPermissions } from "../../core/hooks/use-trailbook-permissions";

const mockGetStatus = vi.fn();
const mockRequestPermissions = vi.fn();

vi.mock("../../services/permissions/permission-manager.service", () => ({
  formatMissingTrailbookPermissions: (status: { missingRequired: string[] } | null) =>
    status?.missingRequired.join(", ") ?? "",
  getTrailbookPermissionStatus: () => mockGetStatus(),
  requestTrailbookPermissions: () => mockRequestPermissions(),
}));

const mockUseSessionStore = vi.fn();

vi.mock("../../state/session-store", () => ({
  useSessionStore: (selector: (s: { identitySession: { userId: string } | null }) => unknown) =>
    mockUseSessionStore(selector),
}));

function makeStatus(overrides?: Partial<{
  allRequiredGranted: boolean;
  backgroundLocationGranted: boolean;
  backgroundLocationSupported: boolean;
  cameraGranted: boolean;
  foregroundLocationGranted: boolean;
  mediaLibraryGranted: boolean;
  missingRequired: string[];
  motionActivityGranted: boolean;
  notificationsGranted: boolean;
}>) {
  return {
    allRequiredGranted: true,
    backgroundLocationGranted: true,
    backgroundLocationSupported: true,
    cameraGranted: true,
    foregroundLocationGranted: true,
    mediaLibraryGranted: true,
    missingRequired: [],
    motionActivityGranted: true,
    notificationsGranted: true,
    ...overrides,
  };
}

beforeEach(() => {
  __clearAppStateListeners();
  mockGetStatus.mockResolvedValue(makeStatus());
  mockRequestPermissions.mockResolvedValue(makeStatus());
  mockUseSessionStore.mockImplementation(
    (selector: (s: { identitySession: { userId: string } | null }) => unknown) =>
      selector({ identitySession: { userId: "user-1" } }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useTrailbookPermissions", () => {
  it("returns permissionsReady false before first status check", () => {
    mockGetStatus.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useTrailbookPermissions());
    expect(result.current.permissionsReady).toBe(false);
    expect(result.current.missingRequired).toBeNull();
  });

  it("sets permissionsReady true after all permissions granted on mount", async () => {
    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});
    expect(result.current.permissionsReady).toBe(true);
    expect(result.current.missingRequired).toEqual([]);
  });

  it("exposes individual permission flags from status", async () => {
    const missing = makeStatus({ foregroundLocationGranted: false, allRequiredGranted: false, missingRequired: ["foregroundLocation"] });
    mockGetStatus.mockResolvedValue(missing);
    mockRequestPermissions.mockResolvedValue(missing);

    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    expect(result.current.locationPermissionGranted).toBe(false);
    expect(result.current.permissionsReady).toBe(false);
  });

  it("auto-requests permissions on mount when they are missing", async () => {
    const missing = makeStatus({ allRequiredGranted: false, missingRequired: ["foregroundLocation"] });
    const granted = makeStatus();
    mockGetStatus.mockResolvedValue(missing);
    mockRequestPermissions.mockResolvedValue(granted);

    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    expect(mockRequestPermissions).toHaveBeenCalledOnce();
    expect(result.current.permissionsReady).toBe(true);
  });

  it("does not auto-request if permissions are already granted", async () => {
    const { result: _ } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("refreshes status when app comes to foreground", async () => {
    const missing = makeStatus({ foregroundLocationGranted: false, allRequiredGranted: false, missingRequired: ["foregroundLocation"] });
    mockGetStatus
      .mockResolvedValueOnce(makeStatus())
      .mockResolvedValueOnce(makeStatus())
      .mockResolvedValueOnce(missing);

    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    expect(result.current.permissionsReady).toBe(true);

    await act(async () => {
      __simulateAppStateChange("active");
    });

    expect(result.current.permissionsReady).toBe(false);
  });

  it("requestPermissions calls requestTrailbookPermissions and updates status", async () => {
    const updated = makeStatus({ foregroundLocationGranted: false, allRequiredGranted: false, missingRequired: ["foregroundLocation"] });
    mockRequestPermissions.mockResolvedValue(updated);

    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    await act(async () => {
      await result.current.requestPermissions();
    });

    expect(mockRequestPermissions).toHaveBeenCalled();
    expect(result.current.locationPermissionGranted).toBe(false);
  });

  it("refreshStatus returns the fresh status and updates hook state", async () => {
    const { result } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    const fresh = makeStatus({ backgroundLocationGranted: false, allRequiredGranted: false, missingRequired: ["backgroundLocation"] });
    mockGetStatus.mockResolvedValueOnce(fresh);

    let returned: ReturnType<typeof makeStatus> | undefined;

    await act(async () => {
      returned = await result.current.refreshStatus();
    });

    expect(returned?.backgroundLocationGranted).toBe(false);
    expect(result.current.backgroundLocationPermissionGranted).toBe(false);
  });

  it("does not re-prompt on the same userId after initial check", async () => {
    const { result: _ } = renderHook(() => useTrailbookPermissions());
    await act(async () => {});

    expect(mockGetStatus).toHaveBeenCalledTimes(2);
  });
});
