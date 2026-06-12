import * as Location from "expo-location";

import {
  getBackgroundTrackingProfile,
  restartBackgroundLocationTracking,
  toSnapshot,
  type CurrentLocationSnapshot,
} from "../location/location.service";
import { getLatestMotionActivityAsync } from "../motion/motion-activity.service";
import {
  appendTripPointIfUseful,
  createTripPointForLocation,
  getRouteGapBreakCandidate,
  recordLocationCallback,
  recordTripPointDiagnostic,
} from "../trip-points/trip-points.service";
import type { LocationCallbackSource } from "../trip-points/trip-point-diagnostics.service";
import {
  closeActiveTripSegment,
  getOpenTripSegmentForTrip,
  normalizeAutoClosedTripSegment,
  removeInitialAutoBootstrapWalkSegment,
  startNextTripSegment,
} from "../trip-segments/trip-segments.service";
import { setRecordingSession } from "../../state/recording-store";
import { setTripSegments } from "../../state/trip-segments-store";
import { mergeTripPoints } from "../../state/trip-points-store";
import { setWaypoints } from "../../state/waypoints-store";
import { loadRecordingSession } from "../../storage/recording-storage";
import { loadTripPointsForTrip } from "../../repositories/trip-points-repository";
import { loadTripSegments } from "../../repositories/trip-segments-repository";
import { loadTrips } from "../../repositories/trips-repository";
import { loadWaypoints } from "../../repositories/waypoints-repository";
import {
  applyAutoRecordingTransition,
  buildAutoBatchProfileSections,
  inferAutoRecordingProfile,
  recordAutoRecordingSample,
  type AutoBatchProfileSection,
} from "./auto-recording.service";
import { updateRecordingLastPoint, updateRecordingMotionActivity, updateRecordingSegment } from "./recording.service";
import { setBatchProcessing } from "../../state/batch-processing-store";
import {
  countDuplicateRecordedAtValues,
  getMaxRecordedAtGapMs,
  getTraceRecordedAtRange,
  type RecordingProcessingTrace,
} from "./recording-processing-trace.service";

const AUTO_REJECTED_RECOVERY_MAX_AGE_MS = 10 * 60 * 1000;
const AUTO_REJECTED_RECOVERY_MAX_COUNT = 120;
const BATCH_DETECTION_MIN_SNAPSHOT_COUNT = 5;
const BATCH_DETECTION_LAG_MS = 2 * 60 * 1000;
const rejectedAutoSnapshotsByTripLocalId = new Map<string, CurrentLocationSnapshot[]>();
const simulationLocationInjectionTripIds = new Set<string>();
let recordingPipelineWriteQueue: Promise<unknown> = Promise.resolve();

export interface PersistRecordedLocationOptions {
  origin?: "device" | "simulation";
  // AUTO transitions change Trailbook segments/filtering. Native tracking should stay stable unless explicitly requested.
  restartTrackingOnAutoTransition?: boolean;
}

export interface RecordingPipelineResult {
  acceptedPointCount: number;
  duplicateRecordedAtCount: number;
  processingTrace: RecordingProcessingTrace;
  recoveredPointCount: number;
  rejectedPointCount: number;
}

export function setSimulationLocationInjectionActive(tripLocalId: string, active: boolean) {
  if (active) {
    simulationLocationInjectionTripIds.add(tripLocalId);
  } else {
    simulationLocationInjectionTripIds.delete(tripLocalId);
  }
}

function getOldestRecordedAtMs(snapshots: CurrentLocationSnapshot[]): number {
  const recordedAtTimes = snapshots
    .map((snapshot) => new Date(snapshot.recordedAt).getTime())
    .filter(Number.isFinite);

  return recordedAtTimes.length === 0 ? NaN : Math.min(...recordedAtTimes);
}

function getRejectedAutoRecoverySnapshots(tripLocalId: string, recordedAt: string): CurrentLocationSnapshot[] {
  const recordedAtMs = new Date(recordedAt).getTime();
  const minRecordedAtMs = Number.isNaN(recordedAtMs)
    ? Number.NEGATIVE_INFINITY
    : recordedAtMs - AUTO_REJECTED_RECOVERY_MAX_AGE_MS;

  return (rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? []).filter(
    (snapshot) => new Date(snapshot.recordedAt).getTime() >= minRecordedAtMs,
  );
}

