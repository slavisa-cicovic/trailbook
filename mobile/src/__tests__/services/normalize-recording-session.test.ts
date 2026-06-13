import { describe, expect, it } from "vitest";

import { normalizeRecordingSession } from "../../domain/normalize-recording-session";

describe("normalizeRecordingSession", () => {
  it("normalizes legacy non-AUTO sessions to AUTO runtime while preserving profile fallback", () => {
    const session = normalizeRecordingSession({
      activeSegmentId: "segment-1",
      activeTripId: "trip-1",
      recordingMode: "drive",
      status: "recording",
    });

    expect(session.recordingMode).toBe("auto");
    expect(session.recordingProfile).toBe("drive");
  });

  it("keeps explicit recordingProfile over legacy recordingMode", () => {
    const session = normalizeRecordingSession({
      activeSegmentId: "segment-1",
      activeTripId: "trip-1",
      recordingMode: "drive",
      recordingProfile: "bike",
      status: "recording",
    });

    expect(session.recordingMode).toBe("auto");
    expect(session.recordingProfile).toBe("bike");
  });
});
