import {
  createAuthenticatedDeviceSession,
  isTemporaryLoginValid,
  type TemporaryUserCredentials,
} from "../../domain/identity";

export function canCreateTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
): boolean {
  return isTemporaryLoginValid(credentials) && deviceId.trim().length > 0;
}

export function createTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
) {
  return createAuthenticatedDeviceSession(credentials, deviceId.trim());
}
