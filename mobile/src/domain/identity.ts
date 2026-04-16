export interface TemporaryUserCredentials {
  email: string;
  password: string;
}

export type AuthProvider = "local" | "google" | "facebook" | "apple";
export type SessionMode = "demo" | "authenticated";

export interface AuthenticatedUserSummary {
  displayName: string;
  email: string;
  id: string;
  providers: AuthProvider[];
  role: "user" | "admin";
}

export interface AuthenticatedDeviceSession {
  userId: string;
  userEmail: string;
  deviceId: string;
  signedInAt: string;
  mode: SessionMode;
  displayName: string;
  providers: AuthProvider[];
  role: "user" | "admin";
  sessionToken: string | null;
  sessionExpiresAt: string | null;
  refreshToken: string | null;
  refreshExpiresAt: string | null;
}

export function normalizeUserIdFromEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const DEMO_CREDENTIALS: TemporaryUserCredentials = {
  email: "demo",
  password: "demo",
};

export function isDemoCredentials(credentials: TemporaryUserCredentials): boolean {
  return (
    credentials.email.trim().toLowerCase() === DEMO_CREDENTIALS.email &&
    credentials.password === DEMO_CREDENTIALS.password
  );
}

export function createDemoDeviceSession(deviceId: string): AuthenticatedDeviceSession {
  return {
    userId: normalizeUserIdFromEmail(DEMO_CREDENTIALS.email),
    userEmail: DEMO_CREDENTIALS.email,
    deviceId,
    signedInAt: new Date().toISOString(),
    mode: "demo",
    displayName: "Demo",
    providers: ["local"],
    role: "user",
    sessionToken: null,
    sessionExpiresAt: null,
    refreshToken: null,
    refreshExpiresAt: null,
  };
}

export function createBackendAuthenticatedSession(
  user: AuthenticatedUserSummary,
  sessionToken: string,
  refreshToken: string,
  deviceId: string,
  sessionExpiresAt: string,
  refreshExpiresAt: string,
): AuthenticatedDeviceSession {
  return {
    userId: user.id,
    userEmail: user.email.trim().toLowerCase(),
    deviceId,
    signedInAt: new Date().toISOString(),
    mode: "authenticated",
    displayName: user.displayName,
    providers: user.providers,
    role: user.role,
    sessionToken,
    sessionExpiresAt,
    refreshToken,
    refreshExpiresAt,
  };
}

export function isTemporaryLoginValid(credentials: TemporaryUserCredentials): boolean {
  return isDemoCredentials(credentials);
}
