import type { DisplayRoutePoint } from '../model/displayRoutePoint';
import type { RawLocationSample } from '../model/rawSamples';
import type { Segment } from '../model/segment';
import type { GeoPoint } from './types';
import { cleanLocations, distanceM, splitLocationsOnRouteGaps } from './locationCleaner';

export const MAX_DISPLAY_ROUTE_POINTS = 2_500;
const METERS_PER_DEGREE_LATITUDE = 111_320;

type SmoothableSegmentType = 'WALK' | 'BIKE';

const SPIKE_FILTER_BY_SEGMENT: Record<
  SmoothableSegmentType,
  {
    contextPoints: number;
    directMaxM: number;
    lateralMinM: number;
    excessMinM: number;
    detourRatio: number;
  }
> = {
  WALK: {
    contextPoints: 3,
    directMaxM: 120,
    lateralMinM: 5,
    excessMinM: 8,
    detourRatio: 1.35,
  },
  BIKE: {
    contextPoints: 4,
    directMaxM: 220,
    lateralMinM: 12,
    excessMinM: 20,
    detourRatio: 1.45,
  },
};

function thinLocationsForDisplay(locations: GeoPoint[]) {
  if (locations.length <= MAX_DISPLAY_ROUTE_POINTS) return locations;

  const step = Math.ceil(locations.length / MAX_DISPLAY_ROUTE_POINTS);
  return locations.filter(
    (_location, index) => index === 0 || index === locations.length - 1 || index % step === 0,
  );
}

function segmentForTimestamp(segments: Segment[], timestamp: Date): Segment | undefined {
  let match: Segment | undefined;
  for (const segment of segments) {
    if (
      timestamp >= segment.startedAt &&
      timestamp <= segment.endedAt &&
      (!match || segment.startedAt > match.startedAt)
    ) {
      match = segment;
    }
  }
  return match;
}

function getMetersPerDegreeLongitude(latitude: number) {
  return METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
}

