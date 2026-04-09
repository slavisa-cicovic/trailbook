import { createDemoDeviceSession, isDemoCredentials, type TemporaryUserCredentials } from "../../domain/identity";

export function canCreateTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
): boolean {
  return isDemoCredentials(credentials) && deviceId.trim().length > 0;
}

export function createTemporarySession(deviceId: string) {
  return createDemoDeviceSession(deviceId.trim());
}
