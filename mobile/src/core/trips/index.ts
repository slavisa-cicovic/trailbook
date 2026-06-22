export type {
  CaptureMeta,
  RawActivityResult,
  RawActivitySample,
  RawDeviceSample,
  RawLocationSample,
  RawSessionEvent,
  SegmentCore,
  SegmentType,
  SessionEventType,
  SyncState,
  TripBundleCore,
  TripCore,
  TripStatus,
  WaypointCore,
  WaypointImageCore,
} from "./model";
export { classifyActivity, classifyFromSpeed } from "./processing/activity-classifier";
export { haversineMeters } from "./processing/distance-calculator";
export { segmentTrip } from "./processing/segmenter";
export { DEFAULT_SEGMENTER_CONFIG, PROCESSING_VERSION, type SegmenterConfig } from "./processing/segmenter-config";
export { processTripBundle } from "./processing/trip-processor";
