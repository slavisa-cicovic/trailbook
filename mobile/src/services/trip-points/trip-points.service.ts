import { Platform } from "react-native";

import type { CurrentLocationSnapshot } from "../location/location.service";
import type { RecordingProfile, Trip, TripPoint } from "../../domain/trips";
import { getRuntimePointFilterProfileConfig } from "../recording/recording-config.service";
import {
  recordTripPointDiagnostic,
  type LocationCallbackSource,
} from "./trip-point-diagnostics.service";

const LONG_GAP_THRESHOLD_MS = 5 * 60 * 1000;
const EARLY_SESSION_THRESHOLD_MS = 2 * 60 * 1000;

interface AppendTripPointContext {
  sessionStartedAt?: string | null;
  tripStartedAt?: string | null;
  lastSequentialTripPoint?: TripPoint | null;
}

interface PendingContinuityCandidate {
  anchorPoint: TripPoint;
  candidatePoint: TripPoint;
  callbackSource: LocationCallbackSource;
  recoveryAcceptanceReason: "accepted-early-session" | "accepted-after-resume" | null;
}

export interface RouteGapBreakCandidate {
  distanceMeters: number;
  elapsedMs: number;
  previousPoint: TripPoint;
}

const pendingContinuityByTripLocalId = new Map<string, PendingContinuityCandidate>();

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceBetweenPoints(left: TripPoint, right: TripPoint): number {
  const earthRadiusMeters = 6371000;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const latitudeLeft = toRadians(left.latitude);
  const latitudeRight = toRadians(right.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
    Math.cos(latitudeLeft) *
      Math.cos(latitudeRight) *
      Math.sin(deltaLongitude / 2) *
      Math.sin(deltaLongitude / 2);

  const arc = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return earthRadiusMeters * arc;
}

function projectRelativeMeters(
  origin: TripPoint,
  target: TripPoint,
): { x: number; y: number } {
  const earthRadiusMeters = 6371000;
  const latitudeLeft = toRadians(origin.latitude);
  const latitudeTarget = toRadians(target.latitude);
  const longitudeLeft = toRadians(origin.longitude);
  const longitudeTarget = toRadians(target.longitude);
  const averageLatitude = (latitudeLeft + latitudeTarget) / 2;

  return {
    x: (longitudeTarget - longitudeLeft) * Math.cos(averageLatitude) * earthRadiusMeters,
    y: (latitudeTarget - latitudeLeft) * earthRadiusMeters,
  };
}

function calculatePerpendicularDeviationMeters(
  left: TripPoint,
  middle: TripPoint,
  right: TripPoint,
): number {
  const middleProjection = projectRelativeMeters(left, middle);
  const rightProjection = projectRelativeMeters(left, right);
  const lineLengthSquared = rightProjection.x * rightProjection.x + rightProjection.y * rightProjection.y;

  if (lineLengthSquared <= 0) {
    return Math.sqrt(middleProjection.x * middleProjection.x + middleProjection.y * middleProjection.y);
  }

  const projectionFactor =
    (middleProjection.x * rightProjection.x + middleProjection.y * rightProjection.y) / lineLengthSquared;
  const clampedProjectionFactor = Math.max(0, Math.min(1, projectionFactor));
  const closestX = rightProjection.x * clampedProjectionFactor;
  const closestY = rightProjection.y * clampedProjectionFactor;
  const deviationX = middleProjection.x - closestX;
  const deviationY = middleProjection.y - closestY;

  return Math.sqrt(deviationX * deviationX + deviationY * deviationY);
}

function getRouteSmoothingThresholds(recordingProfile: RecordingProfile): {
  maxDeviationMeters: number;
  maxDirectDistanceMeters: number;
  maxExcessMeters: number;
  maxNeighborDistanceMeters: number;
  spikeMaxAccuracyMeters: number;
  spikeMaxDirectDistanceMeters: number;
  spikeMinExcessMeters: number;
  spikeMinDeviationMeters: number;
} | null {
  switch (recordingProfile) {
    case "walk":
      return {
        maxDeviationMeters: 8,
        maxDirectDistanceMeters: 55,
        maxExcessMeters: 16,
        maxNeighborDistanceMeters: 35,
        spikeMaxAccuracyMeters: 30,
        spikeMaxDirectDistanceMeters: 45,
        spikeMinExcessMeters: 28,
        spikeMinDeviationMeters: 14,
      };
    case "bike":
      return {
        maxDeviationMeters: 10,
        maxDirectDistanceMeters: 95,
        maxExcessMeters: 24,
        maxNeighborDistanceMeters: 60,
        spikeMaxAccuracyMeters: 30,
        spikeMaxDirectDistanceMeters: 50,
        spikeMinExcessMeters: 40,
        spikeMinDeviationMeters: 18,
      };
    default:
      return null;
  }
}

function getMaxAccuracyMeters(recordingProfile: RecordingProfile) {
  const runtimeConfig = getRuntimePointFilterProfileConfig(recordingProfile);

  if (runtimeConfig) {
    return runtimeConfig.maxAccuracyMeters;
  }

  switch (recordingProfile) {
    case "walk":
      return Platform.OS === "android" ? 50 : 35;
    case "bike":
      return 30;
    case "drive":
      return 80;
    case "boat":
      return 120;
    case "plane":
      return Number.POSITIVE_INFINITY;
    case "stationary":
      return Platform.OS === "android" ? 80 : 60;
    default:
      return 45;
  }
}

function getMaxJumpDistanceMeters(recordingProfile: RecordingProfile) {
  const runtimeConfig = getRuntimePointFilterProfileConfig(recordingProfile);

  if (runtimeConfig) {
    return runtimeConfig.maxJumpDistanceMeters;
  }

  switch (recordingProfile) {
    case "walk":
      return 120;
    case "bike":
      return 400;
    case "drive":
      return 2500;
    case "boat":
      return 5000;
    case "plane":
      return Number.POSITIVE_INFINITY;
    case "stationary":
      return 120;
    default:
      return 180;
  }
}

function getMaxImpliedSpeedKmh(recordingProfile: RecordingProfile) {
  const runtimeConfig = getRuntimePointFilterProfileConfig(recordingProfile);

  if (runtimeConfig) {
    return runtimeConfig.maxImpliedSpeedKmh;
  }

  switch (recordingProfile) {
    case "walk":
      return 12;
    case "bike":
      return 55;
    case "drive":
      return 180;
    case "boat":
      return 90;
    case "plane":
      return Number.POSITIVE_INFINITY;
    case "stationary":
      return 12;
    default:
      return 70;
  }
}

function getMinMovementMeters(recordingProfile: RecordingProfile) {
  const runtimeConfig = getRuntimePointFilterProfileConfig(recordingProfile);

  if (runtimeConfig) {
    return runtimeConfig.minMovementMeters;
  }

  switch (recordingProfile) {
    case "walk":
      return Platform.OS === "android" ? 4 : 8;
    case "bike":
      return 25;
    case "drive":
      return 30;
    case "boat":
      return 40;
    case "plane":
      return 150;
    case "stationary":
      return 35;
    default:
      return 10;
  }
}

function getImpliedSpeedKmh(previousPoint: TripPoint, nextTripPoint: TripPoint, distanceMeters: number) {
  const previousTimeMs = new Date(previousPoint.recordedAt).getTime();
  const nextTimeMs = new Date(nextTripPoint.recordedAt).getTime();
  const deltaSeconds = (nextTimeMs - previousTimeMs) / 1000;

  if (deltaSeconds <= 0 || Number.isNaN(deltaSeconds)) {
    return Number.POSITIVE_INFINITY;
  }

  return (distanceMeters / deltaSeconds) * 3.6;
}

function getImpliedSpeedAnchor(
  previousAccepted: TripPoint,
  lastSequential: TripPoint | null | undefined,
  nextTripPoint: TripPoint,
): TripPoint {
  if (!lastSequential) {
    return previousAccepted;
  }

  const lastSequentialMs = new Date(lastSequential.recordedAt).getTime();
  const previousAcceptedMs = new Date(previousAccepted.recordedAt).getTime();
  const nextMs = new Date(nextTripPoint.recordedAt).getTime();

  if (lastSequentialMs > previousAcceptedMs && lastSequentialMs < nextMs) {
    return lastSequential;
  }

  return previousAccepted;
}

function getElapsedMs(previousPoint: TripPoint, nextTripPoint: TripPoint): number {
  return new Date(nextTripPoint.recordedAt).getTime() - new Date(previousPoint.recordedAt).getTime();
}

function getElapsedMsFromTimestamp(startedAt: string | null | undefined, recordedAt: string): number {
  if (!startedAt) {
    return Number.NaN;
  }

  return new Date(recordedAt).getTime() - new Date(startedAt).getTime();
}

function isLongGap(previousPoint: TripPoint, nextTripPoint: TripPoint): boolean {
  const elapsedMs = getElapsedMs(previousPoint, nextTripPoint);

  return Number.isFinite(elapsedMs) && elapsedMs >= LONG_GAP_THRESHOLD_MS;
}

function isEarlySessionPoint(nextTripPoint: TripPoint, context?: AppendTripPointContext): boolean {
  const elapsedMs = getElapsedMsFromTimestamp(context?.sessionStartedAt ?? null, nextTripPoint.recordedAt);

  return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= EARLY_SESSION_THRESHOLD_MS;
}

function getRecoveryAcceptanceReason(
  nextTripPoint: TripPoint,
  context?: AppendTripPointContext,
): "accepted-early-session" | "accepted-after-resume" | null {
  if (!isEarlySessionPoint(nextTripPoint, context)) {
    return null;
  }

  if (
    context?.tripStartedAt &&
    context.sessionStartedAt &&
    context.tripStartedAt !== context.sessionStartedAt
  ) {
    return "accepted-after-resume";
  }

  return "accepted-early-session";
}

function shouldHoldAsPendingContinuity(
  previousPoint: TripPoint,
  nextTripPoint: TripPoint,
  recordingProfile: RecordingProfile,
  distanceMeters: number,
  impliedSpeedKmh: number,
  context?: AppendTripPointContext,
): boolean {
  const recoveryReason = getRecoveryAcceptanceReason(nextTripPoint, context);

  if (!recoveryReason) {
    return false;
  }

  const maxJumpDistanceMeters = getMaxJumpDistanceMeters(recordingProfile);
  const maxAccuracyMeters = getMaxAccuracyMeters(recordingProfile);
  const accuracyMeters =
    nextTripPoint.accuracy !== null && Number.isFinite(nextTripPoint.accuracy)
      ? nextTripPoint.accuracy
      : maxAccuracyMeters;

  if (
    !Number.isFinite(distanceMeters) ||
    !Number.isFinite(impliedSpeedKmh) ||
    distanceMeters < Math.min(maxJumpDistanceMeters * 0.6, 80) ||
    distanceMeters > maxJumpDistanceMeters ||
    impliedSpeedKmh > getMaxImpliedSpeedKmh(recordingProfile) * 0.75
  ) {
    return false;
  }

  return accuracyMeters >= maxAccuracyMeters * 0.45;
}

function shouldConfirmPendingContinuity(
  pendingCandidate: PendingContinuityCandidate,
  nextTripPoint: TripPoint,
  recordingProfile: RecordingProfile,
): boolean {
  const pendingToNextDistance = calculateDistanceBetweenPoints(
    pendingCandidate.candidatePoint,
    nextTripPoint,
  );
  const anchorToNextDistance = calculateDistanceBetweenPoints(
    pendingCandidate.anchorPoint,
    nextTripPoint,
  );
  const pendingDeviation = calculatePerpendicularDeviationMeters(
    pendingCandidate.anchorPoint,
    pendingCandidate.candidatePoint,
    nextTripPoint,
  );
  const pendingToNextSpeed = getImpliedSpeedKmh(
    pendingCandidate.candidatePoint,
    nextTripPoint,
    pendingToNextDistance,
  );

  if (
    pendingToNextDistance < getMinMovementMeters(recordingProfile) ||
    pendingToNextSpeed > getMaxImpliedSpeedKmh(recordingProfile) ||
    anchorToNextDistance > getMaxJumpDistanceMeters(recordingProfile)
  ) {
    return false;
  }

  return (
    pendingToNextDistance <= Math.max(getMinMovementMeters(recordingProfile) * 4, anchorToNextDistance * 0.85) &&
    pendingDeviation <= Math.max(18, anchorToNextDistance * 0.3)
  );
}

function maybeRollbackRecentSpike(
  tripPoints: TripPoint[],
  recordingProfile: RecordingProfile,
  callbackSource: LocationCallbackSource,
): TripPoint[] {
  const relevantTripPoints = tripPoints.filter(
    (tripPoint) => tripPoint.tripLocalId === tripPoints[tripPoints.length - 1]?.tripLocalId,
  );
  const thresholds = getRouteSmoothingThresholds(recordingProfile);

  if (!thresholds || relevantTripPoints.length < 3) {
    return tripPoints;
  }

  const left = relevantTripPoints[relevantTripPoints.length - 3];
  const middle = relevantTripPoints[relevantTripPoints.length - 2];
  const right = relevantTripPoints[relevantTripPoints.length - 1];
  const leftToMiddle = calculateDistanceBetweenPoints(left, middle);
  const middleToRight = calculateDistanceBetweenPoints(middle, right);
  const leftToRight = calculateDistanceBetweenPoints(left, right);
  const deviationMeters = calculatePerpendicularDeviationMeters(left, middle, right);
  const excessMeters = leftToMiddle + middleToRight - leftToRight;
  const accuracyMeters =
    middle.accuracy !== null && Number.isFinite(middle.accuracy)
      ? middle.accuracy
      : Number.POSITIVE_INFINITY;

  const spikeLikePoint =
    accuracyMeters <= thresholds.spikeMaxAccuracyMeters &&
    leftToRight <= thresholds.spikeMaxDirectDistanceMeters &&
    excessMeters >= thresholds.spikeMinExcessMeters &&
    deviationMeters >= thresholds.spikeMinDeviationMeters;

  if (!spikeLikePoint) {
    return tripPoints;
  }

  recordTripPointDiagnostic(middle.tripLocalId, recordingProfile, "removed-as-spike", {
    recordedAt: middle.recordedAt,
    source: callbackSource,
  });

  return tripPoints.filter((tripPoint) => tripPoint.localId !== middle.localId);
}

export function createTripPointForLocation(
  trip: Trip,
  segmentLocalId: string | null,
  location: CurrentLocationSnapshot,
): TripPoint {
  return {
    localId: `trip-point-${trip.localId}-${location.recordedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    segmentLocalId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    latitude: location.latitude,
    longitude: location.longitude,
    recordedAt: location.recordedAt,
    accuracy: location.accuracy,
    altitude: location.altitude,
    speed: location.speed,
    syncStatus: "local-only",
  };
}

export function getVisibleTripPointsForTrip(tripPoints: TripPoint[], tripLocalId: string): TripPoint[] {
  return tripPoints
    .filter((tripPoint) => tripPoint.tripLocalId === tripLocalId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
}

export function getRouteGapBreakCandidate(
  tripPoints: TripPoint[],
  nextTripPoint: TripPoint,
  recordingProfile: RecordingProfile,
): RouteGapBreakCandidate | null {
  const previousPoint = [...tripPoints]
    .reverse()
    .find((tripPoint) => tripPoint.tripLocalId === nextTripPoint.tripLocalId);

  if (!previousPoint || !isLongGap(previousPoint, nextTripPoint)) {
    return null;
  }

  const distanceMeters = calculateDistanceBetweenPoints(previousPoint, nextTripPoint);

  if (distanceMeters <= getMaxJumpDistanceMeters(recordingProfile)) {
    return null;
  }

  return {
    distanceMeters,
    elapsedMs: getElapsedMs(previousPoint, nextTripPoint),
    previousPoint,
  };
}

export function groupVisibleTripPointsByTripId(tripPoints: TripPoint[]): Map<string, TripPoint[]> {
  const groupedTripPoints = new Map<string, TripPoint[]>();

  for (const tripPoint of tripPoints) {
    const existingTripPoints = groupedTripPoints.get(tripPoint.tripLocalId);

    if (existingTripPoints) {
      existingTripPoints.push(tripPoint);
    } else {
      groupedTripPoints.set(tripPoint.tripLocalId, [tripPoint]);
    }
  }

  for (const groupedPoints of groupedTripPoints.values()) {
    groupedPoints.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  return groupedTripPoints;
}

export function appendTripPointIfUseful(
  tripPoints: TripPoint[],
  nextTripPoint: TripPoint,
  recordingProfile: RecordingProfile,
  callbackSource: LocationCallbackSource,
  context?: AppendTripPointContext,
): TripPoint[] {
  const pendingCandidate = pendingContinuityByTripLocalId.get(nextTripPoint.tripLocalId) ?? null;

  if (
    pendingCandidate &&
    new Date(nextTripPoint.recordedAt).getTime() > new Date(pendingCandidate.candidatePoint.recordedAt).getTime()
  ) {
    pendingContinuityByTripLocalId.delete(nextTripPoint.tripLocalId);

    if (shouldConfirmPendingContinuity(pendingCandidate, nextTripPoint, recordingProfile)) {
      recordTripPointDiagnostic(
        pendingCandidate.candidatePoint.tripLocalId,
        recordingProfile,
        "confirmed-pending-continuity",
        {
          recordedAt: pendingCandidate.candidatePoint.recordedAt,
          source: pendingCandidate.callbackSource,
        },
      );

      return appendTripPointIfUseful(
        [...tripPoints, pendingCandidate.candidatePoint],
        nextTripPoint,
        recordingProfile,
        callbackSource,
        context,
      );
    }

    recordTripPointDiagnostic(
      pendingCandidate.candidatePoint.tripLocalId,
      recordingProfile,
      "rejected-pending-continuity",
      {
        recordedAt: pendingCandidate.candidatePoint.recordedAt,
        source: pendingCandidate.callbackSource,
      },
    );
  }

  const previousPoint = [...tripPoints]
    .reverse()
    .find((tripPoint) => tripPoint.tripLocalId === nextTripPoint.tripLocalId);

  if (
    tripPoints.some(
      (tripPoint) =>
        tripPoint.tripLocalId === nextTripPoint.tripLocalId &&
        tripPoint.recordedAt === nextTripPoint.recordedAt,
    )
  ) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "duplicate-timestamp", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (
    previousPoint &&
    previousPoint.latitude === nextTripPoint.latitude &&
    previousPoint.longitude === nextTripPoint.longitude
  ) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "duplicate-coordinates", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (
    nextTripPoint.accuracy !== null &&
    Number.isFinite(nextTripPoint.accuracy) &&
    nextTripPoint.accuracy > getMaxAccuracyMeters(recordingProfile)
  ) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "accuracy", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (!previousPoint) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "accepted", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return [...tripPoints, nextTripPoint];
  }

  const distanceMeters = calculateDistanceBetweenPoints(previousPoint, nextTripPoint);

  if (distanceMeters < getMinMovementMeters(recordingProfile)) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "min-movement", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  const impliedSpeedAnchor = getImpliedSpeedAnchor(previousPoint, context?.lastSequentialTripPoint, nextTripPoint);
  const impliedSpeedDistance = impliedSpeedAnchor === previousPoint
    ? distanceMeters
    : calculateDistanceBetweenPoints(impliedSpeedAnchor, nextTripPoint);
  const impliedSpeedKmh = getImpliedSpeedKmh(impliedSpeedAnchor, nextTripPoint, impliedSpeedDistance);

  if (impliedSpeedKmh > getMaxImpliedSpeedKmh(recordingProfile)) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "implied-speed", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  const recoveryAcceptanceReason = getRecoveryAcceptanceReason(nextTripPoint, context);

  if (
    shouldHoldAsPendingContinuity(
      previousPoint,
      nextTripPoint,
      recordingProfile,
      distanceMeters,
      impliedSpeedKmh,
      context,
    )
  ) {
    pendingContinuityByTripLocalId.set(nextTripPoint.tripLocalId, {
      anchorPoint: previousPoint,
      candidatePoint: nextTripPoint,
      callbackSource,
      recoveryAcceptanceReason,
    });
    return tripPoints;
  }

  if (impliedSpeedDistance > getMaxJumpDistanceMeters(recordingProfile)) {
    if (isLongGap(impliedSpeedAnchor, nextTripPoint)) {
      recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "accepted-after-long-gap", {
        recordedAt: nextTripPoint.recordedAt,
        source: callbackSource,
      });
      return maybeRollbackRecentSpike([...tripPoints, nextTripPoint], recordingProfile, callbackSource);
    }

    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingProfile, "jump-distance", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  recordTripPointDiagnostic(
    nextTripPoint.tripLocalId,
    recordingProfile,
    recoveryAcceptanceReason ?? "accepted",
    {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    },
  );
  return maybeRollbackRecentSpike([...tripPoints, nextTripPoint], recordingProfile, callbackSource);
}

export function resetPendingTripPointContinuity(tripLocalId: string) {
  pendingContinuityByTripLocalId.delete(tripLocalId);
}

export function clearAllPendingTripPointContinuity() {
  pendingContinuityByTripLocalId.clear();
}

export function formatDistanceKm(distanceMeters: number): string {
  const kilometers = distanceMeters / 1000;

  if (kilometers >= 10) {
    return `${kilometers.toFixed(1)} km`;
  }

  return `${kilometers.toFixed(2)} km`;
}

export { calculateTripDistanceMeters } from "../trips/trip-distance.service";

export {
  flushTripPointDiagnostics,
  getLocationCallbackDiagnosticState,
  getTripDiagnosticsForSync,
  isTripDiagnosticsEnabled,
  recordLocationCallback,
  recordLocationSilentGap,
  recordTripPointDiagnostic,
  resetTripPointDiagnostics,
} from "./trip-point-diagnostics.service";
