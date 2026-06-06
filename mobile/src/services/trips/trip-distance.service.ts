import type { TripPoint } from "../../domain/trips";

const EARTH_RADIUS_METERS = 6371000;
const MIN_SEGMENT_DISTANCE_METERS = 5;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceBetweenPoints(left: TripPoint, right: TripPoint): number {
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

  return EARTH_RADIUS_METERS * arc;
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

