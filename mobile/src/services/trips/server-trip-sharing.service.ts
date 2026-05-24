import type { SharedTripDetail, SharedTripSummary } from "../../domain/shared-trips";
import type { OwnedServerTripDetail, OwnedServerTripSummary } from "../../domain/server-trips";
import type { TripDiagnostics } from "../../domain/trip-diagnostics";
import type { Trip, TripPoint, TripSegment, Waypoint, WaypointAttachment } from "../../domain/trips";
import { BackendRequestError } from "../api/mobile-api.service";
import { getSessionStateSnapshot, refreshActiveIdentitySessionIfPossible } from "../../state/session-store";
import { getTripDiagnosticsForSync, isTripDiagnosticsEnabled } from "../trip-points/trip-points.service";
import {
  loadTripSegmentStatsByTripLocalIds,
  loadTripStatsByTripLocalIds,
} from "../../storage/trip-points-storage";
import {
  assignMissingTripPointSegments,
  finalizeEndedTripSegments,
  recoverSegmentlessTripSections,
} from "../trip-segments/trip-segments.service";

const TRIP_POINTS_SYNC_BATCH_SIZE = 500;

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001/api";
}

async function request<T>(path: string, sessionToken: string, init?: RequestInit) {
  try {
    return await requestWithToken<T>(path, sessionToken, init);
  } catch (error) {
    if (!(error instanceof BackendRequestError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }

    const refreshedSession = await refreshActiveIdentitySessionIfPossible();
    const latestToken = refreshedSession?.sessionToken ?? getSessionStateSnapshot().identitySession?.sessionToken;

    if (!latestToken || latestToken === sessionToken) {
      throw error;
    }

    return requestWithToken<T>(path, latestToken, init);
  }
}

async function requestFormData<T>(
  path: string,
  sessionToken: string,
  body: FormData,
) {
  try {
    return await requestFormDataWithToken<T>(path, sessionToken, body);
  } catch (error) {
    if (!(error instanceof BackendRequestError) || (error.status !== 401 && error.status !== 403)) {
      throw error;
    }

    const refreshedSession = await refreshActiveIdentitySessionIfPossible();
    const latestToken = refreshedSession?.sessionToken ?? getSessionStateSnapshot().identitySession?.sessionToken;

    if (!latestToken || latestToken === sessionToken) {
      throw error;
    }

    return requestFormDataWithToken<T>(path, latestToken, body);
  }
}

async function requestWithToken<T>(path: string, sessionToken: string, init?: RequestInit) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } & T | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new BackendRequestError(message || `Request failed with status ${response.status}`, response.status);
  }

  return (payload || {}) as T;
}

async function requestFormDataWithToken<T>(
  path: string,
  sessionToken: string,
  body: FormData,
) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body,
  });

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } & T | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new BackendRequestError(message || `Request failed with status ${response.status}`, response.status);
  }

  return (payload || {}) as T;
}

function toTripPointSyncPayload(point: TripPoint) {
  return {
    localId: point.localId,
    segmentLocalId: point.segmentLocalId,
    latitude: point.latitude,
    longitude: point.longitude,
    recordedAt: point.recordedAt,
    accuracy: point.accuracy,
    altitude: point.altitude,
    speed: point.speed,
  };
}

function chunkItems<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

