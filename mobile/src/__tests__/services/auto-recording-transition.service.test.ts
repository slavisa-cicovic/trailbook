import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MotionActivity } from "../../domain/motion-activity";
import type { RecordingSessionSummary, Trip, TripPoint, TripSegment } from "../../domain/trips";
import { inferAutoRecordingProfile } from "../../services/recording/auto-recording-inference.service";
import { applyAutoRecordingTransition } from "../../services/recording/auto-recording-transition.service";
import {
  BIKE_STABILITY_MS,
  DRIVE_STABILITY_MS,
  MOTION_ASSISTED_BIKE_STABILITY_MS,
  MOTION_ASSISTED_DRIVE_STABILITY_MS,
  STATIONARY_STABILITY_MS,
  WALK_STABILITY_MS,
  type AutoLocationPoint,
} from "../../services/recording/auto-recording.utils";

vi.mock("../../services/recording/auto-recording-inference.service", () => ({
  inferAutoRecordingProfile: vi.fn(),
  isMotionAssistedBikeCandidate: (ma: MotionActivity | null): boolean =>
    ma?.type === "bike" && (ma.confidence === "medium" || ma.confidence === "high"),
  isMotionAssistedDriveCandidate: (ma: MotionActivity | null): boolean =>
    ma?.type === "drive" && (ma.confidence === "medium" || ma.confidence === "high"),
}));

vi.mock("../../services/trip-segments/trip-segments.service", () => ({
  closeActiveTripSegment: vi.fn(
    (segments: TripSegment[], segmentLocalId: string, endedAt: string) =>
      segments.map((s) => (s.localId === segmentLocalId ? { ...s, endedAt } : s)),
  ),
  getOpenTripSegmentForTrip: vi.fn(
    (segments: TripSegment[], tripLocalId: string) =>
      segments.find((s) => s.tripLocalId === tripLocalId && s.endedAt === null) ?? null,
  ),
  startNextTripSegment: vi.fn(
    (trip: Trip, segments: TripSegment[], profile: string, startedAt: string) => {
      const nextSegment: TripSegment = {
        createdAt: startedAt,
        deviceId: trip.deviceId,
        distanceMeters: null,
        durationMs: null,
        endedAt: null,
        localId: "segment-2",
        pointCount: null,
        recordingProfile: profile as TripSegment["recordingProfile"],
        serverId: null,
        startedAt,
        statsUpdatedAt: null,
        syncStatus: "local-only",
        tripLocalId: trip.localId,
        updatedAt: startedAt,
        userId: trip.userId,
      };
      return { nextSegment, tripSegments: [...segments, nextSegment] };
    },
  ),
  normalizeAutoClosedTripSegment: vi.fn(
    (segments: TripSegment[], tripPoints: unknown, waypoints: unknown) => ({
      tripPoints,
      tripSegments: segments,
      waypoints,
    }),
  ),
  removeInitialAutoBootstrapWalkSegment: vi.fn(
    (segments: TripSegment[], tripPoints: unknown, waypoints: unknown) => ({
      tripPoints,
      tripSegments: segments,
      waypoints,
    }),
  ),
}));

vi.mock("../../services/trip-points/trip-points.service", () => ({
  getVisibleTripPointsForTrip: vi.fn((tripPoints: unknown[]) => tripPoints),
}));

