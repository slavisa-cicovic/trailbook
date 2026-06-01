import { persistBackgroundRecordedLocations } from "../recording/recording-pipeline.service";
import {
  getCurrentForegroundLocation,
  stopBackgroundLocationTracking,
} from "../location/location.service";
import { loadTripPointsForTrip, refreshTripStatsForTripLocalId } from "../../storage/trip-points-storage";
import {
  closeActiveTrip,
  createRecordingSession,
  createTripForRecording,
  getConcreteRecordingProfileForMode,
  stopRecordingSession,
} from "../recording/recording.service";
import { clearAutoRecordingSamples } from "../recording/auto-recording.service";
import { closeActiveTripSegment, createInitialTripSegment } from "../trip-segments/trip-segments.service";
import { resetPendingTripPointContinuity } from "../trip-points/trip-points.service";
import { getRecordingStateSnapshot, setRecordingSession } from "../../state/recording-store";
import { getSessionStateSnapshot } from "../../state/session-store";
import { getTripsStateSnapshot, setTrips } from "../../state/trips-store";
import { getTripSegmentsStateSnapshot, setTripSegments } from "../../state/trip-segments-store";
import { setTripPointsInMemory } from "../../state/trip-points-store";
import {
  formatDuration,
  generateScenarioLocations,
  totalScenarioDurationMs,
  type ScenarioSegment,
  type ScenarioTimestampStrategy,
  type SimulationActivity,
} from "./location-generator.service";

export interface PredefinedScenario {
  id: string;
  name: string;
  description: string;
  segments: ScenarioSegment[];
  // transition: startTs = now-90s → isBatch=false → incremental AUTO detection (for multi-activity AUTO testing)
  // sleep: startTs = now-total-15s → isBatch=true → batch pre-processing (for Android sleep testing)
  strategy: ScenarioTimestampStrategy;
}

export interface ScenarioRunResult {
  locationCount: number;
  processingMs: number;
  savedPoints: number;
}

const MIN = 60_000;

export const PREDEFINED_SCENARIOS: PredefinedScenario[] = [
  // --- Transition scenarios (startTs = now-90s, isBatch=false, incremental AUTO detection) ---
  {
    id: "walk-drive-walk",
    name: "Walk → Drive → Walk",
    description:
      "2 min walk, 10 min drive, 2 min walk. AUTO drive detection and transition back to walk.",
    segments: [
      { activity: "walk", durationMs: 2 * MIN },
      { activity: "drive", durationMs: 10 * MIN },
      { activity: "walk", durationMs: 2 * MIN },
    ],
    strategy: "transition",
  },
  {
    id: "walk-bike-pause-walk",
    name: "Walk → Bike → Pause → Walk",
    description:
      "2 min walk, 10 min bike, 5 min pause, 2 min walk. AUTO bike detection, pause and recovery.",
    segments: [
      { activity: "walk", durationMs: 2 * MIN },
      { activity: "bike", durationMs: 10 * MIN },
      { activity: "pause", durationMs: 5 * MIN },
      { activity: "walk", durationMs: 2 * MIN },
    ],
    strategy: "transition",
  },
  {
    id: "walk-drive-walk-bike",
    name: "Walk → Drive → Walk → Bike",
    description:
      "1 min walk, 10 min drive, 1 min walk, 10 min bike. Full multi-mode trip.",
    segments: [
      { activity: "walk", durationMs: 1 * MIN },
      { activity: "drive", durationMs: 10 * MIN },
      { activity: "walk", durationMs: 1 * MIN },
      { activity: "bike", durationMs: 10 * MIN },
    ],
    strategy: "transition",
  },
  // --- Sleep scenarios (startTs = far past, isBatch=true, tests Android sleep recovery) ---
  {
    id: "android-sleep-drive",
    name: "Android sleep: long drive",
    description:
      "30 min drive as one batch (far past timestamps). Simulates Android background sleep recovery — tests that all drive points are accepted on wake.",
    segments: [{ activity: "drive", durationMs: 30 * MIN }],
    strategy: "sleep",
  },
  {
    id: "android-sleep-walk-drive",
    name: "Android sleep: walk then drive",
    description:
      "5 min walk + 20 min drive as one batch. Batch pre-processing detects final activity and creates correct segment.",
    segments: [
      { activity: "walk", durationMs: 5 * MIN },
      { activity: "drive", durationMs: 20 * MIN },
    ],
    strategy: "sleep",
  },
  {
    id: "stationary",
    name: "Stationary (GPS jitter)",
    description:
      "15 min of stationary GPS noise. Tests that no spurious movement or segment is created.",
    segments: [{ activity: "pause", durationMs: 15 * MIN }],
    strategy: "sleep",
  },
];

