import {
  createAuthenticatedDeviceSession,
  type TemporaryUserCredentials,
} from "../../domain/identity";

export function canCreateTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
): boolean {
  return credentials.email.trim().length > 0 && credentials.password.length > 0 && deviceId.trim().length > 0;
}

export function createTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
) {
  return createAuthenticatedDeviceSession(credentials, deviceId.trim());
}
