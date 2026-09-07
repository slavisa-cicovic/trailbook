import type { PhotoCoordinates } from './photoLocation';

export const PHOTO_LOCATION_MISMATCH_THRESHOLD_M = 250;
export const PHOTO_TIME_MISMATCH_THRESHOLD_MS = 15 * 60 * 1000;

export type VerificationState = 'match' | 'mismatch' | 'unavailable';

export interface PhotoVerificationResult {
  distanceM: number | null;
  location: VerificationState;
  severity: 'verified' | 'mismatch' | 'unavailable';
  time: VerificationState;
  timeDifferenceMs: number | null;
}

function photoDistanceM(left: PhotoCoordinates, right: PhotoCoordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function verifyPhotoMetadata(input: {
  capturedAt: Date | null;
  photoCoordinates: PhotoCoordinates | null;
  waypointCoordinates: PhotoCoordinates | null;
  waypointCreatedAt: Date | null;
}): PhotoVerificationResult {
  const distanceM = input.photoCoordinates && input.waypointCoordinates
    ? photoDistanceM(input.photoCoordinates, input.waypointCoordinates)
    : null;
  const timeDifferenceMs = input.capturedAt && input.waypointCreatedAt
    ? Math.abs(input.capturedAt.getTime() - input.waypointCreatedAt.getTime())
    : null;
  const location: VerificationState = distanceM === null
    ? 'unavailable'
    : distanceM <= PHOTO_LOCATION_MISMATCH_THRESHOLD_M ? 'match' : 'mismatch';
  const time: VerificationState = timeDifferenceMs === null
    ? 'unavailable'
    : timeDifferenceMs <= PHOTO_TIME_MISMATCH_THRESHOLD_MS ? 'match' : 'mismatch';

  return {
    distanceM,
    location,
    severity: location === 'mismatch' || time === 'mismatch'
      ? 'mismatch'
      : location === 'unavailable' || time === 'unavailable' ? 'unavailable' : 'verified',
    time,
    timeDifferenceMs,
  };
}