export function getScenarioSummary(scenario: PredefinedScenario): string {
  const totalMs = totalScenarioDurationMs(scenario.segments);
  const parts = scenario.segments.map(
    (s) => `${getActivityLabel(s.activity)} ${formatDuration(s.durationMs)}`,
  );
  return `${parts.join(" → ")}  (${formatDuration(totalMs)} total)`;
}

function getActivityLabel(activity: SimulationActivity): string {
  switch (activity) {
    case "walk":
      return "Walk";
    case "bike":
      return "Bike";
    case "drive":
      return "Drive";
    case "pause":
      return "Pause";
  }
}

async function getSimulationStartCoords(): Promise<{ lat: number; lon: number }> {
  try {
    const location = await getCurrentForegroundLocation();

    if (location) {
      return { lat: location.latitude, lon: location.longitude };
    }
  } catch {
    // fall through to default
  }

  return { lat: 43.8563, lon: 18.4131 };
}

async function countSavedPoints(tripLocalId: string): Promise<number> {
  try {
    const points = await loadTripPointsForTrip(tripLocalId);
    return points.length;
  } catch {
    return 0;
  }
}

// Injects all scenario locations as a single batch call.
// Background GPS is stopped first to prevent real GPS timestamps (≈ now) from
// interfering with simulated timestamps that may be in the past or future.
export async function runScenario(
  scenario: PredefinedScenario,
  onProgress: (processed: number, total: number) => void,
  signal: AbortSignal,
): Promise<ScenarioRunResult> {
  const recording = getRecordingStateSnapshot();

  if (recording.session.status !== "recording" || !recording.session.activeTripId) {
    throw new Error("No active recording. Start a trip first.");
  }

  const { activeTripId } = recording.session;

  // Stop background GPS so real-device timestamps don't race against simulated ones.
  await stopBackgroundLocationTracking().catch(() => undefined);

  const { lat, lon } = await getSimulationStartCoords();
  const locations = generateScenarioLocations(scenario.segments, lat, lon, scenario.strategy);

  if (signal.aborted) {
    return { locationCount: 0, processingMs: 0, savedPoints: 0 };
  }

  onProgress(0, locations.length);
  const startMs = Date.now();
  await persistBackgroundRecordedLocations(locations);
  const processingMs = Date.now() - startMs;
  onProgress(locations.length, locations.length);

  const savedPoints = await countSavedPoints(activeTripId);
  return { locationCount: locations.length, processingMs, savedPoints };
}

// Creates a recording trip + session without starting background GPS.
// Useful for Expo Go / iOS where background location is unavailable.
export async function startSimulationRecording(): Promise<void> {
  const { identitySession } = getSessionStateSnapshot();

  if (!identitySession) {
    throw new Error("Not logged in.");
  }

  const recording = getRecordingStateSnapshot();

  if (recording.session.status === "recording") {
    throw new Error("A recording is already active.");
  }

  const { trips } = getTripsStateSnapshot();
  const { tripSegments } = getTripSegmentsStateSnapshot();
  const startedAt = new Date().toISOString();
  const nextTrip = createTripForRecording(identitySession, startedAt, {
    title: "Simulation trip",
    description: "",
    recordingMode: "auto",
  });

  resetPendingTripPointContinuity(nextTrip.localId);
  setTripPointsInMemory([]);

  const nextSegment = createInitialTripSegment(nextTrip, startedAt);
  const nextSession = createRecordingSession(
    identitySession,
    nextTrip.localId,
    nextSegment.localId,
    startedAt,
    "auto",
    getConcreteRecordingProfileForMode("auto"),
  );

  await setTrips([...trips, nextTrip]);
  await setTripSegments([...tripSegments, nextSegment]);
  await setRecordingSession(nextSession);
}

export async function stopSimulationRecording(): Promise<void> {
  const recording = getRecordingStateSnapshot();

  if (recording.session.status !== "recording" || !recording.session.activeTripId) {
    return;
  }

  const { activeTripId, activeSegmentId } = recording.session;
  const endedAt = new Date().toISOString();
  const { trips } = getTripsStateSnapshot();
  const { tripSegments } = getTripSegmentsStateSnapshot();

  if (activeSegmentId) {
    const closedSegments = closeActiveTripSegment(tripSegments, activeSegmentId, endedAt);
    await setTripSegments(closedSegments);
  }

  await setTrips(closeActiveTrip(trips, activeTripId, endedAt));
  await refreshTripStatsForTripLocalId(activeTripId);
  await setRecordingSession(stopRecordingSession(recording.session));
  clearAutoRecordingSamples(activeTripId);
  resetPendingTripPointContinuity(activeTripId);
}
