import type { SegmentType } from '../model/segment';
import type { ClassifiedInterval } from './types';
import { V1 } from './types';

interface RawSegment {
  startTime: Date;
  endTime: Date;
  type: SegmentType;
}

function minDurationMs(type: SegmentType): number {
  switch (type) {
    case 'WALK':        return V1.minWalkDurationMs;
    case 'DRIVE':       return V1.minDriveDurationMs;
    case 'BIKE':        return V1.minBikeDurationMs;
    case 'STATIONARY':  return V1.minStationaryDurationMs;
    default:            return V1.minWalkDurationMs;
  }
}

export function detectSegments(intervals: ClassifiedInterval[]): RawSegment[] {
  if (!intervals.length) return [];

  // Step 1: split on GPS gaps > 5 min
  const withGaps: ClassifiedInterval[][] = [];
  let current: ClassifiedInterval[] = [intervals[0]];

  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1];
    const curr = intervals[i];
    const gap = curr.startTime.getTime() - prev.endTime.getTime();
    if (gap > V1.gapSplitThresholdMs) {
      withGaps.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  withGaps.push(current);

  const raw: RawSegment[] = [];

  for (const group of withGaps) {
    // Merge consecutive same-type intervals within a gap-free group
    const merged: RawSegment[] = [];
    for (const iv of group) {
      const last = merged[merged.length - 1];
      if (last && last.type === iv.type) {
        last.endTime = iv.endTime;
      } else {
        merged.push({ startTime: iv.startTime, endTime: iv.endTime, type: iv.type });
      }
    }

    // Apply minimum duration — absorb short segments into longest neighbour
    const filtered: RawSegment[] = [];
    for (const seg of merged) {
      const durationMs = seg.endTime.getTime() - seg.startTime.getTime();
      if (durationMs >= minDurationMs(seg.type)) {
        filtered.push(seg);
      } else {
        // Absorb: extend previous or next segment
        const prev = filtered[filtered.length - 1];
        if (prev) {
          prev.endTime = seg.endTime;
        }
        // If no previous, the short segment is dropped (start of trip noise)
      }
    }

    raw.push(...filtered);
  }

  return raw;
}