async function buildTripStatsSyncPayload(input: {
  trip: Trip;
  tripSegments: TripSegment[];
}) {
  const [tripStatsById, segmentStatsById] = await Promise.all([
    loadTripStatsByTripLocalIds([input.trip.localId]),
    loadTripSegmentStatsByTripLocalIds([input.trip.localId]),
  ]);
  const tripStats = tripStatsById.get(input.trip.localId);
  const segmentStats = input.tripSegments
    .map((segment) => {
      const stats = segmentStatsById.get(segment.localId);

      if (!stats) {
        return null;
      }

      return {
        segmentLocalId: segment.localId,
        distanceMeters: stats.distance_meters,
        durationMs: stats.duration_ms,
        pointCount: stats.point_count,
        updatedAt: stats.updated_at,
      };
    })
    .filter((stats): stats is NonNullable<typeof stats> => stats !== null);
  const segmentDistanceMeters = segmentStats.reduce((total, stats) => total + stats.distanceMeters, 0);
  const segmentPointCount = segmentStats.reduce((total, stats) => total + stats.pointCount, 0);
  const segmentUpdatedAt = segmentStats.reduce<string | null>(
    (latest, stats) => (!latest || stats.updatedAt > latest ? stats.updatedAt : latest),
    null,
  );
  const shouldUseSegmentStatsForTrip =
    segmentStats.length > 0 &&
    segmentPointCount > 0 &&
    (!tripStats || (tripStats.point_count === 0 && segmentPointCount > 0));

  return {
    tripStats: shouldUseSegmentStatsForTrip
      ? {
          distanceMeters: segmentDistanceMeters,
          pointCount: segmentPointCount,
          updatedAt: segmentUpdatedAt ?? input.trip.updatedAt,
        }
      : tripStats
      ? {
          distanceMeters: tripStats.distance_meters,
          pointCount: tripStats.point_count,
          updatedAt: tripStats.updated_at,
        }
      : null,
    segmentStats,
  };
}

export async function syncTripStatsToServer(
  sessionToken: string,
  input: {
    trip: Trip;
    tripSegments: TripSegment[];
  },
) {
  if (!input.trip.serverId) {
    throw new Error("Trip must be synced before stats can be sent.");
  }

  const statsPayload = await buildTripStatsSyncPayload(input);

  return request<{ segmentStatsUpdated: number; syncedAt: string; tripId: string; tripLocalId: string }>(
    `/trips/${input.trip.serverId}/stats/sync`,
    sessionToken,
    {
      method: "POST",
      body: JSON.stringify(statsPayload),
    },
  );
}

