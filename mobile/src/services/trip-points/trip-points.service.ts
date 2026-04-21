import { Platform } from "react-native";

import type { CurrentLocationSnapshot } from "../location/location.service";
import type { RecordingMode, Trip, TripPoint } from "../../domain/trips";
import {
  recordTripPointDiagnostic,
  type LocationCallbackSource,
} from "./trip-point-diagnostics.service";

const MIN_SEGMENT_DISTANCE_METERS = 5;

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

function getRouteSmoothingThresholds(recordingMode: RecordingMode): {
  maxDeviationMeters: number;
  maxDirectDistanceMeters: number;
  maxExcessMeters: number;
  maxNeighborDistanceMeters: number;
  spikeMaxAccuracyMeters: number;
  spikeMaxDirectDistanceMeters: number;
  spikeMinExcessMeters: number;
  spikeMinDeviationMeters: number;
} | null {
  switch (recordingMode) {
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

function getMaxAccuracyMeters(recordingMode: RecordingMode) {
  switch (recordingMode) {
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
    case "auto":
    default:
      return 45;
  }
}

function getMaxJumpDistanceMeters(recordingMode: RecordingMode) {
  switch (recordingMode) {
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
    case "auto":
    default:
      return 180;
  }
}

function getMaxImpliedSpeedKmh(recordingMode: RecordingMode) {
  switch (recordingMode) {
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
    case "auto":
    default:
      return 70;
  }
}

function getMinMovementMeters(recordingMode: RecordingMode) {
  switch (recordingMode) {
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
    case "auto":
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

export function appendTripPointIfUseful(
  tripPoints: TripPoint[],
  nextTripPoint: TripPoint,
  recordingMode: RecordingMode,
  callbackSource: LocationCallbackSource,
): TripPoint[] {
  const previousPoint = [...tripPoints]
    .reverse()
    .find((tripPoint) => tripPoint.tripLocalId === nextTripPoint.tripLocalId);

  if (previousPoint?.recordedAt === nextTripPoint.recordedAt) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "duplicate-timestamp", {
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
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "duplicate-coordinates", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (
    nextTripPoint.accuracy !== null &&
    Number.isFinite(nextTripPoint.accuracy) &&
    nextTripPoint.accuracy > getMaxAccuracyMeters(recordingMode)
  ) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "accuracy", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (!previousPoint) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "accepted", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return [...tripPoints, nextTripPoint];
  }

  const distanceMeters = calculateDistanceBetweenPoints(previousPoint, nextTripPoint);

  if (distanceMeters < getMinMovementMeters(recordingMode)) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "min-movement", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (distanceMeters > getMaxJumpDistanceMeters(recordingMode)) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "jump-distance", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  if (getImpliedSpeedKmh(previousPoint, nextTripPoint, distanceMeters) > getMaxImpliedSpeedKmh(recordingMode)) {
    recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "implied-speed", {
      recordedAt: nextTripPoint.recordedAt,
      source: callbackSource,
    });
    return tripPoints;
  }

  recordTripPointDiagnostic(nextTripPoint.tripLocalId, recordingMode, "accepted", {
    recordedAt: nextTripPoint.recordedAt,
    source: callbackSource,
  });
  return [...tripPoints, nextTripPoint];
}

export function smoothTripRoutePoints(
  tripPoints: TripPoint[],
  tripLocalId: string,
  recordingMode: RecordingMode,
  nextSyncStatus: TripPoint["syncStatus"],
): { removedPointCount: number; tripPoints: TripPoint[] } {
  const thresholds = getRouteSmoothingThresholds(recordingMode);

  if (!thresholds) {
    return {
      removedPointCount: 0,
      tripPoints,
    };
  }

  const orderedTripPoints = getVisibleTripPointsForTrip(tripPoints, tripLocalId);

  if (orderedTripPoints.length < 3) {
    return {
      removedPointCount: 0,
      tripPoints,
    };
  }

  let currentPoints = orderedTripPoints;
  let removedPointIds = new Set<string>();

  for (let pass = 0; pass < 2; pass += 1) {
    if (currentPoints.length < 3) {
      break;
    }

    const nextPoints = [currentPoints[0]];
    let removedThisPass = 0;

    for (let index = 1; index < currentPoints.length - 1; index += 1) {
      const left = nextPoints[nextPoints.length - 1];
      const middle = currentPoints[index];
      const right = currentPoints[index + 1];
      const leftToMiddle = calculateDistanceBetweenPoints(left, middle);
      const middleToRight = calculateDistanceBetweenPoints(middle, right);
      const leftToRight = calculateDistanceBetweenPoints(left, right);
      const deviationMeters = calculatePerpendicularDeviationMeters(left, middle, right);
      const excessMeters = leftToMiddle + middleToRight - leftToRight;
      const spikeLikePoint =
        (middle.accuracy === null || middle.accuracy <= thresholds.spikeMaxAccuracyMeters) &&
        leftToRight <= thresholds.spikeMaxDirectDistanceMeters &&
        excessMeters >= thresholds.spikeMinExcessMeters &&
        deviationMeters >= thresholds.spikeMinDeviationMeters;

      const canDropPoint =
        spikeLikePoint ||
        (leftToMiddle <= thresholds.maxNeighborDistanceMeters &&
          middleToRight <= thresholds.maxNeighborDistanceMeters &&
          leftToRight <= thresholds.maxDirectDistanceMeters &&
          deviationMeters <= thresholds.maxDeviationMeters &&
          excessMeters <= thresholds.maxExcessMeters);

      if (canDropPoint) {
        removedPointIds.add(middle.localId);
        removedThisPass += 1;
        continue;
      }

      nextPoints.push(middle);
    }

    nextPoints.push(currentPoints[currentPoints.length - 1]);
    currentPoints = nextPoints;

    if (removedThisPass === 0) {
      break;
    }
  }

  if (removedPointIds.size === 0) {
    return {
      removedPointCount: 0,
      tripPoints,
    };
  }

  return {
    removedPointCount: removedPointIds.size,
    tripPoints: tripPoints
      .filter((tripPoint) => !(tripPoint.tripLocalId === tripLocalId && removedPointIds.has(tripPoint.localId)))
      .map((tripPoint) =>
        tripPoint.tripLocalId === tripLocalId
          ? {
              ...tripPoint,
              syncStatus: nextSyncStatus,
            }
          : tripPoint,
      ),
  };
}

export function calculateTripDistanceMeters(tripPoints: TripPoint[]): number {
  if (tripPoints.length < 2) {
    return 0;
  }

  let totalDistanceMeters = 0;

  for (let index = 1; index < tripPoints.length; index += 1) {
    const segmentDistance = calculateDistanceBetweenPoints(tripPoints[index - 1], tripPoints[index]);

    if (segmentDistance >= MIN_SEGMENT_DISTANCE_METERS) {
      totalDistanceMeters += segmentDistance;
    }
  }

  return totalDistanceMeters;
}

export function formatDistanceKm(distanceMeters: number): string {
  const kilometers = distanceMeters / 1000;

  if (kilometers >= 10) {
    return `${kilometers.toFixed(1)} km`;
  }

  return `${kilometers.toFixed(2)} km`;
}

export {
  flushTripPointDiagnostics,
  getTripDiagnosticsForSync,
  isTripDiagnosticsEnabled,
  recordLocationCallback,
  recordTripPointDiagnostic,
  resetTripPointDiagnostics,
} from "./trip-point-diagnostics.service";
