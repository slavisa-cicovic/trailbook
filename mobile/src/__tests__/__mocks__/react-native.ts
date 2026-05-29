import { vi } from "vitest";

export const Platform = {
  OS: "ios" as const,
  Version: 16,
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};

type AppStateChangeHandler = (state: string) => void;
const appStateListeners: AppStateChangeHandler[] = [];

export const AppState = {
  addEventListener: vi.fn((_event: string, handler: AppStateChangeHandler) => {
    appStateListeners.push(handler);
    return {
      remove: vi.fn(() => {
        const index = appStateListeners.indexOf(handler);
        if (index !== -1) appStateListeners.splice(index, 1);
      }),
    };
  }),
};

export function __simulateAppStateChange(state: string) {
  appStateListeners.forEach((handler) => handler(state));
}

export function __clearAppStateListeners() {
  appStateListeners.splice(0, appStateListeners.length);
}

export const PermissionsAndroid = {
  PERMISSIONS: {
    ACTIVITY_RECOGNITION: "android.permission.ACTIVITY_RECOGNITION",
    CAMERA: "android.permission.CAMERA",
    POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS",
  },
  RESULTS: {
    GRANTED: "granted",
    DENIED: "denied",
  },
  check: vi.fn().mockResolvedValue(true),
  request: vi.fn().mockResolvedValue("granted"),
};
