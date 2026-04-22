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

export function useSessionStore<T>(selector: (snapshot: SessionState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(getSnapshot()), () => selector(getSnapshot()));
}

export async function hydrateSessionStore(): Promise<void> {
  const deviceId = await getOrCreateDeviceId();
  let identitySession = await loadSession();

  if (identitySession?.mode === "authenticated" && identitySession.refreshToken) {
    try {
      const refreshedSession = await refreshMobileSessionWithBackend(identitySession.refreshToken);
      identitySession = {
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
      await saveSession(identitySession);
    } catch (error) {
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