export async function syncTripToServer(
  sessionToken: string,
  input: {
    attachments: WaypointAttachment[];
    trip: Trip;
    tripPoints: TripPoint[];
    tripSegments: TripSegment[];
    waypoints: Waypoint[];
  },
) {
  const recoveredState = recoverSegmentlessTripSections(input.trip, input.tripSegments, input.tripPoints);
  const tripPointsWithAssignedSegments = assignMissingTripPointSegments(
    recoveredState.tripPoints,
    recoveredState.tripSegments,
    input.trip.localId,
  );
  const tripSegments =
    input.trip.endedAt === null
      ? recoveredState.tripSegments
      : finalizeEndedTripSegments(
          recoveredState.tripSegments,
          tripPointsWithAssignedSegments,
          input.trip.localId,
          input.trip.endedAt,
        );
  const tripPoints = assignMissingTripPointSegments(tripPointsWithAssignedSegments, tripSegments, input.trip.localId);
  const diagnostics =
    isTripDiagnosticsEnabled() ? await getTripDiagnosticsForSync(input.trip.localId) : null;

  const diagnosticsPayload: {
    accepted: TripDiagnostics["accepted"];
    acceptedAfterLongGap: TripDiagnostics["acceptedAfterLongGap"];
    accuracyHistogram: TripDiagnostics["accuracyHistogram"];
    backgroundAccepted: TripDiagnostics["backgroundAccepted"];
    backgroundCallbacks: TripDiagnostics["backgroundCallbacks"];
    backgroundRejected: TripDiagnostics["backgroundRejected"];
    callbackCount: TripDiagnostics["callbackCount"];
    decisionCount: TripDiagnostics["decisionCount"];
    duplicateCoordinates: TripDiagnostics["duplicateCoordinates"];
    duplicateTimestamp: TripDiagnostics["duplicateTimestamp"];
    foregroundAccepted: TripDiagnostics["foregroundAccepted"];
    foregroundCallbacks: TripDiagnostics["foregroundCallbacks"];
    foregroundRejected: TripDiagnostics["foregroundRejected"];
    maxCallbackGapMs: TripDiagnostics["maxCallbackGapMs"];
    maxRecordedGapMs: TripDiagnostics["maxRecordedGapMs"];
    platform: TripDiagnostics["platform"];
    recentEvents: TripDiagnostics["recentEvents"];
    recordingMode: TripDiagnostics["recordingMode"];
    rejectedByAccuracy: TripDiagnostics["rejectedByAccuracy"];
    rejectedByImpliedSpeed: TripDiagnostics["rejectedByImpliedSpeed"];
    rejectedByJumpDistance: TripDiagnostics["rejectedByJumpDistance"];
    rejectedByMinMovement: TripDiagnostics["rejectedByMinMovement"];
    sessionDuplicateRecordedAt: TripDiagnostics["sessionDuplicateRecordedAt"];
    updatedAt: TripDiagnostics["updatedAt"];
  } | null = diagnostics
      ? {
        accepted: diagnostics.accepted,
        acceptedAfterLongGap: diagnostics.acceptedAfterLongGap,
        accuracyHistogram: diagnostics.accuracyHistogram,
        backgroundAccepted: diagnostics.backgroundAccepted,
        backgroundCallbacks: diagnostics.backgroundCallbacks,
        backgroundRejected: diagnostics.backgroundRejected,
        callbackCount: diagnostics.callbackCount,
        decisionCount: diagnostics.decisionCount,
        duplicateCoordinates: diagnostics.duplicateCoordinates,
        duplicateTimestamp: diagnostics.duplicateTimestamp,
        foregroundAccepted: diagnostics.foregroundAccepted,
        foregroundCallbacks: diagnostics.foregroundCallbacks,
        foregroundRejected: diagnostics.foregroundRejected,
        maxCallbackGapMs: diagnostics.maxCallbackGapMs,
        maxRecordedGapMs: diagnostics.maxRecordedGapMs,
        platform: diagnostics.platform,
        recentEvents: diagnostics.recentEvents,
        recordingMode: diagnostics.recordingMode,
        rejectedByAccuracy: diagnostics.rejectedByAccuracy,
        rejectedByImpliedSpeed: diagnostics.rejectedByImpliedSpeed,
        rejectedByJumpDistance: diagnostics.rejectedByJumpDistance,
        rejectedByMinMovement: diagnostics.rejectedByMinMovement,
        sessionDuplicateRecordedAt: diagnostics.sessionDuplicateRecordedAt,
        updatedAt: diagnostics.updatedAt,
      }
    : null;

  const response = await request<{ syncedAt: string; tripId: string; tripLocalId: string }>("/trips/sync", sessionToken, {
    method: "POST",
    body: JSON.stringify({
      localId: input.trip.localId,
      deviceId: input.trip.deviceId,
      title: input.trip.title,
      description: input.trip.description,
      recordingProfile: input.trip.recordingProfile,
      recordingConfig: input.trip.recordingConfig,
      batteryStartLevelPercent: input.trip.batteryStartLevelPercent,
      batteryStartState: input.trip.batteryStartState,
      batteryEndLevelPercent: input.trip.batteryEndLevelPercent,
      batteryEndState: input.trip.batteryEndState,
      startedAt: input.trip.startedAt,
      endedAt: input.trip.endedAt,
      createdAt: input.trip.createdAt,
      updatedAt: input.trip.updatedAt,
      deletedAt: input.trip.deletedAt,
      diagnostics: diagnosticsPayload,
      attachments: input.attachments.map((attachment) => ({
        localId: attachment.localId,
        waypointLocalId: attachment.waypointLocalId,
        type: attachment.type,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        createdAt: attachment.createdAt,
        updatedAt: attachment.updatedAt,
        deletedAt: attachment.deletedAt,
      })),
      segments: tripSegments.map((segment) => ({
        localId: segment.localId,
        recordingProfile: segment.recordingProfile,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        createdAt: segment.createdAt,
        updatedAt: segment.updatedAt,
      })),
      points: [],
      waypoints: input.waypoints.map((waypoint) => ({
        localId: waypoint.localId,
        segmentLocalId: waypoint.segmentLocalId,
        category: waypoint.category,
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
        title: waypoint.title,
        note: waypoint.note,
        createdAt: waypoint.createdAt,
        updatedAt: waypoint.updatedAt,
        deletedAt: waypoint.deletedAt,
      })),
    }),
  });

  const orderedTripPoints = [...tripPoints].sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));

  for (const tripPointChunk of chunkItems(orderedTripPoints, TRIP_POINTS_SYNC_BATCH_SIZE)) {
    await request<{ accepted: number; syncedAt: string; tripId: string; tripLocalId: string }>(
      `/trips/${response.tripId}/points/sync`,
      sessionToken,
      {
        method: "POST",
        body: JSON.stringify({
          points: tripPointChunk.map(toTripPointSyncPayload),
        }),
      },
    );
  }

  await request<{ segmentStatsUpdated: number; syncedAt: string; tripId: string; tripLocalId: string }>(
    `/trips/${response.tripId}/stats/sync`,
    sessionToken,
    {
      method: "POST",
      body: JSON.stringify(await buildTripStatsSyncPayload({ trip: input.trip, tripSegments })),
    },
  );

  return response;
}

