import type { Trip, TripPause, TripSegment } from "../../domain/trips";
import { formatDurationSummary } from "../trips/trips-management.service";
import type { TripSegmentSummary } from "../trip-segments/trip-segments.service";

export interface TripPauseTimelineEntry {
  durationLabel: string;
  durationMs: number;
  pause: TripPause;
  type: "pause";
}

export interface TripSegmentTimelineEntry {
  distanceMeters: number;
  durationLabel: string;
  durationMs: number;
  segment: TripSegment;
  type: "segment";
}

export type TripTimelineEntry = TripPauseTimelineEntry | TripSegmentTimelineEntry;

function getNextSyncStatus<T extends { syncStatus: "local-only" | "pending-sync" | "synced" | "sync-error" }>(
  entity: T,
): T["syncStatus"] {
  return entity.syncStatus === "local-only" ? "local-only" : "pending-sync";
}

function getPauseDurationMs(tripPause: TripPause, now: string): number {
  const startedAt = new Date(tripPause.startedAt).getTime();
  const endedAt = new Date(tripPause.endedAt ?? now).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return endedAt - startedAt;
}

export function createTripPause(trip: Trip, startedAt: string): TripPause {
  return {
    localId: `trip-pause-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: trip.syncStatus === "local-only" ? "local-only" : "pending-sync",
  };
}

export function getVisibleTripPausesForTrip(tripPauses: TripPause[], tripLocalId: string): TripPause[] {
  return tripPauses
    .filter((tripPause) => tripPause.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function getOpenTripPauseForTrip(tripPauses: TripPause[], tripLocalId: string): TripPause | null {
  return (
    [...tripPauses]
      .reverse()
      .find((tripPause) => tripPause.tripLocalId === tripLocalId && tripPause.endedAt === null) ?? null
  );
}

export function closeTripPause(
  tripPauses: TripPause[],
  tripPauseLocalId: string,
  endedAt: string,
): TripPause[] {
  return tripPauses.map((tripPause) =>
    tripPause.localId === tripPauseLocalId
      ? {
          ...tripPause,
          endedAt,
          updatedAt: endedAt,
          syncStatus: getNextSyncStatus(tripPause),
        }
      : tripPause,
  );
}

export function buildTripTimelineEntries(
  tripSegments: TripSegmentSummary[],
  tripPauses: TripPause[],
  now: string,
): TripTimelineEntry[] {
  const segmentEntries: TripTimelineEntry[] = tripSegments.map((tripSegment) => ({
    ...tripSegment,
    type: "segment",
  }));
  const pauseEntries: TripTimelineEntry[] = tripPauses.map((tripPause) => {
    const durationMs = getPauseDurationMs(tripPause, now);

    return {
      type: "pause",
      pause: tripPause,
      durationMs,
      durationLabel: formatDurationSummary(durationMs),
    };
  });

  return [...segmentEntries, ...pauseEntries].sort((left, right) => {
    const leftStartedAt = left.type === "segment" ? left.segment.startedAt : left.pause.startedAt;
    const rightStartedAt = right.type === "segment" ? right.segment.startedAt : right.pause.startedAt;

    return leftStartedAt.localeCompare(rightStartedAt);
  });
}
