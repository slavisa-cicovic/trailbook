import { Redirect, useLocalSearchParams, useRouter } from "expo-router";

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
  const selectedWaypoint = selectedTrip
    ? getVisibleWaypointsForTrip(currentUserWaypoints, selectedTrip.localId).find(
        (waypoint) => waypoint.localId === resolvedWaypointId,
      ) ?? null
    : null;
  const attachments = selectedWaypoint
    ? getVisibleAttachmentsForWaypoints(currentUserWaypointAttachments, [selectedWaypoint.localId]).sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
    : [];

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

  return (
    <WaypointPhotoViewerScreen
      attachments={attachments}
      onBack={() => router.back()}
      onRemoveCurrent={(attachmentLocalId) => void handleRemoveCurrentPhoto(attachmentLocalId)}
      selectedAttachmentId={resolvedAttachmentId ?? null}
      waypointTitle={selectedWaypoint.title}
    />
  );
}
