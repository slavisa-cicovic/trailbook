import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

import type { Waypoint, WaypointAttachment } from "../../domain/trips";
import {
  getVisibleAttachmentsForWaypoints,
  getVisibleTrips,
  getVisibleWaypointsForTrip,
  markWaypointAttachmentDeleted,
} from "../../services/trips/trips-management.service";
import { useSessionStore } from "../../state/session-store";
import {
  setWaypointAttachments,
  useWaypointAttachmentsStore,
} from "../../state/waypoint-attachments-store";
import { useTripsStore } from "../../state/trips-store";
import { useWaypointsStore } from "../../state/waypoints-store";
import WaypointPhotoViewerScreen from "./components/waypoint-photo-viewer-screen";

export default function TripWaypointPhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    attachmentId?: string | string[];
    tripId?: string | string[];
    waypointId?: string | string[];
  }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const trips = useTripsStore((state) => state.trips);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const resolvedAttachmentId = Array.isArray(params.attachmentId) ? params.attachmentId[0] : params.attachmentId;
  const resolvedTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const resolvedWaypointId = Array.isArray(params.waypointId) ? params.waypointId[0] : params.waypointId;

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  const currentUserTrips = trips.filter((trip) => trip.userId === identitySession.userId);
  const currentUserWaypoints = waypoints.filter((waypoint) => waypoint.userId === identitySession.userId);
  const currentUserWaypointAttachments = waypointAttachments.filter(
    (attachment) => attachment.userId === identitySession.userId,
  );
  const selectedTrip = getVisibleTrips(currentUserTrips).find((trip) => trip.localId === resolvedTripId) ?? null;
  const tripWaypoints = selectedTrip ? getVisibleWaypointsForTrip(currentUserWaypoints, selectedTrip.localId) : [];
  const selectedWaypoint =
    tripWaypoints.find((waypoint) => waypoint.localId === resolvedWaypointId) ?? null;
  const attachments = selectedWaypoint
    ? getVisibleAttachmentsForWaypoints(currentUserWaypointAttachments, [selectedWaypoint.localId]).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
    : [];
  const selectedWaypointIndex = selectedWaypoint
    ? tripWaypoints.findIndex((waypoint) => waypoint.localId === selectedWaypoint.localId)
    : -1;
  const previousPhotoWaypoint = findWaypointWithPhotos(
    tripWaypoints.slice(0, selectedWaypointIndex).reverse(),
    currentUserWaypointAttachments,
  );
  const nextPhotoWaypoint = findWaypointWithPhotos(
    tripWaypoints.slice(selectedWaypointIndex + 1),
    currentUserWaypointAttachments,
  );

  if (!selectedTrip || !selectedWaypoint || attachments.length === 0) {
    return <Redirect href={`/trips/${resolvedTripId}/waypoints/${resolvedWaypointId}`} />;
  }

  async function handleRemoveCurrentPhoto(attachmentLocalId: string) {
    const currentIndex = attachments.findIndex((attachment) => attachment.localId === attachmentLocalId);
    const fallbackAttachment = attachments[currentIndex + 1] ?? attachments[currentIndex - 1] ?? null;

    await setWaypointAttachments(
      markWaypointAttachmentDeleted(waypointAttachments, attachmentLocalId, new Date().toISOString()),
    );

    if (fallbackAttachment) {
      router.replace(
        `/trips/${resolvedTripId}/waypoints/${resolvedWaypointId}/photos/${fallbackAttachment.localId}`,
      );
      return;
    }

    router.back();
  }

  function navigateToWaypointPhoto(waypoint: Waypoint | null, boundary: "first" | "last") {
    if (!waypoint) {
      return;
    }

    const waypointPhotos = getWaypointPhotos(currentUserWaypointAttachments, waypoint.localId);
    const waypointPhoto = boundary === "first" ? waypointPhotos[0] : waypointPhotos[waypointPhotos.length - 1];

    if (!waypointPhoto) {
      return;
    }

    router.replace(`/trips/${resolvedTripId}/waypoints/${waypoint.localId}/photos/${waypointPhoto.localId}`);
  }

  return (
    <WaypointPhotoViewerScreen
      attachments={attachments}
      hasNextGroup={nextPhotoWaypoint !== null}
      hasPreviousGroup={previousPhotoWaypoint !== null}
      onBack={() => router.back()}
      onRemoveCurrent={(attachmentLocalId) => void handleRemoveCurrentPhoto(attachmentLocalId)}
      onScrollPastEnd={() => navigateToWaypointPhoto(nextPhotoWaypoint, "first")}
      onScrollPastStart={() => navigateToWaypointPhoto(previousPhotoWaypoint, "last")}
      selectedAttachmentId={resolvedAttachmentId ?? null}
      waypointTitle={selectedWaypoint.title}
    />
  );
}

function findWaypointWithPhotos(
  waypoints: Waypoint[],
  waypointAttachments: WaypointAttachment[],
): Waypoint | null {
  return waypoints.find((waypoint) => getWaypointPhotos(waypointAttachments, waypoint.localId).length > 0) ?? null;
}

function getWaypointPhotos(
  waypointAttachments: WaypointAttachment[],
  waypointLocalId: string,
): WaypointAttachment[] {
  return getVisibleAttachmentsForWaypoints(waypointAttachments, [waypointLocalId]).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}
