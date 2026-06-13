import type { RecordingProfile } from "../../domain/trips";
import {
  AUTO_BATCH_MIN_BIKE_RUN_MS,
  AUTO_BATCH_MIN_DRIVE_RUN_MS,
  AUTO_BATCH_MIN_WALK_RUN_MS,
  BIKE_MIN_KMH,
  BOAT_STABILITY_MS,
  DRIVE_MIN_KMH,
  PLANE_STABILITY_MS,
  STATIONARY_MAX_DISPLACEMENT_METERS,
  STATIONARY_MAX_KMH,
  STATIONARY_MAX_TRAVEL_DISTANCE_METERS,
  STATIONARY_STABILITY_MS,
  type AutoLocationPoint,
  distanceMetersBetweenPoints,
  getPointTimeMs,
  getSpeedKmh,
  percentile,
} from "./auto-recording.utils";

export type { AutoLocationPoint };

const CITY_DRIVE_MIN_DISPLACEMENT_METERS = 250;
const CITY_DRIVE_MIN_FAST_SAMPLE_COUNT = 4;
const CITY_DRIVE_MIN_SAMPLE_COUNT = 6;
const CITY_DRIVE_STRONG_P75_KMH = 28;
const CITY_DRIVE_STRONG_PEAK_KMH = 40;
const VEHICLE_RUN_MAX_SAMPLE_GAP_MS = 90 * 1000;

export interface AutoBatchProfileSection<TSample extends AutoLocationPoint = AutoLocationPoint> {
  endedAt: string;
  profile: RecordingProfile;
  samples: TSample[];
  startedAt: string;
}

interface AutoBatchProfileRun {
  endedAt: string;
  profile: RecordingProfile;
  samples: AutoLocationPoint[];
  startedAt: string;
}

interface AutoBatchSpeedRun {
  endedAt: string;
  samples: AutoLocationPoint[];
  speedsKmh: number[];
  startedAt: string;
}

function getAutoBatchProfileMinRunMs(profile: RecordingProfile): number {
  switch (profile) {
    case "walk":
      return AUTO_BATCH_MIN_WALK_RUN_MS;
    case "bike":
      return AUTO_BATCH_MIN_BIKE_RUN_MS;
    case "drive":
      return AUTO_BATCH_MIN_DRIVE_RUN_MS;
    case "boat":
      return BOAT_STABILITY_MS;
    case "plane":
      return PLANE_STABILITY_MS;
    case "stationary":
      return STATIONARY_STABILITY_MS;
    default:
      return AUTO_BATCH_MIN_DRIVE_RUN_MS;
  }
}

function inferAutoBatchSampleProfile(
  previousPoint: AutoLocationPoint | null,
  point: AutoLocationPoint,
): RecordingProfile | null {
  const speedKmh = getSpeedKmh(previousPoint, point);

  if (speedKmh === null || !Number.isFinite(speedKmh)) {
    return null;
  }

  if (speedKmh <= STATIONARY_MAX_KMH) {
    return "stationary";
  }

  if (speedKmh >= 180) {
    return "plane";
  }

  if (speedKmh >= 28) {
    return "drive";
  }

  if (speedKmh >= 8.5 && speedKmh <= 35) {
    return "bike";
  }

  if (speedKmh <= 6) {
    return "walk";
  }

  return null;
}

function getRunDurationMs(run: Pick<AutoBatchProfileRun, "endedAt" | "startedAt">): number {
  return new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
}

function getSpeedRunDurationMs(run: Pick<AutoBatchSpeedRun, "endedAt" | "startedAt">): number {
  return new Date(run.endedAt).getTime() - new Date(run.startedAt).getTime();
}

function isStableAutoBatchProfileRun(run: AutoBatchProfileRun): boolean {
  if (run.samples.length < 2) {
    return false;
  }

  if (getRunDurationMs(run) < getAutoBatchProfileMinRunMs(run.profile)) {
    return false;
  }

  if (run.profile !== "stationary") {
    return true;
  }

  if (run.samples.length < 4) {
    return false;
  }

  const firstSample = run.samples[0];
  const lastSample = run.samples[run.samples.length - 1];

  if (!firstSample || !lastSample) {
    return false;
  }

  const displacementMeters = distanceMetersBetweenPoints(firstSample, lastSample);
  const travelDistanceMeters = run.samples.reduce((distance, sample, index) => {
    if (index === 0) {
      return distance;
    }

    return distance + distanceMetersBetweenPoints(run.samples[index - 1]!, sample);
  }, 0);

  return (
    displacementMeters <= STATIONARY_MAX_DISPLACEMENT_METERS &&
    travelDistanceMeters <= STATIONARY_MAX_TRAVEL_DISTANCE_METERS
  );
}

