import type { RecordingMode } from "./trips";

// Kept as `recordingMode` for local storage and backend sync compatibility.
// New runtime recordings write `auto`; point filtering uses RecordingProfile separately.
export type TripDiagnosticsRecordingMode = RecordingMode;

export type TripDiagnosticsPlatform = "android" | "ios" | "web" | "unknown";
export type TripDiagnosticsSource = "foreground" | "background";
export type TripDiagnosticsDecision =
  | "accepted"
  | "accepted-after-long-gap"
  | "accepted-early-session"
  | "accepted-after-resume"
  | "confirmed-pending-continuity"
  | "duplicate-timestamp"
  | "duplicate-coordinates"
  | "session-duplicate-recorded-at"
  | "accuracy"
  | "min-movement"
  | "jump-distance"
  | "implied-speed"
  | "rejected-pending-continuity"
  | "removed-as-spike";

export interface TripDiagnosticsRecentEvent {
  accuracy: number | null;
  altitude: number | null;
  decision: TripDiagnosticsDecision | null;
  latitude: number;
  longitude: number;
  receivedAt: string;
  recordedAt: string;
  source: TripDiagnosticsSource;
  speed: number | null;
}

export interface TripDiagnosticsAccuracyHistogram {
  gte120m: number;
  lt10m: number;
  lt20m: number;
  lt30m: number;
  lt50m: number;
  lt80m: number;
  lt120m: number;
  unknown: number;
}

export interface TripDiagnostics {
  accepted: number;
  acceptedAfterLongGap: number;
  accuracyHistogram: TripDiagnosticsAccuracyHistogram;
  backgroundAccepted: number;
  backgroundCallbacks: number;
  backgroundRejected: number;
  callbackCount: number;
  decisionCount: number;
  duplicateCoordinates: number;
  duplicateTimestamp: number;
  foregroundAccepted: number;
  foregroundCallbacks: number;
  foregroundRejected: number;
  maxCallbackGapMs: number;
  maxRecordedGapMs: number;
  maxSilentGapMs: number;
  platform: TripDiagnosticsPlatform;
  recentEvents: TripDiagnosticsRecentEvent[];
  recordingMode: TripDiagnosticsRecordingMode;
  rejectedByAccuracy: number;
  rejectedByImpliedSpeed: number;
  rejectedByJumpDistance: number;
  rejectedByMinMovement: number;
  sessionDuplicateRecordedAt: number;
  silentGapCount: number;
  tripLocalId: string;
  updatedAt: string;
}
