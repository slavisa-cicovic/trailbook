import {
  DEFAULT_RECORDING_PROFILE,
  getRecordingProfileColor,
  getRecordingProfileLabel,
} from "../../constants/recording-profiles";
import type { RecordingProfile, Trip, TripPoint, TripSegment } from "../../domain/trips";
import { calculateTripDistanceMeters, getVisibleTripPointsForTrip } from "../trip-points/trip-points.service";
import { formatDurationSummary } from "../trips/trips-management.service";

export interface TripSegmentSummary {
  distanceMeters: number;
  durationLabel: string;
  durationMs: number;
  segment: TripSegment;
}

function getSegmentDurationMs(segment: TripSegment): number {
  const startedAt = new Date(segment.startedAt).getTime();
  const endedAt = new Date(segment.endedAt ?? new Date().toISOString()).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return endedAt - startedAt;
}

export interface SegmentPolyline {
  color: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  segmentLocalId: string;
}

export function createInitialTripSegment(trip: Trip, startedAt: string): TripSegment {
  return {
    localId: `trip-segment-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile: trip.recordingProfile,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: "local-only",
  };
}

export function closeActiveTripSegment(
  tripSegments: TripSegment[],
  activeSegmentId: string,
  endedAt: string,
): TripSegment[] {
  return tripSegments.map((segment) =>
    segment.localId === activeSegmentId
      ? {
          ...segment,
          endedAt,
          updatedAt: endedAt,
          syncStatus: "pending-sync",
        }
      : segment,
  );
}

export function startNextTripSegment(
  trip: Trip,
  tripSegments: TripSegment[],
  recordingProfile: RecordingProfile,
  startedAt: string,
): { nextSegment: TripSegment; tripSegments: TripSegment[] } {
  const nextSegment: TripSegment = {
    localId: `trip-segment-${startedAt}`,
    serverId: null,
    tripLocalId: trip.localId,
    deviceId: trip.deviceId,
    userId: trip.userId,
    recordingProfile,
    startedAt,
    endedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    syncStatus: "local-only",
  };

  return {
    nextSegment,
    tripSegments: [...tripSegments, nextSegment],
  };
}

export function getVisibleTripSegmentsForTrip(
  tripSegments: TripSegment[],
  tripLocalId: string,
): TripSegment[] {
  return tripSegments
    .filter((segment) => segment.tripLocalId === tripLocalId)
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

export function getOpenTripSegmentForTrip(
  tripSegments: TripSegment[],
  tripLocalId: string,
): TripSegment | null {
  return (
    [...tripSegments]
      .reverse()
      .find((segment) => segment.tripLocalId === tripLocalId && segment.endedAt === null) ?? null
  );
}

export function buildTripSegmentsSummary(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): TripSegmentSummary[] {
  return getVisibleTripSegmentsForTrip(tripSegments, tripLocalId).map((segment) => {
    const segmentTripPoints = getVisibleTripPointsForTrip(tripPoints, tripLocalId).filter(
      (tripPoint) => tripPoint.segmentLocalId === segment.localId,
    );
    const durationMs = getSegmentDurationMs(segment);

    return {
      segment,
      distanceMeters: calculateTripDistanceMeters(segmentTripPoints),
      durationMs,
      durationLabel: formatDurationSummary(durationMs),
    };
  });
}

export function buildTripModeSummary(tripSegments: TripSegment[], tripLocalId: string): string {
  const orderedSegments = getVisibleTripSegmentsForTrip(tripSegments, tripLocalId);

  if (orderedSegments.length === 0) {
    return getRecordingProfileLabel(DEFAULT_RECORDING_PROFILE);
  }

  const categoryLabels = orderedSegments.reduce<string[]>((labels, segment) => {
    const nextLabel = getRecordingProfileLabel(segment.recordingProfile);

    if (!labels.includes(nextLabel)) {
      labels.push(nextLabel);
    }

    return labels;
  }, []);

  return categoryLabels.join(" + ");
}

export function buildSegmentPolylines(
  tripSegments: TripSegment[],
  tripPoints: TripPoint[],
  tripLocalId: string,
): SegmentPolyline[] {
  return getVisibleTripSegmentsForTrip(tripSegments, tripLocalId)
    .map((segment) => {
      const coordinates = getVisibleTripPointsForTrip(tripPoints, tripLocalId)
        .filter((tripPoint) => tripPoint.segmentLocalId === segment.localId)
        .map((tripPoint) => ({
          latitude: tripPoint.latitude,
          longitude: tripPoint.longitude,
        }));

      return {
        segmentLocalId: segment.localId,
        coordinates,
        color: getRecordingProfileColor(segment.recordingProfile),
      };
    })
    .filter((segment) => segment.coordinates.length > 1);
}