function buildAutoBatchProfileRuns(sortedSamples: AutoLocationPoint[]): AutoBatchProfileRun[] {
  const runs: AutoBatchProfileRun[] = [];

  for (let index = 0; index < sortedSamples.length; index += 1) {
    const sample = sortedSamples[index];
    const profile = inferAutoBatchSampleProfile(index > 0 ? sortedSamples[index - 1] ?? null : null, sample);

    if (!profile) {
      continue;
    }

    const currentRun = runs[runs.length - 1] ?? null;

    if (currentRun?.profile === profile) {
      currentRun.samples.push(sample);
      currentRun.endedAt = sample.recordedAt;
    } else {
      runs.push({
        endedAt: sample.recordedAt,
        profile,
        samples: [sample],
        startedAt: sample.recordedAt,
      });
    }
  }

  return mergeAutoBatchProfileRuns(
    runs.filter(isStableAutoBatchProfileRun),
    buildSmoothedCityDriveRuns(sortedSamples),
  );
}

function buildVehicleSpeedRuns(sortedSamples: AutoLocationPoint[]): AutoBatchSpeedRun[] {
  const runs: AutoBatchSpeedRun[] = [];
  let currentRun: AutoBatchSpeedRun | null = null;
  let previousIncludedSample: AutoLocationPoint | null = null;

  for (let index = 0; index < sortedSamples.length; index += 1) {
    const sample = sortedSamples[index];
    const speedKmh = getSpeedKmh(index > 0 ? sortedSamples[index - 1] ?? null : null, sample);

    if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < BIKE_MIN_KMH) {
      if (currentRun) {
        runs.push(currentRun);
      }
      currentRun = null;
      previousIncludedSample = null;
      continue;
    }

    const previousIncludedSampleMs = previousIncludedSample ? getPointTimeMs(previousIncludedSample) : null;
    const sampleMs = getPointTimeMs(sample);

    if (
      currentRun &&
      previousIncludedSampleMs !== null &&
      Number.isFinite(previousIncludedSampleMs) &&
      Number.isFinite(sampleMs) &&
      sampleMs - previousIncludedSampleMs > VEHICLE_RUN_MAX_SAMPLE_GAP_MS
    ) {
      runs.push(currentRun);
      currentRun = null;
    }

    if (!currentRun) {
      currentRun = {
        endedAt: sample.recordedAt,
        samples: [sample],
        speedsKmh: [speedKmh],
        startedAt: sample.recordedAt,
      };
    } else {
      currentRun.samples.push(sample);
      currentRun.speedsKmh.push(speedKmh);
      currentRun.endedAt = sample.recordedAt;
    }

    previousIncludedSample = sample;
  }

  if (currentRun) {
    runs.push(currentRun);
  }

  return runs;
}

function getRunDisplacementMeters(run: AutoBatchSpeedRun): number {
  const firstSample = run.samples[0] ?? null;
  const lastSample = run.samples[run.samples.length - 1] ?? null;

  if (!firstSample || !lastSample) {
    return 0;
  }

  return distanceMetersBetweenPoints(firstSample, lastSample);
}

function isSmoothedCityDriveRun(run: AutoBatchSpeedRun): boolean {
  if (run.samples.length < CITY_DRIVE_MIN_SAMPLE_COUNT) {
    return false;
  }

  if (getSpeedRunDurationMs(run) < AUTO_BATCH_MIN_DRIVE_RUN_MS) {
    return false;
  }

  if (getRunDisplacementMeters(run) < CITY_DRIVE_MIN_DISPLACEMENT_METERS) {
    return false;
  }

  const fastSampleCount = run.speedsKmh.filter((speedKmh) => speedKmh >= DRIVE_MIN_KMH).length;
  const peakSpeedKmh = Math.max(...run.speedsKmh);
  const p75SpeedKmh = percentile(run.speedsKmh, 0.75);

  return (
    fastSampleCount >= CITY_DRIVE_MIN_FAST_SAMPLE_COUNT &&
    (peakSpeedKmh >= CITY_DRIVE_STRONG_PEAK_KMH || p75SpeedKmh >= CITY_DRIVE_STRONG_P75_KMH)
  );
}

function buildSmoothedCityDriveRuns(sortedSamples: AutoLocationPoint[]): AutoBatchProfileRun[] {
  return buildVehicleSpeedRuns(sortedSamples)
    .filter(isSmoothedCityDriveRun)
    .map((run) => ({
      endedAt: run.endedAt,
      profile: "drive",
      samples: run.samples,
      startedAt: run.startedAt,
    }));
}

