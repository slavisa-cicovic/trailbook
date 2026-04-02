import type { CurrentLocationSnapshot } from "../location/location.service";
import type { Trip, TripPoint } from "../../domain/trips";

const MIN_SEGMENT_DISTANCE_METERS = 5;

export function createTripPointForLocation(
  trip: Trip,
  location: CurrentLocationSnapshot,
): TripPoint {
  return {
    localId: `trip-point-${trip.localId}-${location.recordedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
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

export function appendTripPointIfUseful(tripPoints: TripPoint[], nextTripPoint: TripPoint): TripPoint[] {
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

  return [...tripPoints, nextTripPoint];
}

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
