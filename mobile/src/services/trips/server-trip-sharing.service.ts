import type { SharedTripDetail, SharedTripSummary } from "../../domain/shared-trips";
import type { Trip, TripPoint, TripSegment, Waypoint, WaypointAttachment } from "../../domain/trips";

export function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_API_BASE_URL || "http://localhost:3001/api";
}

async function request<T>(path: string, sessionToken: string, init?: RequestInit) {
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
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return (payload || {}) as T;
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
  return request<{ syncedAt: string; tripId: string; tripLocalId: string }>("/trips/sync", sessionToken, {
    method: "POST",
    body: JSON.stringify({
      localId: input.trip.localId,
      deviceId: input.trip.deviceId,
      title: input.trip.title,
      description: input.trip.description,
      recordingProfile: input.trip.recordingProfile,
      startedAt: input.trip.startedAt,
      endedAt: input.trip.endedAt,
      createdAt: input.trip.createdAt,
      updatedAt: input.trip.updatedAt,
      deletedAt: input.trip.deletedAt,
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
      segments: input.tripSegments.map((segment) => ({
        localId: segment.localId,
        recordingProfile: segment.recordingProfile,
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        createdAt: segment.createdAt,
        updatedAt: segment.updatedAt,
      })),
      points: input.tripPoints.map((point) => ({
        localId: point.localId,
        segmentLocalId: point.segmentLocalId,
        latitude: point.latitude,
        longitude: point.longitude,
        recordedAt: point.recordedAt,
        accuracy: point.accuracy,
        altitude: point.altitude,
        speed: point.speed,
      })),
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

  const response = await fetch(`${getApiBaseUrl()}/trips/${tripId}/attachments/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    body: formData,
  });

  const payload = (await response.json().catch(() => null)) as
    | { attachmentId: string; attachmentLocalId: string; waypointId: string; message?: string | string[] }
    | null;

  if (!response.ok) {
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return payload as { attachmentId: string; attachmentLocalId: string; waypointId: string };
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