export async function uploadTripAttachmentToServer(
  sessionToken: string,
  tripId: string,
  input: {
    attachmentLocalId: string;
    localUri: string;
    mimeType: string | null;
  },
) {
  const formData = new FormData();
  formData.append("attachmentLocalId", input.attachmentLocalId);
  formData.append(
    "file",
    {
      uri: input.localUri,
      name: `${input.attachmentLocalId}.jpg`,
      type: input.mimeType || "image/jpeg",
    } as never,
  );

  return requestFormData<{ attachmentId: string; attachmentLocalId: string; waypointId: string }>(
    `/trips/${tripId}/attachments/upload`,
    sessionToken,
    formData,
  );
}

export async function listOwnedTripsFromServer(sessionToken: string) {
  return request<{ trips: OwnedServerTripSummary[] }>("/trips/mine", sessionToken, {
    method: "GET",
  });
}

export async function getOwnedTripFromServer(sessionToken: string, tripId: string) {
  return request<{ trip: OwnedServerTripDetail }>(`/trips/mine/${tripId}`, sessionToken, {
    method: "GET",
  });
}

export function buildTripAttachmentContentUrl(sessionToken: string, attachmentId: string) {
  return `${getApiBaseUrl()}/trips/attachments/${attachmentId}/content?token=${encodeURIComponent(sessionToken)}`;
}

export async function shareTripWithRecipient(sessionToken: string, tripId: string, recipientEmail: string) {
  return request<{
    recipient: { displayName: string; email: string; id: string };
    shareId: string;
    status: "active" | "revoked";
    tripId: string;
  }>(`/trips/${tripId}/shares`, sessionToken, {
    method: "POST",
    body: JSON.stringify({ recipientEmail }),
  });
}

export async function listTripShares(sessionToken: string, tripId: string) {
  return request<{
    shares: Array<{
      createdAt: string;
      id: string;
      recipient: { displayName: string; email: string; id: string };
      revokedAt: string | null;
      status: "active" | "revoked";
    }>;
  }>(`/trips/${tripId}/shares`, sessionToken, { method: "GET" });
}

export async function listShareRecipients(sessionToken: string) {
  return request<{
    recipients: Array<{
      displayName: string;
      email: string;
      id: string;
    }>;
  }>("/trips/shares/recipients", sessionToken, { method: "GET" });
}

export async function listSharedTrips(sessionToken: string) {
  return request<{ sharedTrips: SharedTripSummary[] }>("/trips/shared/list", sessionToken, {
    method: "GET",
  });
}

export async function getSharedTrip(sessionToken: string, shareId: string) {
  return request<SharedTripDetail>(`/trips/shared/${shareId}`, sessionToken, {
    method: "GET",
  });
}
