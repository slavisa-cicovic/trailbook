import type { AuthenticatedDeviceSession } from "../domain/identity";

export const STATIC_FLAGS = {
  tripDiagnosticsEnabled: process.env.EXPO_PUBLIC_ENABLE_TRIP_DIAGNOSTICS === "true",
} as const;

export function resolveSessionFlags(session: AuthenticatedDeviceSession | null) {
  const isTestUser =
    session?.mode === "authenticated" && (session.role === "test_user" || session.role === "admin");

  return {
    diagnosticsEnabled: isTestUser,
    rawEventReprocessingEnabled: isTestUser,
    supportDebugInfoEnabled: isTestUser,
    testSettingsEnabled: isTestUser,
  };
}