function doRunsOverlap(left: AutoBatchProfileRun, right: AutoBatchProfileRun): boolean {
  const leftStartedAtMs = new Date(left.startedAt).getTime();
  const leftEndedAtMs = new Date(left.endedAt).getTime();
  const rightStartedAtMs = new Date(right.startedAt).getTime();
  const rightEndedAtMs = new Date(right.endedAt).getTime();

  return leftStartedAtMs <= rightEndedAtMs && rightStartedAtMs <= leftEndedAtMs;
}

function mergeDriveRuns(runs: AutoBatchProfileRun[]): AutoBatchProfileRun[] {
  const sortedRuns = [...runs].sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  const mergedRuns: AutoBatchProfileRun[] = [];

  for (const run of sortedRuns) {
    const previousRun = mergedRuns[mergedRuns.length - 1] ?? null;

    if (!previousRun || !doRunsOverlap(previousRun, run)) {
      mergedRuns.push({ ...run, samples: [...run.samples] });
      continue;
    }

    previousRun.endedAt = previousRun.endedAt.localeCompare(run.endedAt) >= 0 ? previousRun.endedAt : run.endedAt;
    previousRun.startedAt =
      previousRun.startedAt.localeCompare(run.startedAt) <= 0 ? previousRun.startedAt : run.startedAt;
    previousRun.samples = [...previousRun.samples, ...run.samples]
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  }

  return mergedRuns;
}

function mergeAutoBatchProfileRuns(
  exactRuns: AutoBatchProfileRun[],
  smoothedDriveRuns: AutoBatchProfileRun[],
): AutoBatchProfileRun[] {
  if (smoothedDriveRuns.length === 0) {
    return exactRuns;
  }

  const driveRuns = mergeDriveRuns([
    ...exactRuns.filter((run) => run.profile === "drive"),
    ...smoothedDriveRuns,
  ]);
  const nonDriveRuns = exactRuns.filter(
    (run) => run.profile !== "drive" && !driveRuns.some((driveRun) => doRunsOverlap(run, driveRun)),
  );

  return [...nonDriveRuns, ...driveRuns]
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function findAutoBatchSectionIndex<TSample extends AutoLocationPoint>(
  sections: AutoBatchProfileSection<TSample>[],
  sample: TSample,
): number {
  const sampleMs = getPointTimeMs(sample);
  const matchingIndex = sections.findIndex((section, index) => {
    const startedAtMs = new Date(section.startedAt).getTime();
    const nextStartedAt = sections[index + 1]?.startedAt ?? null;
    const nextStartedAtMs = nextStartedAt ? new Date(nextStartedAt).getTime() : Number.POSITIVE_INFINITY;

    return sampleMs >= startedAtMs && sampleMs < nextStartedAtMs;
  });

  return matchingIndex === -1 ? Math.max(0, sections.length - 1) : matchingIndex;
}

export function buildAutoBatchProfileSections<TSample extends AutoLocationPoint>(
  batchSamples: TSample[],
  fallbackProfile: RecordingProfile,
): AutoBatchProfileSection<TSample>[] {
  const sortedSamples = [...batchSamples].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const firstSample = sortedSamples[0] ?? null;
  const lastSample = sortedSamples[sortedSamples.length - 1] ?? null;

  if (!firstSample || !lastSample) {
    return [];
  }

  const stableRuns = buildAutoBatchProfileRuns(sortedSamples);

  if (stableRuns.length === 0) {
    return [
      {
        endedAt: lastSample.recordedAt,
        profile: fallbackProfile,
        samples: sortedSamples,
        startedAt: firstSample.recordedAt,
      },
    ];
  }

  const sections: AutoBatchProfileSection<TSample>[] = [];
  let currentProfile = fallbackProfile;
  let currentStartedAt = firstSample.recordedAt;

  for (const run of stableRuns) {
    if (sections.length === 0 && run.startedAt === firstSample.recordedAt) {
      currentProfile = run.profile;
      currentStartedAt = firstSample.recordedAt;
      continue;
    }

    if (run.profile === currentProfile) {
      continue;
    }

    sections.push({
      endedAt: run.startedAt,
      profile: currentProfile,
      samples: [],
      startedAt: currentStartedAt,
    });
    currentProfile = run.profile;
    currentStartedAt = run.startedAt;
  }

  sections.push({
    endedAt: lastSample.recordedAt,
    profile: currentProfile,
    samples: [],
    startedAt: currentStartedAt,
  });

  for (const sample of sortedSamples) {
    sections[findAutoBatchSectionIndex(sections, sample)]?.samples.push(sample);
  }

  return sections.filter((section) => section.samples.length > 0);
}
