import type { RawActivitySample, RawLocationSample, SegmentCore, SegmentType } from "../model";
import { classifyActivity, classifyFromSpeed } from "./activity-classifier";
import { haversineMeters } from "./distance-calculator";
import { DEFAULT_SEGMENTER_CONFIG, type SegmenterConfig } from "./segmenter-config";

interface SegmentCandidate {
  points: RawLocationSample[];
  type: SegmentType;
}

function timestampMs(value: string): number {
  return new Date(value).getTime();
}

function durationSeconds(points: RawLocationSample[]): number {
  if (points.length === 0) {
    return 0;
  }

  return Math.max(0, (timestampMs(points[points.length - 1].timestamp) - timestampMs(points[0].timestamp)) / 1000);
}

function sortLocations(locations: RawLocationSample[]): RawLocationSample[] {
  return [...locations].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function sortActivities(activities: RawActivitySample[]): RawActivitySample[] {
  return [...activities].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function findNearestActivity(
  location: RawLocationSample,
  activities: RawActivitySample[],
  maxGapS: number,
): RawActivitySample | null {
  if (activities.length === 0) {
    return null;
  }

  const targetMs = timestampMs(location.timestamp);
  let lo = 0;
  let hi = activities.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;

    if (timestampMs(activities[mid].timestamp) < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  const candidates = [activities[lo - 1], activities[lo]].filter(
    (activity): activity is RawActivitySample => activity !== undefined,
  );
  let nearest: { activity: RawActivitySample; gapS: number } | null = null;

  for (const activity of candidates) {
    const gapS = Math.abs((timestampMs(activity.timestamp) - targetMs) / 1000);

    if (gapS <= maxGapS && (!nearest || gapS < nearest.gapS)) {
      nearest = { activity, gapS };
    }
  }

  return nearest?.activity ?? null;
}

function getDominantActivityType(activity: RawActivitySample): number {
  return activity.results.reduce(
    (best, current) => (current.confidence > best.confidence ? current : best),
    { activityType: 4, confidence: -1 },
  ).activityType;
}

function smoothTypes(types: SegmentType[], halfWindow: number): SegmentType[] {
  if (halfWindow === 0 || types.length <= 1) {
    return types;
  }

  return types.map((current, index) => {
    const from = Math.max(0, index - halfWindow);
    const to = Math.min(types.length - 1, index + halfWindow);
    const counts = new Map<SegmentType, number>();

    for (const type of types.slice(from, to + 1)) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    const maxCount = Math.max(...counts.values());
    const winners = Array.from(counts.entries()).filter(([, count]) => count === maxCount);

    return winners.length === 1 ? winners[0][0] : current;
  });
}

function buildCandidates(locations: RawLocationSample[], types: SegmentType[]): SegmentCandidate[] {
  if (locations.length === 0) {
    return [];
  }

  const candidates: SegmentCandidate[] = [];
  let currentType = types[0];
  let currentPoints: RawLocationSample[] = [locations[0]];

  for (let index = 1; index < locations.length; index += 1) {
    if (types[index] === currentType) {
      currentPoints.push(locations[index]);
    } else {
      candidates.push({ points: currentPoints, type: currentType });
      currentType = types[index];
      currentPoints = [locations[index]];
    }
  }

  candidates.push({ points: currentPoints, type: currentType });
  return candidates;
}

function coalesceSameType(candidates: SegmentCandidate[]): SegmentCandidate[] {
  const result: SegmentCandidate[] = [];

  for (const candidate of candidates) {
    const previous = result[result.length - 1];

    if (previous && previous.type === candidate.type) {
      previous.points = [...previous.points, ...candidate.points];
    } else {
      result.push({ points: [...candidate.points], type: candidate.type });
    }
  }

  return result;
}

function mergeMicrosegments(candidates: SegmentCandidate[], minDurationS: number): SegmentCandidate[] {
  const next = candidates.map((candidate) => ({ points: [...candidate.points], type: candidate.type }));

  if (next.length <= 1) {
    return next;
  }

  let changed = true;

  while (changed) {
    changed = false;
    const shortIndex = next.findIndex((candidate) => durationSeconds(candidate.points) < minDurationS);

    if (shortIndex === -1) {
      break;
    }

    const leftIndex = shortIndex - 1;
    const rightIndex = shortIndex + 1 < next.length ? shortIndex + 1 : -1;
    const mergeIntoIndex =
      leftIndex < 0
        ? rightIndex
        : rightIndex < 0
        ? leftIndex
        : durationSeconds(next[leftIndex].points) >= durationSeconds(next[rightIndex].points)
        ? leftIndex
        : rightIndex;

    if (mergeIntoIndex < 0) {
      break;
    }

    const short = next[shortIndex];
    const target = next[mergeIntoIndex];
    const mergedPoints =
      mergeIntoIndex < shortIndex
        ? [...target.points, ...short.points]
        : [...short.points, ...target.points];

    next[mergeIntoIndex] = { points: mergedPoints, type: target.type };
    next.splice(shortIndex, 1);
    changed = true;
  }

  return next;
}

function trimBoundaryEdgeSegments(candidates: SegmentCandidate[]): SegmentCandidate[] {
  const next = [...candidates];
  const edgeTypes = new Set<SegmentType>(["stationary", "unknown"]);

  while (next.length > 1 && edgeTypes.has(next[next.length - 1].type)) {
    next.pop();
  }

  while (next.length > 1 && edgeTypes.has(next[0].type)) {
    next.shift();
  }

  return next;
}

function resolveUnknownByContext(candidates: SegmentCandidate[]): SegmentCandidate[] {
  return candidates.map((candidate, index) => {
    if (candidate.type !== "unknown") {
      return candidate;
    }

    const previous = candidates[index - 1]?.type;
    const next = candidates[index + 1]?.type;

    return previous && previous === next ? { ...candidate, type: previous } : candidate;
  });
}

function redistributeStationaryPoints(candidates: SegmentCandidate[]): SegmentCandidate[] {
  const next = candidates.map((candidate) => ({ points: [...candidate.points], type: candidate.type }));

  for (let index = 0; index < next.length; index += 1) {
    const candidate = next[index];

    if (candidate.type !== "stationary" || candidate.points.length <= 1) {
      continue;
    }

    const previousIndex = index - 1;
    const nextIndex = index + 1;

    if (previousIndex < 0 || nextIndex >= next.length) {
      continue;
    }

    const anchor = candidate.points.reduce((best, current) =>
      (current.accuracyM ?? Number.MAX_VALUE) < (best.accuracyM ?? Number.MAX_VALUE) ? current : best,
    );
    const anchorIndex = candidate.points.indexOf(anchor);
    const before = candidate.points.slice(0, anchorIndex);
    const after = candidate.points.slice(anchorIndex + 1);

    if (before.length > 0) {
      next[previousIndex] = {
        ...next[previousIndex],
        points: [...next[previousIndex].points, ...before],
      };
    }

    if (after.length > 0) {
      next[nextIndex] = {
        ...next[nextIndex],
        points: [...after, ...next[nextIndex].points],
      };
    }

    next[index] = { points: [anchor], type: "stationary" };
  }

  return next;
}

function calculateSegmentDistance(points: RawLocationSample[], config: SegmenterConfig): number | null {
  if (points.length < 2) {
    return null;
  }

  let distanceM = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const previousAccuracy = previous.accuracyM ?? 0;
    const currentAccuracy = current.accuracyM ?? 0;

    if (previousAccuracy > config.maxAccuracyForDistanceM || currentAccuracy > config.maxAccuracyForDistanceM) {
      continue;
    }

    distanceM += haversineMeters(previous.latitude, previous.longitude, current.latitude, current.longitude);
  }

  return distanceM;
}

export function segmentTrip(
  input: {
    activities: RawActivitySample[];
    locations: RawLocationSample[];
    tripId: string;
  },
  config: SegmenterConfig = DEFAULT_SEGMENTER_CONFIG,
): SegmentCore[] {
  if (input.locations.length === 0) {
    return [];
  }

  const locations = sortLocations(input.locations);
  const activities = sortActivities(input.activities);
  const provisionalTypes = locations.map((location) => {
    const nearestActivity = findNearestActivity(location, activities, config.maxActivityGapS);

    if (nearestActivity) {
      return classifyActivity(getDominantActivityType(nearestActivity), location.speedMps, config);
    }

    return classifyFromSpeed(location.speedMps, config);
  });
  const smoothedTypes = smoothTypes(provisionalTypes, config.smoothingWindowHalf);
  let candidates = buildCandidates(locations, smoothedTypes);

  candidates = mergeMicrosegments(candidates, config.minSegmentDurationS);
  candidates = coalesceSameType(candidates);
  candidates = trimBoundaryEdgeSegments(candidates);
  candidates = resolveUnknownByContext(candidates);
  candidates = coalesceSameType(candidates);
  candidates = redistributeStationaryPoints(candidates);

  return candidates.map((candidate, index) => ({
    distanceM: calculateSegmentDistance(candidate.points, config),
    endedAt: candidate.points[candidate.points.length - 1].timestamp,
    index,
    segmentType: candidate.type,
    startedAt: candidate.points[0].timestamp,
    tripId: input.tripId,
  }));
}
