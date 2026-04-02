import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { RecordingSessionSummary, Trip } from "../../domain/trips";

export function createRecordingSession(
  identitySession: AuthenticatedDeviceSession,
  startedAt: string,
): RecordingSessionSummary {
  return {
    activeTripId: `trip-${startedAt}`,
    isRecording: true,
    lastPointRecordedAt: startedAt,
    userId: identitySession.userId,
    userEmail: identitySession.userEmail,
    deviceId: identitySession.deviceId,
  };
}

export function createTripForRecording(
  identitySession: AuthenticatedDeviceSession,
  startedAt: string,
): Trip {
  return {
    localId: `trip-${startedAt}`,
    serverId: null,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    deletedAt: null,
    syncStatus: "local-only",
  };
}

export function stopRecordingSession(session: RecordingSessionSummary): RecordingSessionSummary {
  return {
    ...session,
    activeTripId: null,
    isRecording: false,
  };
}

export function closeActiveTrip(trips: Trip[], activeTripId: string, endedAt: string): Trip[] {
  return trips.map((trip) =>
    trip.localId === activeTripId
      ? {
          ...trip,
          endedAt,
          updatedAt: endedAt,
          syncStatus: "pending-sync",
        }
      : trip,
  );
}