function getLocalMeters(
  coordinate: { latitude: number; longitude: number },
  origin: { latitude: number; longitude: number },
) {
  return {
    x: (coordinate.longitude - origin.longitude) * getMetersPerDegreeLongitude(origin.latitude),
    y: (coordinate.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getDistanceToSegmentMeters(
  target: { latitude: number; longitude: number },
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
) {
  const startMeters = getLocalMeters(start, target);
  const endMeters = getLocalMeters(end, target);
  const dx = endMeters.x - startMeters.x;
  const dy = endMeters.y - startMeters.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return Math.hypot(startMeters.x, startMeters.y);
  }

  const t = clamp(-(startMeters.x * dx + startMeters.y * dy) / segmentLengthSquared, 0, 1);
  const projection = {
    x: startMeters.x + t * dx,
    y: startMeters.y + t * dy,
  };

  return Math.hypot(projection.x, projection.y);
}

function isSmoothableSegmentType(segmentType: string): segmentType is SmoothableSegmentType {
  return segmentType === 'WALK' || segmentType === 'BIKE';
}

function shouldDropSegmentSpike(
  previous: GeoPoint,
  point: GeoPoint,
  next: GeoPoint,
  options: (typeof SPIKE_FILTER_BY_SEGMENT)[SmoothableSegmentType],
) {
  const directDistanceM = distanceM(
    previous.latitude,
    previous.longitude,
    next.latitude,
    next.longitude,
  );
  const previousDistanceM = distanceM(
    previous.latitude,
    previous.longitude,
    point.latitude,
    point.longitude,
  );
  const nextDistanceM = distanceM(
    point.latitude,
    point.longitude,
    next.latitude,
    next.longitude,
  );
  const detourDistanceM = previousDistanceM + nextDistanceM;
  const excessDistanceM = detourDistanceM - directDistanceM;
  const lateralDistanceM = getDistanceToSegmentMeters(point, previous, next);

  return (
    directDistanceM <= options.directMaxM &&
    lateralDistanceM >= options.lateralMinM &&
    excessDistanceM >= options.excessMinM &&
    detourDistanceM >= directDistanceM * options.detourRatio
  );
}

function shouldDropSegmentSpikeInContext(
  locations: GeoPoint[],
  index: number,
  segments: Segment[],
) {
  const point = locations[index];
  const segment = segmentForTimestamp(segments, point.timestamp);
  if (!segment || !isSmoothableSegmentType(segment.segmentType)) return false;

  const options = SPIKE_FILTER_BY_SEGMENT[segment.segmentType];
  const startIndex = Math.max(0, index - options.contextPoints);
  const endIndex = Math.min(locations.length - 1, index + options.contextPoints);

  for (let previousIndex = index - 1; previousIndex >= startIndex; previousIndex -= 1) {
    for (let nextIndex = index + 1; nextIndex <= endIndex; nextIndex += 1) {
      const previous = locations[previousIndex];
      const next = locations[nextIndex];
      const previousSegment = segmentForTimestamp(segments, previous.timestamp);
      const nextSegment = segmentForTimestamp(segments, next.timestamp);

      if (
        previousSegment?.segmentType !== segment.segmentType ||
        nextSegment?.segmentType !== segment.segmentType
      ) {
        continue;
      }

      if (shouldDropSegmentSpike(previous, point, next, options)) return true;
    }
  }

  return false;
}

function removeSegmentSpikeLocations(locations: GeoPoint[], segments: Segment[]) {
  if (locations.length < 3 || segments.length === 0) return locations;

  let cleaned = locations;
  for (let pass = 0; pass < 2; pass += 1) {
    if (cleaned.length < 3) return cleaned;

    cleaned = cleaned.filter((_point, index) => {
      if (index === 0 || index === cleaned.length - 1) return true;

      return !shouldDropSegmentSpikeInContext(cleaned, index, segments);
    });
  }

  return cleaned;
}

function removeStationarySegmentLocations(locations: GeoPoint[], segments: Segment[]) {
  if (segments.length === 0) return locations;

  return locations.filter(
    (location) => segmentForTimestamp(segments, location.timestamp)?.segmentType !== 'STATIONARY',
  );
}

export function buildDisplayRoutePoints(
  tripId: string,
  samples: RawLocationSample[],
  segments: Segment[] = [],
): DisplayRoutePoint[] {
  return buildDisplayRouteSnapshot(tripId, samples, segments).points;
}

export interface DisplayRouteSnapshot {
  points: DisplayRoutePoint[];
  diagnostics: {
    received: number;
    duplicates: number;
    rejected: number;
    accepted: number;
    displayed: number;
  };
}

export function buildDisplayRouteCoordinateGroups(points: DisplayRoutePoint[]) {
  const geoPoints: GeoPoint[] = points.map((point) => ({
    timestamp: point.timestamp,
    latitude: point.latitude,
    longitude: point.longitude,
    speedMps: point.speedMps,
    altitudeM: undefined,
  }));

  return splitLocationsOnRouteGaps(geoPoints)
    .filter((group) => group.length > 1)
    .map((group) => group.map(({ latitude, longitude }) => ({ latitude, longitude })));
}

export function buildDisplayRouteSnapshot(
  tripId: string,
  samples: RawLocationSample[],
  segments: Segment[] = [],
): DisplayRouteSnapshot {
  const cleanedLocations = removeSegmentSpikeLocations(cleanLocations(samples), segments);
  // Stationary GPS drift is useful for classifying a stop, but connecting it
  // produces a dense false route around the dwell location.
  const routeLocations = removeStationarySegmentLocations(cleanedLocations, segments);
  const points = thinLocationsForDisplay(routeLocations).map((location, index) => ({
    tripId,
    index,
    timestamp: location.timestamp,
    latitude: location.latitude,
    longitude: location.longitude,
    speedMps: location.speedMps,
  }));
  const identities = new Set(
    samples.map((sample) => [
      sample.timestamp.toISOString(),
      sample.latitude,
      sample.longitude,
    ].join('|')),
  );

  return {
    points,
    diagnostics: {
      received: samples.length,
      duplicates: samples.length - identities.size,
      rejected: samples.length - cleanedLocations.length,
      accepted: cleanedLocations.length,
      displayed: points.length,
    },
  };
}
