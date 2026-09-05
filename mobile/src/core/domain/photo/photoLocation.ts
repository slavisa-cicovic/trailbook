import * as Location from 'expo-location';
import type { ImagePickerAsset } from 'expo-image-picker';

export interface PhotoCoordinates {
  latitude: number;
  longitude: number;
}

export const PHOTO_LOCATION_MISMATCH_THRESHOLD_M = 250;

function finiteCoordinate(value: unknown): number | null {
  if (typeof value === 'string' && value.includes('/')) {
    const [numerator, denominator] = value.trim().split('/').map(Number);
    return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
      ? numerator / denominator
      : null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function dmsCoordinate(value: unknown): number | null {
  if (typeof value === 'string' && value.includes(',')) {
    return dmsCoordinate(value.split(',').map((part) => part.trim()));
  }
  if (Array.isArray(value) && value.length >= 3) {
    const degrees = finiteCoordinate(value[0]);
    const minutes = finiteCoordinate(value[1]);
    const seconds = finiteCoordinate(value[2]);
    return degrees === null || minutes === null || seconds === null
      ? null
      : degrees + minutes / 60 + seconds / 3600;
  }
  return finiteCoordinate(value);
}

export function coordinatesFromImageAsset(asset: ImagePickerAsset): PhotoCoordinates | null {
  const exif = asset.exif as Record<string, unknown> | null | undefined;
  if (!exif) return null;
  const latitude = dmsCoordinate(exif.GPSLatitude ?? exif.latitude ?? exif.Latitude);
  const longitude = dmsCoordinate(exif.GPSLongitude ?? exif.longitude ?? exif.Longitude);
  if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  const latitudeRef = String(exif.GPSLatitudeRef ?? '').toUpperCase();
  const longitudeRef = String(exif.GPSLongitudeRef ?? '').toUpperCase();
  return {
    latitude: latitudeRef === 'S' ? -Math.abs(latitude) : latitude,
    longitude: longitudeRef === 'W' ? -Math.abs(longitude) : longitude,
  };
}

export function capturedAtFromImageAsset(asset: ImagePickerAsset): Date | null {
  const exif = asset.exif as Record<string, unknown> | null | undefined;
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  if (typeof raw === 'number') {
    const date = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const normalized = raw.trim().replace(
    /^(\d{4}):(\d{2}):(\d{2})[ T]/,
    '$1-$2-$3T',
  );
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function currentPhotoCoordinates(): Promise<PhotoCoordinates | null> {
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}

export function photoDistanceM(left: PhotoCoordinates, right: PhotoCoordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude);
  const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function mismatchedPhotoDistanceM(
  photo: PhotoCoordinates | null,
  waypoint: PhotoCoordinates | null,
): number | null {
  if (!photo || !waypoint) return null;
  const distance = photoDistanceM(photo, waypoint);
  return distance > PHOTO_LOCATION_MISMATCH_THRESHOLD_M ? distance : null;
}

export function photoLocationMatchesWaypoint(
  photo: PhotoCoordinates | null,
  waypoint: PhotoCoordinates,
): boolean {
  return photo !== null && photoDistanceM(photo, waypoint) <= PHOTO_LOCATION_MISMATCH_THRESHOLD_M;
}
