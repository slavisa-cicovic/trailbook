import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { RecordingSessionSummary, Trip } from "../../domain/trips";

export function createRecordingSession(
  identitySession: AuthenticatedDeviceSession,
  startedAt: string,
): RecordingSessionSummary {
  return {
    status: "recording",
    activeTripId: `trip-${startedAt}`,
    startedAt,
    lastPointRecordedAt: startedAt,
    interruptedAt: null,
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
    status: "idle",
    activeTripId: null,
    startedAt: null,
    interruptedAt: null,
  };
}

export function continueInterruptedRecording(
  session: RecordingSessionSummary,
): RecordingSessionSummary {
  return {
    ...session,
    status: "recording",
    interruptedAt: null,
  };
}

export function markRecordingInterrupted(
  session: RecordingSessionSummary,
  interruptedAt: string,
): RecordingSessionSummary {
  return {
    ...session,
    status: "interrupted",
    interruptedAt,
  };
}

export function updateRecordingLastPoint(
  session: RecordingSessionSummary,
  recordedAt: string,
): RecordingSessionSummary {
  return {
    ...session,
    lastPointRecordedAt: recordedAt,
  };
}

export function reconcileRecordingSessionWithTrips(
  session: RecordingSessionSummary,
  trips: Trip[],
  now: string,
): RecordingSessionSummary {
  const unfinishedTrip = [...trips].reverse().find((trip) => trip.endedAt === null);

  if (!unfinishedTrip) {
    if (session.status === "recording" || session.status === "interrupted") {
      return {
        ...session,
        status: "idle",
        activeTripId: null,
        startedAt: null,
        interruptedAt: null,
      };
    }

    return session;
  }

  if (session.status === "recording") {
    return {
      ...session,
      status: "interrupted",
      activeTripId: unfinishedTrip.localId,
      startedAt: session.startedAt ?? unfinishedTrip.startedAt,
      interruptedAt: now,
      userId: session.userId ?? unfinishedTrip.userId,
      deviceId: session.deviceId ?? unfinishedTrip.deviceId,
    };
  }

  if (session.status === "interrupted") {
    return {
      ...session,
      activeTripId: unfinishedTrip.localId,
      startedAt: session.startedAt ?? unfinishedTrip.startedAt,
      interruptedAt: session.interruptedAt ?? now,
      userId: session.userId ?? unfinishedTrip.userId,
      deviceId: session.deviceId ?? unfinishedTrip.deviceId,
    };
  }

  return {
    ...session,
    status: "interrupted",
    activeTripId: unfinishedTrip.localId,
    startedAt: unfinishedTrip.startedAt,
    interruptedAt: now,
    userId: session.userId ?? unfinishedTrip.userId,
    deviceId: session.deviceId ?? unfinishedTrip.deviceId,
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
