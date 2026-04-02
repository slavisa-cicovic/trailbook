import {
  createAuthenticatedDeviceSession,
  type TemporaryUserCredentials,
} from "../../domain/identity";

const HARD_CODED_EMAIL = "slavisacicovic@gmail.com";
const HARD_CODED_PASSWORD = "111111";

export function canCreateTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
): boolean {
  return credentials.email.trim().length > 0 && credentials.password.length > 0 && deviceId.trim().length > 0;
}

export function areHardcodedCredentialsValid(
  credentials: TemporaryUserCredentials,
): boolean {
  return (
    credentials.email.trim().toLowerCase() === HARD_CODED_EMAIL &&
    credentials.password === HARD_CODED_PASSWORD
  );
}

export function createTemporarySession(
  credentials: TemporaryUserCredentials,
  deviceId: string,
) {
  return createAuthenticatedDeviceSession(credentials, deviceId.trim());
}
