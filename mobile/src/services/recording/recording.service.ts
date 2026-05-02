import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import type { MotionActivity } from "../../domain/motion-activity";
import type { BatterySnapshot } from "../device/battery.service";
import type {
  RecordingMode,
  RecordingProfile,
  RecordingSessionSummary,
  Trip,
  TripPause,
  TripSegment,
} from "../../domain/trips";
import {
  getOpenTripSegmentForTrip,
  getVisibleTripSegmentsForTrip,
  startNextTripSegment,
} from "../trip-segments/trip-segments.service";
import {
  closeTripPause,
  createTripPause,
  getOpenTripPauseForTrip,
} from "../trip-pauses/trip-pauses.service";
import { getActiveRecordingConfigSnapshot } from "./recording-config.service";

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
    motionActivityType: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
  };
}

export function createTripForRecording(
  identitySession: AuthenticatedDeviceSession,
  startedAt: string,
  draft: RecordingDraftInput,
  batterySnapshot: BatterySnapshot | null = null,
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
    recordingConfig: getActiveRecordingConfigSnapshot(),
    batteryStartLevelPercent: batterySnapshot?.levelPercent ?? null,
    batteryStartState: batterySnapshot?.state ?? null,
    batteryEndLevelPercent: null,
    batteryEndState: null,
    status: "active",
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
    motionActivityType: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
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
  const activeTrip = [...trips]
    .reverse()
    .find((trip) => trip.deletedAt === null && trip.status === "active" && trip.endedAt === null);

  if (!activeTrip) {
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
        motionActivityType: null,
        motionActivityConfidence: null,
        motionActivityRecordedAt: null,
        motionActivitySourcePlatform: null,
      };
    }

    return session;
  }

  const openSegment = getOpenTripSegmentForTrip(tripSegments, activeTrip.localId);

  if (session.status === "recording") {
    return {
      ...session,
      status: "recording",
      activeTripId: activeTrip.localId,
      activeSegmentId: session.activeSegmentId ?? openSegment?.localId ?? null,
      startedAt: session.startedAt ?? activeTrip.startedAt,
      interruptedAt: null,
      userId: session.userId ?? activeTrip.userId,
      deviceId: session.deviceId ?? activeTrip.deviceId,
      recordingMode: session.recordingMode ?? (openSegment?.recordingProfile ?? activeTrip.recordingProfile),
      recordingProfile:
        session.recordingProfile ?? openSegment?.recordingProfile ?? activeTrip.recordingProfile,
    };
  }

  if (session.status === "interrupted") {
    return {
      ...session,
      activeTripId: activeTrip.localId,
      activeSegmentId: session.activeSegmentId ?? openSegment?.localId ?? null,
      startedAt: session.startedAt ?? activeTrip.startedAt,
      interruptedAt: session.interruptedAt ?? now,
      userId: session.userId ?? activeTrip.userId,
      deviceId: session.deviceId ?? activeTrip.deviceId,
      recordingMode: session.recordingMode ?? (openSegment?.recordingProfile ?? activeTrip.recordingProfile),
      recordingProfile:
        session.recordingProfile ?? openSegment?.recordingProfile ?? activeTrip.recordingProfile,
    };
  }

  return {
    ...session,
    status: "interrupted",
    activeTripId: activeTrip.localId,
    activeSegmentId: openSegment?.localId ?? null,
    startedAt: activeTrip.startedAt,
    interruptedAt: now,
    userId: session.userId ?? activeTrip.userId,
    deviceId: session.deviceId ?? activeTrip.deviceId,
    recordingMode: openSegment?.recordingProfile ?? activeTrip.recordingProfile,
    recordingProfile: openSegment?.recordingProfile ?? activeTrip.recordingProfile,
    autoCandidateProfile: null,
    autoCandidateSince: null,
    motionActivityType: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
  };
}

