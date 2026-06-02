export type RawLocationEventCallbackSource = "foreground" | "background";
export type RawLocationEventOrigin = "device" | "simulation";
export type RawLocationEventProcessingStatus = "pending" | "accepted" | "rejected" | "duplicate";

export interface RawLocationEvent {
  localId: string;
  tripLocalId: string;
  sessionStartedAt: string | null;
  activeSegmentLocalId: string | null;
  batchId: string;
  batchIndex: number;
  callbackSource: RawLocationEventCallbackSource;
  origin: RawLocationEventOrigin;
  receivedAt: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  processingStatus: RawLocationEventProcessingStatus;
  processingDecision: string | null;
  processedAt: string | null;
  acceptedTripPointLocalId: string | null;
  segmentLocalId: string | null;
}

export interface RawLocationEventProcessingResult {
  localId: string;
  processingStatus: RawLocationEventProcessingStatus;
  processingDecision: string | null;
  processedAt: string;
  acceptedTripPointLocalId: string | null;
  segmentLocalId: string | null;
}
