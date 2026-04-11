import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type {
  RecordingMode,
  RecordingProfile,
  RecordingSessionSummary,
  Trip,
  TripSegment,
} from "../../domain/trips";
import { getOpenTripSegmentForTrip } from "../trip-segments/trip-segments.service";

export interface RecordingDraftInput {
  description: string;
  recordingMode: RecordingMode;
  title: string;
}

export function getConcreteRecordingProfileForMode(recordingMode: RecordingMode): RecordingProfile {
  return recordingMode === "auto" ? DEFAULT_RECORDING_PROFILE : recordingMode;
}

export function createRecordingSession(
  identitySession: AuthenticatedDeviceSession,
  activeTripId: string,
  activeSegmentId: string,
  startedAt: string,
  recordingMode: RecordingMode,
  recordingProfile: RecordingProfile,
): RecordingSessionSummary {
  return {
    status: "recording",
    activeTripId,
    activeSegmentId,
    startedAt,
    lastPointRecordedAt: startedAt,
    interruptedAt: null,
    userId: identitySession.userId,
    userEmail: identitySession.userEmail,
    deviceId: identitySession.deviceId,
    recordingMode,
    recordingProfile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
  };
}

export function createTripForRecording(
  identitySession: AuthenticatedDeviceSession,
  startedAt: string,
  draft: RecordingDraftInput,
): Trip {
  const concreteRecordingProfile = getConcreteRecordingProfileForMode(draft.recordingMode);

  return {
    localId: `trip-${startedAt}`,
    serverId: null,
    deviceId: identitySession.deviceId,
    userId: identitySession.userId,
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    recordingProfile: concreteRecordingProfile,
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
    activeSegmentId: null,
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
  tripSegments: TripSegment[],
  now: string,
): RecordingSessionSummary {
  const unfinishedTrip = [...trips].reverse().find((trip) => trip.endedAt === null);

  if (!unfinishedTrip) {
    if (session.status === "recording" || session.status === "interrupted") {
      return {
        ...session,
        status: "idle",
        activeTripId: null,
        activeSegmentId: null,
        startedAt: null,
        interruptedAt: null,
        recordingMode: DEFAULT_RECORDING_PROFILE,
        recordingProfile: DEFAULT_RECORDING_PROFILE,
        autoCandidateProfile: null,
        autoCandidateSince: null,
      };
    }

    return session;
  }

  const openSegment = getOpenTripSegmentForTrip(tripSegments, unfinishedTrip.localId);

  if (session.status === "recording") {
    return {
      ...session,
      status: "recording",
      activeTripId: unfinishedTrip.localId,
      activeSegmentId: session.activeSegmentId ?? openSegment?.localId ?? null,
      startedAt: session.startedAt ?? unfinishedTrip.startedAt,
      interruptedAt: null,
      userId: session.userId ?? unfinishedTrip.userId,
      deviceId: session.deviceId ?? unfinishedTrip.deviceId,
      recordingMode: session.recordingMode ?? (openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile),
      recordingProfile:
        session.recordingProfile ?? openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile,
    };
  }

  if (session.status === "interrupted") {
    return {
      ...session,
      activeTripId: unfinishedTrip.localId,
      activeSegmentId: session.activeSegmentId ?? openSegment?.localId ?? null,
      startedAt: session.startedAt ?? unfinishedTrip.startedAt,
      interruptedAt: session.interruptedAt ?? now,
      userId: session.userId ?? unfinishedTrip.userId,
      deviceId: session.deviceId ?? unfinishedTrip.deviceId,
      recordingMode: session.recordingMode ?? (openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile),
      recordingProfile:
        session.recordingProfile ?? openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile,
    };
  }

  return {
    ...session,
    status: "interrupted",
    activeTripId: unfinishedTrip.localId,
    activeSegmentId: openSegment?.localId ?? null,
    startedAt: unfinishedTrip.startedAt,
    interruptedAt: now,
    userId: session.userId ?? unfinishedTrip.userId,
    deviceId: session.deviceId ?? unfinishedTrip.deviceId,
    recordingMode: openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile,
    recordingProfile: openSegment?.recordingProfile ?? unfinishedTrip.recordingProfile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
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

export function updateRecordingProfile(
  session: RecordingSessionSummary,
  recordingMode: RecordingMode,
  recordingProfile: RecordingProfile,
): RecordingSessionSummary {
  return {
    ...session,
    recordingMode,
    recordingProfile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
  };
}

export function updateRecordingSegment(
  session: RecordingSessionSummary,
  activeSegmentId: string,
  recordingProfile: RecordingProfile,
): RecordingSessionSummary {
  return {
    ...session,
    activeSegmentId,
    recordingProfile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
  };
}

export function updateRecordingAutoCandidate(
  session: RecordingSessionSummary,
  autoCandidateProfile: RecordingProfile | null,
  autoCandidateSince: string | null,
): RecordingSessionSummary {
  return {
    ...session,
    autoCandidateProfile,
    autoCandidateSince,
  };
}
