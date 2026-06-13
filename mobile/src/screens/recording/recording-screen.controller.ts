import Constants from "expo-constants";
import { Platform } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { RecordingSessionSummary, Trip, TripPause, TripSegment, Waypoint } from "../../domain/trips";
import type { ActiveRecordingRouteModel } from "../../services/recording/active-recording-route-model";
import {
  DEMO_MONTHLY_TRIP_LIMIT,
  getRemainingDemoTripSlots,
  isDemoSession,
} from "../../services/demo/demo-mode.service";
import { getBatterySnapshot } from "../../services/device/battery.service";
import {
  getUnifiedAutoTrackingProfile,
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
  removeInitialAutoBootstrapWalkSegment,
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
  backgroundRecordingSupported: boolean | null;
  routeModel: ActiveRecordingRouteModel;
  tripPauses: TripPause[];
  tripSegments: TripSegment[];
  trips: Trip[];
  waypoints: Waypoint[];
}

interface StopRecordingControllerInput {
  backgroundRecordingSupported: boolean | null;
  routeModel: ActiveRecordingRouteModel;
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

function shouldUseIosExpoGoUiRecordingFallback() {
  return Platform.OS === "ios" && Constants.executionEnvironment === "storeClient";
}

export function getEmptyRecordingDraft(): RecordingDraftInput {
  return {
    title: "",
    description: "",
  };
}

export async function startRecordingFromScreenController(
  input: StartRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  const logStep = input.logStep ?? (() => undefined);

  if (!input.activeIdentitySession) {
    return { ok: false, reason: "no_identity" };
  }

  const recordingDraft = input.recordingDraft;

  logStep("pressed", {
    backgroundLocationPermissionGranted: input.backgroundLocationPermissionGranted,
    backgroundRecordingSupported: input.backgroundRecordingSupported,
    recordingMode: "auto",
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
  const concreteRecordingProfile = getUnifiedAutoTrackingProfile();
  const batterySnapshot = await getBatterySnapshot();

  logStep("pre-create", { concreteRecordingProfile });
  const nextTrip = createTripForRecording(
    input.activeIdentitySession,
    startedAt,
    recordingDraft,
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
      const backgroundTrackingProfile = getUnifiedAutoTrackingProfile();

      if (shouldUseIosExpoGoUiRecordingFallback()) {
        logStep("background-start-skipped-expo-go-ios-ui-preview", {
          backgroundTrackingProfile,
          concreteRecordingProfile,
        });
      } else {
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
      }
    } catch (error) {
      const refreshedPermissionStatus = await input.refreshStatus();
      logStep("background-start-failed", {
        refreshedBackgroundPermissionGranted: refreshedPermissionStatus.backgroundLocationGranted,
        error: getErrorMessage(error),
      });

      throw error;
    }

    void ensureMotionActivityUpdatesForAutoMode();

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
  const { activeTrip, activeTripPoints, session } = input.routeModel;

  if (!activeTrip || !session.activeSegmentId) {
    return { ok: false, reason: "no_active_route" };
  }

  const pausedAt = new Date().toISOString();

  if (input.backgroundRecordingSupported !== false) {
    await stopBackgroundLocationTracking(activeTrip.localId);
  }
  await stopMotionActivityUpdates();
  resetPendingTripPointContinuity(activeTrip.localId);

  const nextState = createPausedRecordingState(
    activeTrip,
    session,
    input.tripSegments,
    input.tripPauses,
    pausedAt,
  );
  const normalizedState = normalizeAutoClosedTripSegment(
    nextState.tripSegments,
    activeTripPoints,
    input.waypoints,
    activeTrip.localId,
    pausedAt,
  );

  await setTripSegments(normalizedState.tripSegments);
  await setWaypoints(normalizedState.waypoints);
  if (normalizedState.tripPoints !== activeTripPoints) {
    setTripPointsInMemory(normalizedState.tripPoints);
    await replaceTripPointsForTrip(activeTrip.localId, normalizedState.tripPoints);
  }
  await setTripPauses(nextState.tripPauses);
  await setTrips(pauseActiveTrip(input.trips, activeTrip.localId, pausedAt));
  await setRecordingSession(nextState.session);
  flushTripPointDiagnostics(activeTrip.localId);

  return { ok: true, tripLocalId: activeTrip.localId };
}

export async function stopRecordingFromScreenController(
  input: StopRecordingControllerInput,
): Promise<RecordingScreenActionResult> {
  const { activeTrip, activeTripPoints, session } = input.routeModel;

  if (!session.activeTripId || !session.activeSegmentId) {
    return { ok: false, reason: "no_active_route" };
  }

  const endedAt = new Date().toISOString();
  const batterySnapshot = await getBatterySnapshot();

  if (input.backgroundRecordingSupported !== false) {
    await stopBackgroundLocationTracking(session.activeTripId);
  }
  await stopMotionActivityUpdates();
  resetPendingTripPointContinuity(session.activeTripId);
  const closedTripSegments = finalizeEndedTripSegments(
    closeActiveTripSegment(input.tripSegments, session.activeSegmentId, endedAt),
    activeTripPoints,
    session.activeTripId,
    endedAt,
  );
  const normalizedState =
    activeTrip
      ? normalizeAutoClosedTripSegment(
          closedTripSegments,
          activeTripPoints,
          input.waypoints,
          activeTrip.localId,
          endedAt,
        )
      : {
          tripSegments: closedTripSegments,
          tripPoints: activeTripPoints,
          waypoints: input.waypoints,
        };
  const orderedNormalizedSegments = normalizedState.tripSegments
    .filter((segment) => segment.tripLocalId === session.activeTripId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const firstNonWalkSegment = orderedNormalizedSegments.find((segment, index) =>
    index > 0 && segment.recordingProfile !== "walk",
  );
  const prunedState =
    activeTrip && firstNonWalkSegment
      ? removeInitialAutoBootstrapWalkSegment(
          normalizedState.tripSegments,
          normalizedState.tripPoints,
          normalizedState.waypoints,
          activeTrip.localId,
          firstNonWalkSegment.localId,
          endedAt,
        )
      : normalizedState;

  await setTripSegments(prunedState.tripSegments);
  await setWaypoints(prunedState.waypoints);
  if (activeTrip && prunedState.tripPoints !== activeTripPoints) {
    setTripPointsInMemory(prunedState.tripPoints);
    await replaceTripPointsForTrip(activeTrip.localId, prunedState.tripPoints);
  }
  await setTrips(closeActiveTrip(input.trips, session.activeTripId, endedAt, batterySnapshot));
  await refreshTripStatsForTripLocalId(session.activeTripId);
  await setRecordingSession(stopRecordingSession(session));
  clearAutoRecordingSamples(session.activeTripId);
  flushTripPointDiagnostics(session.activeTripId);

  return { ok: true, tripLocalId: session.activeTripId };
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
  );

  await setTripSegments(nextState.tripSegments);
  await setTripPauses(nextState.tripPauses);
  setTripPointsInMemory(await loadTripPointsForTrip(tripToResume.localId));
  await setTrips(resumePausedTrip(input.trips, tripToResume.localId, resumedAt));
  await setRecordingSession(nextState.session);

  if (input.backgroundRecordingSupported === true && input.backgroundLocationPermissionGranted === true) {
    await startBackgroundLocationTracking(
      getUnifiedAutoTrackingProfile(),
      tripToResume.localId,
    );
  }

  await ensureMotionActivityUpdatesForAutoMode();

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
        getUnifiedAutoTrackingProfile(),
        nextSession.activeTripId,
      );
    }
    await ensureMotionActivityUpdatesForAutoMode();
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
