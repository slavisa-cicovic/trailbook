export interface TemporaryUserCredentials {
  email: string;
  password: string;
}

export type SessionMode = "demo" | "standard";

export interface AuthenticatedDeviceSession {
  userId: string;
  userEmail: string;
  deviceId: string;
  signedInAt: string;
  mode: SessionMode;
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

export function createAuthenticatedDeviceSession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
): AuthenticatedDeviceSession {
  const normalizedEmail = credentials.email.trim().toLowerCase();

  return {
    userId: normalizeUserIdFromEmail(normalizedEmail),
    userEmail: normalizedEmail,
    deviceId,
    signedInAt: new Date().toISOString(),
    mode: normalizedEmail === DEMO_CREDENTIALS.email ? "demo" : "standard",
  };
}

export function isTemporaryLoginValid(credentials: TemporaryUserCredentials): boolean {
  return isDemoCredentials(credentials);
}