vi.mock("../../services/recording/recording.service", () => ({
  updateRecordingAutoCandidate: vi.fn(
    (session: RecordingSessionSummary, profile: string | null, since: string | null) => ({
      ...session,
      autoCandidateProfile: profile,
      autoCandidateSince: since,
    }),
  ),
  updateRecordingSegment: vi.fn(
    (session: RecordingSessionSummary, segmentId: string, profile: string) => ({
      ...session,
      activeSegmentId: segmentId,
      autoCandidateProfile: null,
      autoCandidateSince: null,
      recordingProfile: profile,
    }),
  ),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const BASE_MS = 1_748_570_493_000;

function iso(offsetMs = 0): string {
  return new Date(BASE_MS + offsetMs).toISOString();
}

function makeSession(overrides: Partial<RecordingSessionSummary> = {}): RecordingSessionSummary {
  return {
    activeTripId: "trip-1",
    activeSegmentId: "seg-1",
    autoCandidateProfile: null,
    autoCandidateSince: null,
    deviceId: "dev-1",
    interruptedAt: null,
    lastPointRecordedAt: null,
    motionActivityConfidence: null,
    motionActivityRecordedAt: null,
    motionActivitySourcePlatform: null,
    motionActivityType: null,
    recordingMode: "auto",
    recordingProfile: "walk",
    startedAt: iso(),
    status: "recording",
    userEmail: null,
    userId: "user-1",
    ...overrides,
  };
}

function makeTrip(): Trip {
  return {
    batteryEndLevelPercent: null,
    batteryEndState: null,
    batteryStartLevelPercent: null,
    batteryStartState: null,
    createdAt: iso(),
    deletedAt: null,
    description: null,
    deviceId: "dev-1",
    distanceMeters: null,
    endedAt: null,
    localId: "trip-1",
    pointCount: null,
    recordingConfig: null,
    recordingProfile: "walk",
    serverId: null,
    startedAt: iso(),
    statsUpdatedAt: null,
    status: "active",
    syncStatus: "local-only",
    title: "Test",
    updatedAt: iso(),
    userId: "user-1",
  };
}

function makeSegment(profile: TripSegment["recordingProfile"] = "walk"): TripSegment {
  return {
    createdAt: iso(),
    deviceId: "dev-1",
    distanceMeters: null,
    durationMs: null,
    endedAt: null,
    localId: "seg-1",
    pointCount: null,
    recordingProfile: profile,
    serverId: null,
    startedAt: iso(),
    statsUpdatedAt: null,
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    updatedAt: iso(),
    userId: "user-1",
  };
}

function makePoint(localId: string, segmentLocalId: string, recordedAt: string): TripPoint {
  return {
    accuracy: 5,
    altitude: null,
    deviceId: "dev-1",
    latitude: 45,
    localId,
    longitude: 19,
    recordedAt,
    segmentLocalId,
    serverId: null,
    speed: 10,
    syncStatus: "local-only",
    tripLocalId: "trip-1",
    userId: "user-1",
  };
}

function makeRawPoint(offsetMs: number, speedMs: number): AutoLocationPoint {
  return {
    accuracy: 5,
    latitude: 45 + (offsetMs / 1000) * 0.000001,
    longitude: 19,
    recordedAt: iso(offsetMs),
    speed: speedMs,
  };
}

const trip = makeTrip();

// ── no-op cases ───────────────────────────────────────────────────────────────

describe("applyAutoRecordingTransition — no-op cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns changed=false when activeSegmentId is null", () => {
    const session = makeSession({ activeSegmentId: null });
    const result = applyAutoRecordingTransition(session, trip, [], [], [], iso(1000));
    expect(result.changed).toBe(false);
    expect(result.session).toBe(session);
  });

  it("returns changed=false and same session when inference is null with no pending candidate", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue(null);
    const session = makeSession();
    const result = applyAutoRecordingTransition(session, trip, [makeSegment()], [], [], iso(1000));
    expect(result.changed).toBe(false);
    expect(result.session).toBe(session);
  });

  it("preserves pending candidate when inference momentarily returns null", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue(null);
    // autoCandidateProfile "bike" ≠ currentProfile "walk" → keepExistingCandidate = true
    const session = makeSession({ autoCandidateProfile: "bike", autoCandidateSince: iso(0) });
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(1000),
    );
    expect(result.changed).toBe(false);
    expect(result.session).toBe(session);
  });

  it("returns changed=false when inferred profile matches current segment profile", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("walk");
    const session = makeSession();
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(1000),
    );
    expect(result.changed).toBe(false);
    expect(result.session).toBe(session);
  });
});

// ── candidate tracking ────────────────────────────────────────────────────────

describe("applyAutoRecordingTransition — candidate tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets candidate when a new profile is inferred for the first time", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = makeSession({ autoCandidateProfile: null });
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(1000),
    );
    expect(result.changed).toBe(false);
    expect(result.session.autoCandidateProfile).toBe("drive");
    expect(result.session.autoCandidateSince).toBe(iso(1000));
  });

  it("holds candidate without transitioning when elapsed time is below stability threshold", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = makeSession({
      autoCandidateProfile: "drive",
      autoCandidateSince: iso(0),
    });
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(DRIVE_STABILITY_MS - 1),
    );
    expect(result.changed).toBe(false);
    expect(result.session).toBe(session);
  });

  it("switches candidate to new inferred profile when previous candidate differs", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = makeSession({
      autoCandidateProfile: "bike",
      autoCandidateSince: iso(0),
    });
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(10_000),
    );
    expect(result.changed).toBe(false);
    expect(result.session.autoCandidateProfile).toBe("drive");
    expect(result.session.autoCandidateSince).toBe(iso(10_000));
  });
});

// ── transition firing ─────────────────────────────────────────────────────────

