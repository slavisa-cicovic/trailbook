import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { RecordingSessionSummary, Trip, TripPause, TripPoint, TripSegment, Waypoint } from "../../domain/trips";
import { DEFAULT_RECORDING_PROFILE } from "../../constants/recording-profiles";
import {
  DEMO_MONTHLY_TRIP_LIMIT,
  getRemainingDemoTripSlots,
  isDemoSession,
} from "../../services/demo/demo-mode.service";
import { getBatterySnapshot } from "../../services/device/battery.service";
import {
  getBackgroundTrackingProfile,
  startBackgroundLocationTracking,
  startBackgroundLocationTrackingWithRetry,
  stopBackgroundLocationTracking,
} from "../../services/location/location.service";
import {
  ensureMotionActivityUpdatesForAutoMode,
  stopMotionActivityUpdates,
} from "../../services/motion/motion-activity.service";
import {
  closeActiveTrip,
  continueInterruptedRecording,
  createRecordingSession,
  createPausedRecordingState,
  createResumedRecordingState,
  createTripForRecording,
  getConcreteRecordingProfileForMode,
  pauseActiveTrip,
  resumePausedTrip,
  stopRecordingSession,
  type RecordingDraftInput,
} from "../../services/recording/recording.service";
import { clearAutoRecordingSamples } from "../../services/recording/auto-recording.service";
import { recordRecordingNativeEvent } from "../../services/recording/recording-native-events.service";
import {
  closeActiveTripSegment,
  createInitialTripSegment,
  finalizeEndedTripSegments,
  normalizeAutoClosedTripSegment,
} from "../../services/trip-segments/trip-segments.service";
import {
  flushTripPointDiagnostics,
  resetPendingTripPointContinuity,
  resetTripPointDiagnostics,
} from "../../services/trip-points/trip-points.service";
import { loadTripPointsForTrip, refreshTripStatsForTripLocalId, replaceTripPointsForTrip } from "../../repositories/trip-points-repository";
import { setRecordingSession } from "../../state/recording-store";
import { setTripPauses } from "../../state/trip-pauses-store";
import { setTripPointsInMemory } from "../../state/trip-points-store";
import { setTripSegments } from "../../state/trip-segments-store";
import { setTrips } from "../../state/trips-store";
import { setWaypoints } from "../../state/waypoints-store";

export type RecordingScreenActionResult =
  | { ok: true; tripLocalId: string }
  | { ok: false; reason: "no_identity" }
  | { ok: false; reason: "demo_limit"; message: string }
  | { ok: false; reason: "active_route"; message: string }
  | { ok: false; reason: "paused_route_missing"; message: string }
  | { ok: false; reason: "no_active_route" }
  | { ok: false; reason: "missing_permissions" }
  | { ok: false; reason: "native_start_failed"; message: string };

interface StartRecordingControllerInput {
  activeIdentitySession: AuthenticatedDeviceSession | null;
  backgroundLocationPermissionGranted: boolean | null;
  backgroundRecordingSupported: boolean | null;
  currentUserTrips: Trip[];
  logStep?: (step: string, details?: Record<string, unknown>) => void;
  missingRequired: unknown;
  permissionsReady: boolean;
  recordingDraft: RecordingDraftInput;
  recordingSession: RecordingSessionSummary;
  refreshStatus: () => Promise<{ backgroundLocationGranted: boolean }>;
  tripSegments: TripSegment[];
  trips: Trip[];
}

interface PauseRecordingControllerInput {
  activeTrip: Trip | null;
  backgroundRecordingSupported: boolean | null;
  recordingSession: RecordingSessionSummary;
  tripPauses: TripPause[];
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  trips: Trip[];
  waypoints: Waypoint[];
}

interface StopRecordingControllerInput {
  activeTrip: Trip | null;
  backgroundRecordingSupported: boolean | null;
  recordingSession: RecordingSessionSummary;
  tripPoints: TripPoint[];
  tripSegments: TripSegment[];
  trips: Trip[];
  waypoints: Waypoint[];
}