export function closeActiveTrip(
  trips: Trip[],
  activeTripId: string,
  endedAt: string,
  batterySnapshot: BatterySnapshot | null = null,
): Trip[] {
  return trips.map((trip) =>
    trip.localId === activeTripId
      ? {
          ...trip,
          status: "ended",
          endedAt,
          batteryEndLevelPercent: batterySnapshot?.levelPercent ?? trip.batteryEndLevelPercent,
          batteryEndState: batterySnapshot?.state ?? trip.batteryEndState,
          updatedAt: endedAt,
          syncStatus: "pending-sync",
        }
      : trip,
  );
}

export function pauseActiveTrip(trips: Trip[], activeTripId: string, pausedAt: string): Trip[] {
  return trips.map((trip) =>
    trip.localId === activeTripId
      ? {
          ...trip,
          status: "paused",
          updatedAt: pausedAt,
          syncStatus: trip.syncStatus === "local-only" ? "local-only" : "pending-sync",
        }
      : trip,
  );
}

export function createPausedRecordingState(
  activeTrip: Trip,
  session: RecordingSessionSummary,
  tripSegments: TripSegment[],
  tripPauses: TripPause[],
  pausedAt: string,
): {
  session: RecordingSessionSummary;
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
} {
  if (!session.activeSegmentId) {
    throw new Error("There is no active segment to pause.");
  }

  return {
    tripSegments: tripSegments.map((segment) =>
      segment.localId === session.activeSegmentId
        ? {
            ...segment,
            endedAt: pausedAt,
            updatedAt: pausedAt,
            syncStatus: segment.syncStatus === "local-only" ? "local-only" : "pending-sync",
          }
        : segment,
    ),
    tripPauses: [...tripPauses, createTripPause(activeTrip, pausedAt)],
    session: stopRecordingSession(session),
  };
}

export function createResumedRecordingState(
  identitySession: AuthenticatedDeviceSession,
  trip: Trip,
  tripSegments: TripSegment[],
  tripPauses: TripPause[],
  resumedAt: string,
): {
  recordingProfile: RecordingProfile;
  session: RecordingSessionSummary;
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
} {
  const orderedSegments = getVisibleTripSegmentsForTrip(tripSegments, trip.localId);
  const lastSegment = orderedSegments[orderedSegments.length - 1] ?? null;
  const openPause = getOpenTripPauseForTrip(tripPauses, trip.localId);
  const nextRecordingProfile = lastSegment?.recordingProfile ?? trip.recordingProfile;
  const pauseToClose =
    openPause ??
    createTripPause(
      trip,
      trip.updatedAt ?? lastSegment?.endedAt ?? resumedAt,
    );
  const { nextSegment, tripSegments: nextTripSegments } = startNextTripSegment(
    {
      ...trip,
      status: "active",
    },
    tripSegments,
    nextRecordingProfile,
    resumedAt,
  );

  return {
    recordingProfile: nextRecordingProfile,
    tripSegments: nextTripSegments,
    tripPauses: closeTripPause(
      openPause ? tripPauses : [...tripPauses, pauseToClose],
      pauseToClose.localId,
      resumedAt,
    ),
    session: createRecordingSession(
      identitySession,
      trip.localId,
      nextSegment.localId,
      resumedAt,
      nextRecordingProfile,
      nextRecordingProfile,
    ),
  };
}

export function resumePausedTrip(trips: Trip[], tripLocalId: string, resumedAt: string): Trip[] {
  return trips.map((trip) =>
    trip.localId === tripLocalId
      ? {
          ...trip,
          status: "active",
          updatedAt: resumedAt,
          syncStatus: trip.syncStatus === "local-only" ? "local-only" : "pending-sync",
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

export function updateRecordingMotionActivity(
  session: RecordingSessionSummary,
  motionActivity: MotionActivity | null,
): RecordingSessionSummary {
  return {
    ...session,
    motionActivityType: motionActivity?.type ?? null,
    motionActivityConfidence: motionActivity?.confidence ?? null,
    motionActivityRecordedAt: motionActivity?.recordedAt ?? null,
    motionActivitySourcePlatform: motionActivity?.sourcePlatform ?? null,
  };
}
