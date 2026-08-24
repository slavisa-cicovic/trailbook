import type { TripBundle } from '../model/tripBundle';
import type { Segment } from '../model/segment';
import { cleanLocations } from './locationCleaner';
import { classifyIntervals } from './activityClassifier';
import { detectSegments } from './segmentDetector';
import { mergeAndFinalize } from './segmentMerger';

export const CURRENT_PROCESSING_VERSION = 16;

function processV1(bundle: TripBundle): Segment[] {
  const tripId = bundle.trip.clientTripId;

  const geoPoints = cleanLocations(bundle.locations);
  if (geoPoints.length < 2) return [];

  const intervals = classifyIntervals(geoPoints, bundle.activities);
  if (!intervals.length) return [];

  const rawSegments = detectSegments(intervals);
  if (!rawSegments.length) return [];

  return mergeAndFinalize(tripId, rawSegments, geoPoints);
}

export function process(bundle: TripBundle, version: number): Segment[] {
  switch (version) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    default:
      return processV1(bundle);
  }
}
