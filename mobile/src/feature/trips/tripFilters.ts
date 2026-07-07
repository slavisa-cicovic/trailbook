import type { SegmentType } from '@/core/domain/model/segment';
import type { TripWithMeta } from './tripsStore';

export type Period = 'all' | 'today' | 'yesterday' | 'last_week';
export type SortKey = 'newest' | 'oldest' | 'distance' | 'duration';

export interface Filters {
  search: string;
  period: Period;
  activities: SegmentType[];
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  search: '',
  period: 'all',
  activities: [],
  sort: 'newest',
};

export function isDefaultTripFilters(filters: Filters) {
  return (
    filters.search === DEFAULT_FILTERS.search &&
    filters.period === DEFAULT_FILTERS.period &&
    filters.activities.length === 0 &&
    filters.sort === DEFAULT_FILTERS.sort
  );
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function applyTripFilters(trips: TripWithMeta[], filters: Filters): TripWithMeta[] {
  let result = [...trips];

  if (filters.search.trim()) {
    const query = filters.search.toLowerCase();
    result = result.filter((item) => item.trip.title.toLowerCase().includes(query));
  }

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  if (filters.period === 'today') {
    result = result.filter((item) => item.trip.startedAt >= today);
  } else if (filters.period === 'yesterday') {
    result = result.filter((item) => item.trip.startedAt >= yesterday && item.trip.startedAt < today);
  } else if (filters.period === 'last_week') {
    result = result.filter((item) => item.trip.startedAt >= lastWeek);
  }

  if (filters.activities.length > 0) {
    result = result.filter((item) =>
      item.segments.some((segment) => filters.activities.includes(segment.segmentType)),
    );
  }

  if (filters.sort === 'oldest') {
    result.sort((left, right) => left.trip.startedAt.getTime() - right.trip.startedAt.getTime());
  } else if (filters.sort === 'distance') {
    result.sort((left, right) => right.totalDistanceM - left.totalDistanceM);
  } else if (filters.sort === 'duration') {
    result.sort((left, right) => {
      const leftDuration = left.trip.endedAt
        ? left.trip.endedAt.getTime() - left.trip.startedAt.getTime()
        : 0;
      const rightDuration = right.trip.endedAt
        ? right.trip.endedAt.getTime() - right.trip.startedAt.getTime()
        : 0;
      return rightDuration - leftDuration;
    });
  } else {
    result.sort((left, right) => right.trip.startedAt.getTime() - left.trip.startedAt.getTime());
  }

  return result;
}
