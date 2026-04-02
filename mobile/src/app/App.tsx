import type { RecordingSessionSummary } from "../domain/trips";

const placeholderSession: RecordingSessionSummary = {
  activeTripId: null,
  isRecording: false,
  lastPointRecordedAt: null,
};

export function App(): string {
  const status = placeholderSession.isRecording ? "recording" : "idle";
  const lastPoint = placeholderSession.lastPointRecordedAt ?? "n/a";

  return `Trailbook mobile scaffold: ${status}, last point ${lastPoint}`;
}
