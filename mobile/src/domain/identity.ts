export interface TemporaryUserCredentials {
  email: string;
  password: string;
}

export interface AuthenticatedDeviceSession {
  userId: string;
  userEmail: string;
  deviceId: string;
  signedInAt: string;
}

export function normalizeUserIdFromEmail(email: string): string {
  return email.trim().toLowerCase();
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
  };
}

export function isTemporaryLoginValid(credentials: TemporaryUserCredentials): boolean {
  return credentials.email.trim().length > 0 && credentials.password.length > 0;
}
