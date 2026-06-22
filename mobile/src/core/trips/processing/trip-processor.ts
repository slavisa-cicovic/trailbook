import type { SegmentCore, TripBundleCore } from "../model";
import { segmentTrip } from "./segmenter";
import { DEFAULT_SEGMENTER_CONFIG, PROCESSING_VERSION, type SegmenterConfig } from "./segmenter-config";

export { PROCESSING_VERSION };

export function processTripBundle(
  bundle: TripBundleCore,
  config: SegmenterConfig = DEFAULT_SEGMENTER_CONFIG,
): SegmentCore[] {
  return segmentTrip(
    {
      activities: bundle.activities,
      locations: bundle.locations,
      tripId: bundle.trip.clientTripId,
    },
    config,
  );
}
