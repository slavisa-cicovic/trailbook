import type { TripGroupWithMembers } from '@/core/domain/model/tripGroup';
import type { TripWithMeta } from './tripsStore';

export type GroupTripSort = 'newest' | 'oldest' | 'title';

export const GROUP_TRIP_SORTS: Array<{ key: GroupTripSort; label: string }> = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'title', label: 'Title' },
];

export function normalizeGroupTripSort(value: string | string[] | undefined): GroupTripSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'oldest' || raw === 'title' ? raw : 'newest';
}

export function sortGroupTrips(
  group: TripGroupWithMembers | undefined,
  tripsById: Map<string, TripWithMeta>,
  sort: GroupTripSort,
): TripWithMeta[] {
  if (!group) return [];
  const trips = group.members
    .map((member) => tripsById.get(member.tripClientId))
    .filter((trip): trip is TripWithMeta => Boolean(trip));

  return trips.sort((left, right) => {
    if (sort === 'title') return left.trip.title.localeCompare(right.trip.title);
    const delta = left.trip.startedAt.getTime() - right.trip.startedAt.getTime();
    return sort === 'oldest' ? delta : -delta;
  });
}

export function groupTripHref(
  clientTripId: string,
  groupId: string | null | undefined,
  groupSort: GroupTripSort | null | undefined,
): string {
  if (!groupId || !groupSort) return `/trips/${clientTripId}`;
  return `/trips/${clientTripId}?groupId=${encodeURIComponent(groupId)}&groupSort=${groupSort}`;
}

export function waypointHref(
  waypointId: string,
  groupId: string | null | undefined,
  groupSort: GroupTripSort | null | undefined,
  tripContextId?: string | null,
): string {
  const params: string[] = [];
  if (groupId && groupSort) {
    params.push(`groupId=${encodeURIComponent(groupId)}`);
    params.push(`groupSort=${groupSort}`);
  }
  if (tripContextId) params.push(`tripContextId=${encodeURIComponent(tripContextId)}`);
  const suffix = params.join('&');
  return `/waypoint/${waypointId}${suffix ? `?${suffix}` : ''}`;
}

export function waypointPhotoHref(
  waypointId: string,
  imageId: string,
  groupId: string | null | undefined,
  groupSort: GroupTripSort | null | undefined,
  transition?: 'next' | 'previous',
): string {
  const params: string[] = [];
  if (groupId && groupSort) {
    params.push(`groupId=${encodeURIComponent(groupId)}`);
    params.push(`groupSort=${groupSort}`);
  }
  if (transition) params.push(`transition=${transition}`);
  const suffix = params.join('&');
  return `/waypoint/${waypointId}/photo/${imageId}${suffix ? `?${suffix}` : ''}`;
}
