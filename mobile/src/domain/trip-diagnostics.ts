import type { RecordingMode } from "./trips";

export type TripDiagnosticsPlatform = "android" | "ios" | "web" | "unknown";
export type TripDiagnosticsSource = "foreground" | "background";
export type TripDiagnosticsDecision =
  | "accepted"
  | "duplicate-timestamp"
  | "duplicate-coordinates"
  | "session-duplicate-recorded-at"
  | "accuracy"
  | "min-movement"
  | "jump-distance"
  | "implied-speed";

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

export interface TripDiagnostics {
  accepted: number;
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
  platform: TripDiagnosticsPlatform;
  recentEvents: TripDiagnosticsRecentEvent[];
  recordingMode: RecordingMode;
  rejectedByAccuracy: number;
  rejectedByImpliedSpeed: number;
  rejectedByJumpDistance: number;
  rejectedByMinMovement: number;
  sessionDuplicateRecordedAt: number;
  tripLocalId: string;
  updatedAt: string;
}
