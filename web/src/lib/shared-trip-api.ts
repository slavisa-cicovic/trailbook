import { getApiBaseUrl } from "./api-base-url";

export interface SharedTripData {
  bundle: {
    trip: {
      clientTripId: string;
      title: string;
      description?: string | null;
      startedAt: string;
      endedAt?: string | null;
      status: string;
      processingVersion: number;
    };
    raw: {
      locations: Array<{
        timestamp: string;
        latitude: number;
        longitude: number;
        accuracyM?: number | null;
        altitudeM?: number | null;
        speedMps?: number | null;
        bearingDeg?: number | null;
        provider: string;
      }>;
    };
    waypoints: Array<{
      id: string;
      tripId: string;
      title: string;
      description?: string | null;
      category: string;
      latitude: number;
      longitude: number;
      createdAt: string;
      updatedAt: string;
    }>;
    segments: Array<{
      index: number;
      segmentType: string;
      startedAt: string;
      endedAt: string;
      distanceM?: number | null;
    }>;
  };
  imagesByWaypointId: Record<
    string,
    Array<{
      getUrl: string;
      imageId: string;
      objectKey: string;
    }>
  >;
}

export async function getSharedTrip(token: string, pin: string): Promise<SharedTripData> {
  const response = await fetch(
    `${getApiBaseUrl()}/shared/trips/${encodeURIComponent(token)}/access`,
    {
      body: JSON.stringify({ pin }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || `Shared trip request failed with status ${response.status}`);
  }

  return (await response.json()) as SharedTripData;
}
