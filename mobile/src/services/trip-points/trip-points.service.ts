import type { CurrentLocationSnapshot } from "../location/location.service";
import type { RecordingMode, Trip, TripPoint } from "../../domain/trips";

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

function getMaxAccuracyMeters(recordingMode: RecordingMode) {
  switch (recordingMode) {
    case "walk":
      return 35;
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
      return 8;
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
): TripPoint[] {
  const previousPoint = [...tripPoints]
    .reverse()
    .find((tripPoint) => tripPoint.tripLocalId === nextTripPoint.tripLocalId);

  if (previousPoint?.recordedAt === nextTripPoint.recordedAt) {
    return tripPoints;
  }

  if (
    previousPoint &&
    previousPoint.latitude === nextTripPoint.latitude &&
    previousPoint.longitude === nextTripPoint.longitude
  ) {
    return tripPoints;
  }

  if (
    nextTripPoint.accuracy !== null &&
    Number.isFinite(nextTripPoint.accuracy) &&
    nextTripPoint.accuracy > getMaxAccuracyMeters(recordingMode)
  ) {
    return tripPoints;
  }

  if (!previousPoint) {
    return [...tripPoints, nextTripPoint];
  }

  const distanceMeters = calculateDistanceBetweenPoints(previousPoint, nextTripPoint);

  if (distanceMeters < getMinMovementMeters(recordingMode)) {
    return tripPoints;
  }

  if (distanceMeters > getMaxJumpDistanceMeters(recordingMode)) {
    return tripPoints;
  }

  if (getImpliedSpeedKmh(previousPoint, nextTripPoint, distanceMeters) > getMaxImpliedSpeedKmh(recordingMode)) {
    return tripPoints;
  }

  return [...tripPoints, nextTripPoint];
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