interface ResumePausedTripControllerInput {
  activeIdentitySession: AuthenticatedDeviceSession | null;
  backgroundLocationPermissionGranted: boolean | null;
  backgroundRecordingSupported: boolean | null;
  currentUserTrips: Trip[];
  recordingSession: RecordingSessionSummary;
  tripLocalId: string;
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
  trips: Trip[];
}

interface ContinueInterruptedRecordingControllerInput {
  backgroundLocationPermissionGranted: boolean | null;
  backgroundRecordingSupported: boolean | null;
  recordingSession: RecordingSessionSummary;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getEmptyRecordingDraft(): RecordingDraftInput {
  return {
    title: "",
    description: "",
    recordingMode: DEFAULT_RECORDING_PROFILE,
  };
}

export async function startRecordingFromScreenController(
  input: StartRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  const logStep = input.logStep ?? (() => undefined);

  if (!input.activeIdentitySession) {
    return { ok: false, reason: "no_identity" };
  }

  logStep("pressed", {
    backgroundLocationPermissionGranted: input.backgroundLocationPermissionGranted,
    backgroundRecordingSupported: input.backgroundRecordingSupported,
    recordingMode: input.recordingDraft.recordingMode,
  });

  if (isDemoSession(input.activeIdentitySession)) {
    const remainingTripSlots = getRemainingDemoTripSlots(
      input.currentUserTrips,
      input.activeIdentitySession.userId,
    );

    if (remainingTripSlots <= 0) {
      logStep("blocked-demo-limit", { remainingTripSlots });
      return {
        ok: false,
        reason: "demo_limit",
        message: `Demo mode allows up to ${DEMO_MONTHLY_TRIP_LIMIT} trips per calendar month.`,
      };
    }
  }

  if (input.currentUserTrips.some((trip) => trip.deletedAt === null && trip.status === "active")) {
    logStep("blocked-active-route");
    return {
      ok: false,
      reason: "active_route",
      message: "Pause or stop the current active route before starting a new one.",
    };
  }

  if (!input.permissionsReady) {
    logStep("blocked-permissions", {
      missingRequired: input.missingRequired ?? null,
    });
    void recordRecordingNativeEvent({
      eventType: "permission_missing",
      payload: {
        missingRequired: input.missingRequired ?? null,
      },
    });
    return { ok: false, reason: "missing_permissions" };
  }

  const startedAt = new Date().toISOString();
  const concreteRecordingProfile = getConcreteRecordingProfileForMode(input.recordingDraft.recordingMode);
  const batterySnapshot = await getBatterySnapshot();

  logStep("pre-create", { concreteRecordingProfile });
  const nextTrip = createTripForRecording(
    input.activeIdentitySession,
    startedAt,
    input.recordingDraft,
    batterySnapshot,
  );
  resetPendingTripPointContinuity(nextTrip.localId);
  resetTripPointDiagnostics(nextTrip.localId);
  setTripPointsInMemory([]);
  const nextSegment = createInitialTripSegment(nextTrip, startedAt);
  const nextSession = createRecordingSession(
    input.activeIdentitySession,
    nextTrip.localId,
    nextSegment.localId,
    startedAt,
    input.recordingDraft.recordingMode,
    concreteRecordingProfile,
  );

  try {
    await setTrips([...input.trips, nextTrip]);
    logStep("trip-written", { tripLocalId: nextTrip.localId });
    await setTripSegments([...input.tripSegments, nextSegment]);
    logStep("segment-written", { segmentLocalId: nextSegment.localId });
    await setRecordingSession(nextSession);
    logStep("session-written", { status: nextSession.status });

    try {
      const backgroundTrackingProfile = getBackgroundTrackingProfile(
        input.recordingDraft.recordingMode,
        concreteRecordingProfile,
      );

      await startBackgroundLocationTrackingWithRetry(backgroundTrackingProfile, (attempt, error) => {
        logStep("background-start-retry", {
          attempt,
          error: getErrorMessage(error),
        });
      }, nextTrip.localId);
      logStep("background-started", {
        backgroundTrackingProfile,
        concreteRecordingProfile,
      });
    } catch (error) {
      const refreshedPermissionStatus = await input.refreshStatus();
      logStep("background-start-failed", {
        refreshedBackgroundPermissionGranted: refreshedPermissionStatus.backgroundLocationGranted,
        error: getErrorMessage(error),
      });

      throw error;
    }

    if (input.recordingDraft.recordingMode === "auto") {
      void ensureMotionActivityUpdatesForAutoMode();
    }

    logStep("done", { tripLocalId: nextTrip.localId });
    return { ok: true, tripLocalId: nextTrip.localId };
  } catch {
    logStep("failed");
    await setTrips(input.trips);
    await setTripSegments(input.tripSegments);
    await setRecordingSession(input.recordingSession);
    return {
      ok: false,
      reason: "native_start_failed",
      message: "Trailbook could not start background trip recording on this device.",
    };
  }
}

export async function pauseRecordingFromScreenController(
  input: PauseRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  if (!input.activeTrip || !input.recordingSession.activeSegmentId) {
    return { ok: false, reason: "no_active_route" };
  }

  const pausedAt = new Date().toISOString();

  if (input.backgroundRecordingSupported !== false) {
    await stopBackgroundLocationTracking(input.activeTrip.localId);
  }
  await stopMotionActivityUpdates();
  resetPendingTripPointContinuity(input.activeTrip.localId);

  const nextState = createPausedRecordingState(
    input.activeTrip,
    input.recordingSession,
    input.tripSegments,
    input.tripPauses,
    pausedAt,
  );
  const normalizedState =
    input.recordingSession.recordingMode === "auto"
      ? normalizeAutoClosedTripSegment(
          nextState.tripSegments,
          input.tripPoints,
          input.waypoints,
          input.activeTrip.localId,
          pausedAt,
        )
      : {
          tripSegments: nextState.tripSegments,
          tripPoints: input.tripPoints,
          waypoints: input.waypoints,
        };

  await setTripSegments(normalizedState.tripSegments);
  await setWaypoints(normalizedState.waypoints);
  if (normalizedState.tripPoints !== input.tripPoints) {
    setTripPointsInMemory(normalizedState.tripPoints);
    await replaceTripPointsForTrip(input.activeTrip.localId, normalizedState.tripPoints);
  }
  await setTripPauses(nextState.tripPauses);
  await setTrips(pauseActiveTrip(input.trips, input.activeTrip.localId, pausedAt));
  await setRecordingSession(nextState.session);
  flushTripPointDiagnostics(input.activeTrip.localId);

  return { ok: true, tripLocalId: input.activeTrip.localId };
}

export async function stopRecordingFromScreenController(
  input: StopRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  if (!input.recordingSession.activeTripId || !input.recordingSession.activeSegmentId) {
    return { ok: false, reason: "no_active_route" };
  }

  const endedAt = new Date().toISOString();
  const batterySnapshot = await getBatterySnapshot();

  if (input.backgroundRecordingSupported !== false) {
    await stopBackgroundLocationTracking(input.recordingSession.activeTripId);
  }
  await stopMotionActivityUpdates();
  resetPendingTripPointContinuity(input.recordingSession.activeTripId);
  const closedTripSegments = finalizeEndedTripSegments(
    closeActiveTripSegment(input.tripSegments, input.recordingSession.activeSegmentId, endedAt),
    input.tripPoints,
    input.recordingSession.activeTripId,
    endedAt,
  );
  const normalizedState =
    input.recordingSession.recordingMode === "auto" && input.activeTrip
      ? normalizeAutoClosedTripSegment(
          closedTripSegments,
          input.tripPoints,
          input.waypoints,
          input.activeTrip.localId,
          endedAt,
        )
      : {
          tripSegments: closedTripSegments,
          tripPoints: input.tripPoints,
          waypoints: input.waypoints,
        };

  await setTripSegments(normalizedState.tripSegments);
  await setWaypoints(normalizedState.waypoints);
  if (input.activeTrip && normalizedState.tripPoints !== input.tripPoints) {
    setTripPointsInMemory(normalizedState.tripPoints);
    await replaceTripPointsForTrip(input.activeTrip.localId, normalizedState.tripPoints);
  }
  await setTrips(closeActiveTrip(input.trips, input.recordingSession.activeTripId, endedAt, batterySnapshot));
  await refreshTripStatsForTripLocalId(input.recordingSession.activeTripId);
  await setRecordingSession(stopRecordingSession(input.recordingSession));
  clearAutoRecordingSamples(input.recordingSession.activeTripId);
  flushTripPointDiagnostics(input.recordingSession.activeTripId);

  return { ok: true, tripLocalId: input.recordingSession.activeTripId };
}

export async function resumePausedTripFromScreenController(
  input: ResumePausedTripControllerInput,
): Promise<RecordingScreenActionResult> {
  if (!input.activeIdentitySession) {
    return { ok: false, reason: "no_identity" };
  }

  if (input.currentUserTrips.some((trip) => trip.deletedAt === null && trip.status === "active")) {
    return {
      ok: false,
      reason: "active_route",
      message: "Stop or pause the current active route before resuming another one.",
    };
  }

  const tripToResume = input.currentUserTrips.find(
    (trip) => trip.localId === input.tripLocalId && trip.status === "paused",
  );

  if (!tripToResume) {
    return {
      ok: false,
      reason: "paused_route_missing",
      message: "The selected paused route is no longer available.",
    };
  }

  const resumedAt = new Date().toISOString();
  const nextState = createResumedRecordingState(
    input.activeIdentitySession,
    tripToResume,
    input.tripSegments,
    input.tripPauses,
    resumedAt,
    input.recordingSession.recordingMode === "auto" ? "auto" : undefined,
  );

  await setTripSegments(nextState.tripSegments);
  await setTripPauses(nextState.tripPauses);
  setTripPointsInMemory(await loadTripPointsForTrip(tripToResume.localId));
  await setTrips(resumePausedTrip(input.trips, tripToResume.localId, resumedAt));
  await setRecordingSession(nextState.session);

  if (input.backgroundRecordingSupported === true && input.backgroundLocationPermissionGranted === true) {
    await startBackgroundLocationTracking(
      getBackgroundTrackingProfile(
        nextState.session.recordingMode,
        nextState.session.recordingProfile,
      ),
      tripToResume.localId,
    );
  }

  if (nextState.session.recordingMode === "auto") {
    await ensureMotionActivityUpdatesForAutoMode();
  }

  return { ok: true, tripLocalId: tripToResume.localId };
}

export async function continueInterruptedRecordingFromScreenController(
  input: ContinueInterruptedRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  const nextSession = continueInterruptedRecording(input.recordingSession);

  try {
    await setRecordingSession(nextSession);
    if (input.backgroundRecordingSupported === true && input.backgroundLocationPermissionGranted === true) {
      await startBackgroundLocationTracking(
        getBackgroundTrackingProfile(
          nextSession.recordingMode,
          nextSession.recordingProfile,
        ),
        nextSession.activeTripId,
      );
    }
    if (nextSession.recordingMode === "auto") {
      await ensureMotionActivityUpdatesForAutoMode();
    }
    return { ok: true, tripLocalId: nextSession.activeTripId ?? "" };
  } catch {
    await setRecordingSession(input.recordingSession);
    return {
      ok: false,
      reason: "native_start_failed",
      message: "Trailbook could not resume background trip recording on this device.",
    };
  }
}