function rememberRejectedAutoSnapshot(tripLocalId: string, snapshot: CurrentLocationSnapshot) {
  const recordedAtMs = new Date(snapshot.recordedAt).getTime();

  if (Number.isNaN(recordedAtMs)) {
    return;
  }

  const minRecordedAtMs = recordedAtMs - AUTO_REJECTED_RECOVERY_MAX_AGE_MS;
  const existingSnapshots = rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? [];
  const nextSnapshots = [...existingSnapshots.filter((candidate) => candidate.recordedAt !== snapshot.recordedAt), snapshot]
    .filter((candidate) => new Date(candidate.recordedAt).getTime() >= minRecordedAtMs)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .slice(-AUTO_REJECTED_RECOVERY_MAX_COUNT);

  rejectedAutoSnapshotsByTripLocalId.set(tripLocalId, nextSnapshots);
}

function forgetRejectedAutoSnapshots(tripLocalId: string, snapshots: CurrentLocationSnapshot[]) {
  if (snapshots.length === 0) {
    return;
  }

  const removedRecordedAt = new Set(snapshots.map((snapshot) => snapshot.recordedAt));
  const nextSnapshots = (rejectedAutoSnapshotsByTripLocalId.get(tripLocalId) ?? []).filter(
    (snapshot) => !removedRecordedAt.has(snapshot.recordedAt),
  );

  if (nextSnapshots.length === 0) {
    rejectedAutoSnapshotsByTripLocalId.delete(tripLocalId);
  } else {
    rejectedAutoSnapshotsByTripLocalId.set(tripLocalId, nextSnapshots);
  }
}

