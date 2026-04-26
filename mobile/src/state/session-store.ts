import { useSyncExternalStore } from "react";

import {
  DEMO_CREDENTIALS,
  type AuthenticatedDeviceSession,
  type TemporaryUserCredentials,
} from "../domain/identity";
import { BackendRequestError } from "../services/api/mobile-api.service";
import { refreshMobileSessionWithBackend } from "../services/auth/mobile-auth.service";
import { getOrCreateDeviceId } from "../storage/device-storage";
import { loadSession, saveSession } from "../storage/session-storage";

interface SessionState {
  hydrated: boolean;
  credentials: TemporaryUserCredentials;
  deviceId: string;
  identitySession: AuthenticatedDeviceSession | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let state: SessionState = {
  hydrated: false,
  credentials: {
    email: "",
    password: "",
  },
  deviceId: "ios-local-device-001",
  identitySession: null,
};

let refreshInFlight: Promise<AuthenticatedDeviceSession | null> | null = null;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(updater: SessionState | ((currentState: SessionState) => SessionState)) {
  state = typeof updater === "function" ? updater(state) : updater;
  emitChange();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getSessionStateSnapshot(): SessionState {
  return state;
}

export function useSessionStore<T>(selector: (snapshot: SessionState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateSessionStore(): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  let identitySession = await loadSession();

  if (identitySession?.mode === "authenticated" && identitySession.refreshToken) {
    try {
      const refreshedSession = await refreshMobileSessionWithBackend(identitySession.refreshToken);
      identitySession = mergeRefreshedIdentitySession(identitySession, refreshedSession);
      await saveSession(identitySession);
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[Session] Startup refresh failed",
          error instanceof BackendRequestError
            ? { message: error.message, status: error.status }
            : { message: error instanceof Error ? error.message : "Unknown error" },
        );
      }

      if (error instanceof BackendRequestError && (error.status === 401 || error.status === 403)) {
        identitySession = null;
        await saveSession(null);
      }
    }
  }

  setState((currentState) => ({
    ...currentState,
    hydrated: true,
    identitySession,
    credentials: {
      email: identitySession?.userEmail ?? "",
      password: "",
    },
    deviceId: identitySession?.deviceId ?? deviceId,
  }));
}

export async function refreshActiveIdentitySessionIfPossible(): Promise<AuthenticatedDeviceSession | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const activeSession = state.identitySession;

  if (
    !activeSession ||
    activeSession.mode !== "authenticated" ||
    !activeSession.refreshToken
  ) {
    return activeSession;
  }

  const refreshToken = activeSession.refreshToken;

  refreshInFlight = (async () => {
    try {
      const refreshedSession = await refreshMobileSessionWithBackend(refreshToken);
      const nextSession = mergeRefreshedIdentitySession(activeSession, refreshedSession);

      setState((currentState) => ({
        ...currentState,
        identitySession: nextSession,
        credentials: {
          email: nextSession.userEmail,
          password: "",
        },
        deviceId: nextSession.deviceId,
      }));

      await saveSession(nextSession);
      return nextSession;
    } catch (error) {
      if (__DEV__) {
        console.warn(
          "[Session] Active refresh failed",
          error instanceof BackendRequestError
            ? { message: error.message, status: error.status }
            : { message: error instanceof Error ? error.message : "Unknown error" },
        );
      }

      if (error instanceof BackendRequestError && (error.status === 401 || error.status === 403)) {
        setState((currentState) => ({
          ...currentState,
          identitySession: null,
          credentials: {
            email: "",
            password: "",
          },
        }));
        await saveSession(null);
        return null;
      }

      return activeSession;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function updateSessionCredentials(partial: Partial<TemporaryUserCredentials>) {
  setState((currentState) => ({
    ...currentState,
    credentials: {
      ...currentState.credentials,
      ...partial,
    },
  }));
}

export async function setActiveIdentitySession(
  identitySession: AuthenticatedDeviceSession | null,
): Promise<void> {
  setState((currentState) => ({
    ...currentState,
    identitySession,
    credentials: {
      email: identitySession?.userEmail ?? "",
      password: "",
    },
    deviceId: identitySession?.deviceId ?? currentState.deviceId,
  }));

  await saveSession(identitySession);
}

export function clearSessionCredentials() {
  setState((currentState) => ({
    ...currentState,
    credentials: {
      email: "",
      password: "",
    },
  }));
}

function mergeRefreshedIdentitySession(
  identitySession: AuthenticatedDeviceSession,
  refreshedSession: Awaited<ReturnType<typeof refreshMobileSessionWithBackend>>,
): AuthenticatedDeviceSession {
  return {
    ...identitySession,
    userId: refreshedSession.user.id,
    userEmail: refreshedSession.user.email.trim().toLowerCase(),
    displayName: refreshedSession.user.displayName,
    providers: refreshedSession.user.providers,
    role: refreshedSession.user.role,
    sessionToken: refreshedSession.sessionToken,
    sessionExpiresAt: refreshedSession.sessionExpiresAt,
    refreshToken: refreshedSession.refreshToken,
    refreshExpiresAt: refreshedSession.refreshExpiresAt,
  };
}