describe("applyAutoRecordingTransition — transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function sessionWithCandidate(
    currentProfile: TripSegment["recordingProfile"],
    candidateProfile: TripSegment["recordingProfile"],
  ): RecordingSessionSummary {
    return makeSession({
      autoCandidateProfile: candidateProfile,
      autoCandidateSince: iso(0),
      recordingProfile: currentProfile,
    });
  }

  it("transitions walk→drive after DRIVE_STABILITY_MS", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = sessionWithCandidate("walk", "drive");
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(DRIVE_STABILITY_MS),
    );
    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("drive");
    expect(result.session.activeSegmentId).toBe("segment-2");
    expect(result.session.autoCandidateProfile).toBeNull();
    expect(result.session.autoCandidateSince).toBeNull();
    const newSeg = result.tripSegments.find((s) => s.localId === "segment-2");
    expect(newSeg?.recordingProfile).toBe("drive");
    expect(newSeg?.endedAt).toBeNull();
    const oldSeg = result.tripSegments.find((s) => s.localId === "seg-1");
    expect(oldSeg?.endedAt).toBeTruthy();
  });

  it("starts the new segment at candidateSince and reassigns accepted points in the candidate window", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const candidateSince = iso(10_000);
    const session = makeSession({
      autoCandidateProfile: "drive",
      autoCandidateSince: candidateSince,
      recordingProfile: "walk",
    });
    const tripPoints = [
      makePoint("before-candidate", "seg-1", iso(5_000)),
      makePoint("after-candidate", "seg-1", iso(20_000)),
    ];

    const result = applyAutoRecordingTransition(
      session,
      trip,
      [makeSegment("walk")],
      tripPoints,
      [],
      iso(10_000 + DRIVE_STABILITY_MS),
    );

    expect(result.changed).toBe(true);
    expect(result.tripSegments.find((s) => s.localId === "seg-1")?.endedAt).toBe(candidateSince);
    expect(result.tripSegments.find((s) => s.localId === "segment-2")?.startedAt).toBe(candidateSince);
    expect(result.tripPoints.find((point) => point.localId === "before-candidate")?.segmentLocalId).toBe("seg-1");
    expect(result.tripPoints.find((point) => point.localId === "after-candidate")?.segmentLocalId).toBe("segment-2");
  });

  it("transitions walk→bike after BIKE_STABILITY_MS", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("bike");
    const session = sessionWithCandidate("walk", "bike");
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(BIKE_STABILITY_MS),
    );
    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("bike");
  });

  it("transitions drive→walk after WALK_STABILITY_MS", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("walk");
    const session = sessionWithCandidate("drive", "walk");
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("drive")], [], [], iso(WALK_STABILITY_MS),
    );
    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("walk");
  });

  it("transitions movement→stationary at the beginning of the stable stationary window", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("stationary");
    const rawTripPoints = Array.from({ length: 6 }, (_, index) => makeRawPoint(index * 30_000, 0.4));
    const session = makeSession({ recordingProfile: "bike" });

    const result = applyAutoRecordingTransition(
      session,
      trip,
      [makeSegment("bike")],
      [],
      [],
      iso(STATIONARY_STABILITY_MS + 30_000),
      null,
      rawTripPoints,
    );

    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("stationary");
    expect(result.tripSegments.find((segment) => segment.localId === "seg-1")?.endedAt).toBe(iso(30_000));
    expect(result.tripSegments.find((segment) => segment.localId === "segment-2")?.startedAt).toBe(iso(30_000));
  });

  it("does not transition when elapsed time is 1 ms below threshold", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = sessionWithCandidate("walk", "drive");
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(DRIVE_STABILITY_MS - 1),
    );
    expect(result.changed).toBe(false);
  });

  it("applies motion-assisted bike threshold (45 s) with high-confidence bike motion", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("bike");
    const session = sessionWithCandidate("walk", "bike");
    const motion: MotionActivity = {
      confidence: "high",
      recordedAt: iso(),
      sourcePlatform: "android",
      type: "bike",
    };
    // 45 s < standard BIKE_STABILITY_MS (75 s) but ≥ MOTION_ASSISTED_BIKE_STABILITY_MS (45 s)
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(MOTION_ASSISTED_BIKE_STABILITY_MS), motion,
    );
    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("bike");
  });

  it("applies motion-assisted drive threshold (45 s) with medium-confidence drive motion", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("drive");
    const session = sessionWithCandidate("walk", "drive");
    const motion: MotionActivity = {
      confidence: "medium",
      recordedAt: iso(),
      sourcePlatform: "android",
      type: "drive",
    };
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(MOTION_ASSISTED_DRIVE_STABILITY_MS), motion,
    );
    expect(result.changed).toBe(true);
    expect(result.session.recordingProfile).toBe("drive");
  });

  it("requires full stability threshold when motion confidence is low", () => {
    vi.mocked(inferAutoRecordingProfile).mockReturnValue("bike");
    const session = sessionWithCandidate("walk", "bike");
    const lowConfidence: MotionActivity = {
      confidence: "low",
      recordedAt: iso(),
      sourcePlatform: "android",
      type: "bike",
    };
    // 45 s is enough for motion-assisted but NOT for standard threshold → no transition
    const result = applyAutoRecordingTransition(
      session, trip, [makeSegment("walk")], [], [], iso(MOTION_ASSISTED_BIKE_STABILITY_MS), lowConfidence,
    );
    expect(result.changed).toBe(false);
  });
});