async function persistRecordedLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
  options: PersistRecordedLocationOptions = {},
): Promise<RecordingPipelineResult> {
  const inputRecordedAtValues = snapshots.map((snapshot) => snapshot.recordedAt);
  const { firstRecordedAt, lastRecordedAt } = getTraceRecordedAtRange(inputRecordedAtValues);
  const processedAt = new Date().toISOString();
  const acceptedRecordedAtValues: string[] = [];
  let acceptedPointCount = 0;
  let duplicateRecordedAtCount = countDuplicateRecordedAtValues(inputRecordedAtValues);
  let rejectedPointCount = 0;
  let recoveredPointCount = 0;
  let tripLocalId: string | null = null;
  let previousProfile: RecordingProcessingTrace["previousProfile"] = null;
  let activeProfile: RecordingProcessingTrace["activeProfile"] = null;
  let inferredProfile: RecordingProcessingTrace["inferredProfile"] = null;
  let transitionAt: string | null = null;
  let transitionChanged = false;

  function buildPipelineResult(): RecordingPipelineResult {
    const processingTrace: RecordingProcessingTrace = {
      acceptedPointCount,
      activeProfile,
      batchId: null,
      callbackSource,
      duplicateRawEventCount: 0,
      duplicateRecordedAtCount,
      firstRecordedAt,
      inferredProfile,
      inputSnapshotCount: snapshots.length,
      lastRecordedAt,
      maxAcceptedGapMs: getMaxRecordedAtGapMs(acceptedRecordedAtValues),
      maxRawGapMs: getMaxRecordedAtGapMs(inputRecordedAtValues),
      origin: options.origin ?? "device",
      previousProfile,
      processingMode: "live",
      processedAt,
      rawInsertedCount: 0,
      recoveredPointCount,
      rejectedPointCount,
      rejectedRawEventCount: 0,
      sortedSnapshotCount: snapshots.length,
      transitionAt,
      transitionChanged,
      tripLocalId,
    };

    return {
      acceptedPointCount,
      duplicateRecordedAtCount,
      processingTrace,
      recoveredPointCount,
      rejectedPointCount,
    };
  }

  // Detect batch synchronously BEFORE the first await so the UI overlay
  // is guaranteed to appear before any user interaction can happen.
  const oldestRecordedAtMs = getOldestRecordedAtMs(snapshots);
  const isBatch =
    snapshots.length >= BATCH_DETECTION_MIN_SNAPSHOT_COUNT &&
    Number.isFinite(oldestRecordedAtMs) &&
    Date.now() - oldestRecordedAtMs >= BATCH_DETECTION_LAG_MS;

  if (isBatch) {
    setBatchProcessing(true);
  }

  try {
  const restartTrackingOnAutoTransition = options.restartTrackingOnAutoTransition ?? false;
  const recordingSession = await loadRecordingSession();

  if (
    !recordingSession ||
    recordingSession.status !== "recording" ||
    !recordingSession.activeTripId
  ) {
    return buildPipelineResult();
  }

  const initialRecordingSession = recordingSession;
  const locationOrigin = options.origin ?? "device";
  tripLocalId = recordingSession.activeTripId;
  previousProfile = recordingSession.recordingProfile;
  activeProfile = recordingSession.recordingProfile;

  if (
    locationOrigin === "device" &&
    simulationLocationInjectionTripIds.has(recordingSession.activeTripId)
  ) {
    return buildPipelineResult();
  }

  const trips = await loadTrips();
  const activeTrip =
    trips.find(
      (trip) =>
        trip.localId === recordingSession.activeTripId &&
        trip.deletedAt === null &&
        trip.status === "active" &&
        trip.endedAt === null,
    ) ?? null;

  if (!activeTrip) {
    return buildPipelineResult();
  }

  const recordingTrip = activeTrip;
  const tripSegments = await loadTripSegments();
  let nextTripPoints = await loadTripPointsForTrip(recordingTrip.localId);
  const waypoints = await loadWaypoints();
  let nextWaypoints = waypoints;
  let nextTripSegments = tripSegments;
  let pointsChanged = false;
  let lastRecordedAt = recordingSession.lastPointRecordedAt;
  let nextRecordingSession = recordingSession;
  let lastSequentialTripPoint: ReturnType<typeof createTripPointForLocation> | null = null;
  const initialOpenSegment =
    tripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ??
    getOpenTripSegmentForTrip(tripSegments, recordingTrip.localId);

  previousProfile = initialOpenSegment?.recordingProfile ?? recordingSession.recordingProfile;
  activeProfile = previousProfile;

  function appendSnapshotIfUseful(snapshot: CurrentLocationSnapshot): boolean {
    const fallbackOpenSegment = getOpenTripSegmentForTrip(nextTripSegments, recordingTrip.localId);
    const activeSegmentLocalId = ensureRouteGapSegment(
      snapshot,
      nextRecordingSession.recordingProfile,
      nextRecordingSession.activeSegmentId ?? fallbackOpenSegment?.localId ?? null,
    );
    const candidateTripPoint = createTripPointForLocation(recordingTrip, activeSegmentLocalId, snapshot);
    const appendedTripPoints = appendTripPointIfUseful(
      nextTripPoints,
      candidateTripPoint,
      nextRecordingSession.recordingProfile,
      callbackSource,
      {
        sessionStartedAt: nextRecordingSession.startedAt,
        tripStartedAt: recordingTrip.startedAt,
        lastSequentialTripPoint,
      },
    );
    const pointsWereAppended = appendedTripPoints !== nextTripPoints;

    lastSequentialTripPoint = candidateTripPoint;

    if (pointsWereAppended) {
      nextTripPoints = appendedTripPoints;
      pointsChanged = true;
      nextRecordingSession = updateRecordingLastPoint(nextRecordingSession, snapshot.recordedAt);
      acceptedPointCount += 1;
      acceptedRecordedAtValues.push(snapshot.recordedAt);
    }

    return pointsWereAppended;
  }

  function appendBatchSnapshotIfUseful(
    snapshot: CurrentLocationSnapshot,
    recordingProfile: AutoBatchProfileSection["profile"],
    segmentLocalId: string | null,
  ): boolean {
    const activeSegmentLocalId = ensureRouteGapSegment(snapshot, recordingProfile, segmentLocalId);
    const candidateTripPoint = createTripPointForLocation(recordingTrip, activeSegmentLocalId, snapshot);
    const appendedTripPoints = appendTripPointIfUseful(
      nextTripPoints,
      candidateTripPoint,
      recordingProfile,
      callbackSource,
      {
        sessionStartedAt: nextRecordingSession.startedAt,
        tripStartedAt: recordingTrip.startedAt,
        lastSequentialTripPoint,
      },
    );
    const pointsWereAppended = appendedTripPoints !== nextTripPoints;

    lastSequentialTripPoint = candidateTripPoint;

    if (pointsWereAppended) {
      nextTripPoints = appendedTripPoints;
      pointsChanged = true;
      nextRecordingSession = updateRecordingLastPoint(nextRecordingSession, snapshot.recordedAt);
      acceptedPointCount += 1;
      acceptedRecordedAtValues.push(snapshot.recordedAt);
    }

    return pointsWereAppended;
  }

  function getClampedTransitionAt(activeSegmentStartedAt: string, requestedTransitionAt: string): string {
    const activeSegmentStartedAtMs = new Date(activeSegmentStartedAt).getTime();
    const requestedTransitionAtMs = new Date(requestedTransitionAt).getTime();

    if (
      Number.isFinite(activeSegmentStartedAtMs) &&
      Number.isFinite(requestedTransitionAtMs) &&
      requestedTransitionAtMs < activeSegmentStartedAtMs
    ) {
      return activeSegmentStartedAt;
    }

    return requestedTransitionAt;
  }

  function ensureBatchSectionSegment(section: AutoBatchProfileSection): string | null {
    const activeSegment =
      nextTripSegments.find((segment) => segment.localId === nextRecordingSession.activeSegmentId) ??
      getOpenTripSegmentForTrip(nextTripSegments, recordingTrip.localId);

    if (!activeSegment) {
      return null;
    }

    if (activeSegment.recordingProfile === section.profile) {
      activeProfile = activeSegment.recordingProfile;
      return activeSegment.localId;
    }

    const nextTransitionAt = getClampedTransitionAt(activeSegment.startedAt, section.startedAt);
    transitionChanged = true;
    transitionAt = transitionAt ?? nextTransitionAt;
    inferredProfile = section.profile;
    activeProfile = section.profile;

    const closedSegments = closeActiveTripSegment(nextTripSegments, activeSegment.localId, nextTransitionAt);
    const { nextSegment, tripSegments: stagedTripSegments } = startNextTripSegment(
      recordingTrip,
      closedSegments,
      section.profile,
      nextTransitionAt,
    );
    const normalizedState = normalizeAutoClosedTripSegment(
      stagedTripSegments,
      nextTripPoints,
      nextWaypoints,
      recordingTrip.localId,
      nextTransitionAt,
    );
    const prunedState = removeInitialAutoBootstrapWalkSegment(
      normalizedState.tripSegments,
      normalizedState.tripPoints,
      normalizedState.waypoints,
      recordingTrip.localId,
      nextSegment.localId,
      nextTransitionAt,
    );

    if (prunedState.tripPoints !== nextTripPoints) {
      nextTripPoints = prunedState.tripPoints;
      pointsChanged = true;
    }

    nextTripSegments = prunedState.tripSegments;
    nextWaypoints = prunedState.waypoints;
    nextRecordingSession = updateRecordingSegment(nextRecordingSession, nextSegment.localId, section.profile);

    return nextSegment.localId;
  }

  function ensureRouteGapSegment(
    snapshot: CurrentLocationSnapshot,
    recordingProfile: AutoBatchProfileSection["profile"],
    preferredSegmentLocalId: string | null,
  ): string | null {
    const candidateTripPoint = createTripPointForLocation(recordingTrip, preferredSegmentLocalId, snapshot);
    const routeGap = getRouteGapBreakCandidate(nextTripPoints, candidateTripPoint, recordingProfile);

    if (!routeGap) {
      return preferredSegmentLocalId;
    }

    const segmentToClose =
      (routeGap.previousPoint.segmentLocalId
        ? nextTripSegments.find((segment) => segment.localId === routeGap.previousPoint.segmentLocalId)
        : null) ??
      (preferredSegmentLocalId
        ? nextTripSegments.find((segment) => segment.localId === preferredSegmentLocalId)
        : null) ??
      getOpenTripSegmentForTrip(nextTripSegments, recordingTrip.localId);

    if (!segmentToClose || segmentToClose.endedAt !== null) {
      return preferredSegmentLocalId;
    }

    const closedSegments = closeActiveTripSegment(
      nextTripSegments,
      segmentToClose.localId,
      routeGap.previousPoint.recordedAt,
    );
    const { nextSegment, tripSegments: stagedTripSegments } = startNextTripSegment(
      recordingTrip,
      closedSegments,
      recordingProfile,
      snapshot.recordedAt,
    );

    nextTripSegments = stagedTripSegments;
    nextRecordingSession = updateRecordingSegment(nextRecordingSession, nextSegment.localId, recordingProfile);
    activeProfile = recordingProfile;

    return nextSegment.localId;
  }

  async function processAutoBatchSnapshots(): Promise<boolean> {
    if (nextRecordingSession.recordingMode !== "auto" || !isBatch) {
      return false;
    }

    const sortedSnapshots = [...snapshots].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1] ?? null;

    if (!lastSnapshot) {
      return false;
    }

    for (const snapshot of sortedSnapshots) {
      recordAutoRecordingSample(recordingTrip.localId, snapshot);
    }

    const batchMotionActivity = await getLatestMotionActivityAsync(lastSnapshot.recordedAt);
    nextRecordingSession = updateRecordingMotionActivity(nextRecordingSession, batchMotionActivity);

    const sections = buildAutoBatchProfileSections(sortedSnapshots, nextRecordingSession.recordingProfile);

    if (sections.length === 0) {
      return false;
    }

    inferredProfile = sections.find((section) => section.profile !== nextRecordingSession.recordingProfile)?.profile
      ?? sections[sections.length - 1]?.profile
      ?? inferredProfile;

    for (const section of sections) {
      const segmentLocalId = ensureBatchSectionSegment(section);

      for (const snapshot of section.samples) {
        recordLocationCallback(recordingTrip.localId, section.profile, callbackSource, snapshot);

        if (lastRecordedAt === snapshot.recordedAt) {
          recordTripPointDiagnostic(recordingTrip.localId, section.profile, "session-duplicate-recorded-at", {
            recordedAt: snapshot.recordedAt,
            source: callbackSource,
          });
          duplicateRecordedAtCount += 1;
          continue;
        }

        if (!appendBatchSnapshotIfUseful(snapshot, section.profile, segmentLocalId)) {
          rejectedPointCount += 1;
        }
        lastRecordedAt = snapshot.recordedAt;
      }
    }

    return true;
  }

  async function writePendingChanges(): Promise<void> {
    const writes: Promise<void>[] = [];

    if (pointsChanged) {
      writes.push(mergeTripPoints(nextTripPoints));
    }

    if (nextTripSegments !== tripSegments) {
      writes.push(setTripSegments(nextTripSegments));
    }

    if (nextWaypoints !== waypoints) {
      writes.push(setWaypoints(nextWaypoints));
    }

    if (
      (lastRecordedAt && lastRecordedAt !== initialRecordingSession.lastPointRecordedAt) ||
      nextRecordingSession.activeSegmentId !== initialRecordingSession.activeSegmentId ||
      nextRecordingSession.autoCandidateProfile !== initialRecordingSession.autoCandidateProfile ||
      nextRecordingSession.autoCandidateSince !== initialRecordingSession.autoCandidateSince ||
      nextRecordingSession.recordingProfile !== initialRecordingSession.recordingProfile ||
      nextRecordingSession.motionActivityType !== initialRecordingSession.motionActivityType ||
      nextRecordingSession.motionActivityConfidence !== initialRecordingSession.motionActivityConfidence ||
      nextRecordingSession.motionActivityRecordedAt !== initialRecordingSession.motionActivityRecordedAt ||
      nextRecordingSession.motionActivitySourcePlatform !== initialRecordingSession.motionActivitySourcePlatform
    ) {
      writes.push(setRecordingSession(nextRecordingSession));
    }

    if (writes.length > 0) {
      await Promise.all(writes);
    }
  }

  if (await processAutoBatchSnapshots()) {
    await writePendingChanges();
    activeProfile = nextRecordingSession.recordingProfile;
    return buildPipelineResult();
  }

  for (const snapshot of snapshots) {
    recordLocationCallback(recordingTrip.localId, nextRecordingSession.recordingProfile, callbackSource, snapshot);
    const rawAutoSamples =
      nextRecordingSession.recordingMode === "auto"
        ? recordAutoRecordingSample(recordingTrip.localId, snapshot)
        : null;

    if (lastRecordedAt === snapshot.recordedAt) {
      recordTripPointDiagnostic(
        recordingTrip.localId,
        nextRecordingSession.recordingProfile,
        "session-duplicate-recorded-at",
        {
          recordedAt: snapshot.recordedAt,
          source: callbackSource,
        },
      );
      duplicateRecordedAtCount += 1;
      continue;
    }

    if (nextRecordingSession.recordingMode === "auto") {
      const motionActivity = await getLatestMotionActivityAsync(snapshot.recordedAt);

      nextRecordingSession = updateRecordingMotionActivity(nextRecordingSession, motionActivity);
      inferredProfile = inferAutoRecordingProfile(rawAutoSamples ?? [], motionActivity) ?? inferredProfile;
      const autoTransition = applyAutoRecordingTransition(
        nextRecordingSession,
        recordingTrip,
        nextTripSegments,
        nextTripPoints,
        nextWaypoints,
        snapshot.recordedAt,
        motionActivity,
        rawAutoSamples,
      );

      nextRecordingSession = autoTransition.session;
      if (autoTransition.tripPoints !== nextTripPoints) {
        nextTripPoints = autoTransition.tripPoints;
        pointsChanged = true;
      }
      nextTripSegments = autoTransition.tripSegments;
      nextWaypoints = autoTransition.waypoints;

      if (autoTransition.changed) {
        transitionChanged = true;
        transitionAt = transitionAt ?? snapshot.recordedAt;
        activeProfile = nextRecordingSession.recordingProfile;

        if (restartTrackingOnAutoTransition) {
          await restartBackgroundLocationTracking(
            getBackgroundTrackingProfile(nextRecordingSession.recordingMode, nextRecordingSession.recordingProfile),
          );
        }

        const recoverySnapshots = getRejectedAutoRecoverySnapshots(recordingTrip.localId, snapshot.recordedAt);
        const snapshotsToReevaluate = lastRecordedAt === snapshot.recordedAt
          ? recoverySnapshots
          : [...recoverySnapshots, snapshot];
        const acceptedRecoverySnapshots: CurrentLocationSnapshot[] = [];

        for (const recoverySnapshot of snapshotsToReevaluate) {
          if (appendSnapshotIfUseful(recoverySnapshot)) {
            acceptedRecoverySnapshots.push(recoverySnapshot);
            recoveredPointCount += 1;
          } else {
            rejectedPointCount += 1;
          }
        }

        forgetRejectedAutoSnapshots(recordingTrip.localId, acceptedRecoverySnapshots);
        lastRecordedAt = snapshot.recordedAt;
        continue;
      }
    }

    if (lastRecordedAt !== snapshot.recordedAt) {
      const pointsWereAppended = appendSnapshotIfUseful(snapshot);

      if (!pointsWereAppended) {
        rejectedPointCount += 1;

        if (nextRecordingSession.recordingMode === "auto") {
          rememberRejectedAutoSnapshot(recordingTrip.localId, snapshot);
        }
      }
    }

    lastRecordedAt = snapshot.recordedAt;
  }

  await writePendingChanges();
  activeProfile = nextRecordingSession.recordingProfile;
  return buildPipelineResult();
  } finally {
    if (isBatch) {
      setBatchProcessing(false);
    }
  }
}

export function processRecordedLocationSnapshots(
  snapshots: CurrentLocationSnapshot[],
  callbackSource: LocationCallbackSource,
  options: PersistRecordedLocationOptions = {},
): Promise<RecordingPipelineResult> {
  const nextWrite = recordingPipelineWriteQueue
    .catch(() => undefined)
    .then(() => persistRecordedLocationSnapshots(snapshots, callbackSource, options));

  recordingPipelineWriteQueue = nextWrite;
  return nextWrite;
}

export function persistBackgroundRecordedLocations(
  locations: Location.LocationObject[],
  options: PersistRecordedLocationOptions = {},
): Promise<void> {
  return processRecordedLocationSnapshots(locations.map(toSnapshot), "background", options).then(() => undefined);
}

export function clearRecordingPipelineState(): void {
  rejectedAutoSnapshotsByTripLocalId.clear();
  simulationLocationInjectionTripIds.clear();
}
