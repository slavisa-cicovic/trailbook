import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";

import type { WaypointAttachment } from "../../domain/trips";
import type { SharedTripDetail } from "../../domain/shared-trips";
import {
  buildTripAttachmentContentUrl,
  getSharedTrip,
} from "../../services/trips/server-trip-sharing.service";
import { useSessionStore } from "../../state/session-store";
import WaypointPhotoViewerScreen from "./components/waypoint-photo-viewer-screen";

export default function SharedTripWaypointPhotoScreen() {
  const router = useRouter();
  const identitySession = useSessionStore((state) => state.identitySession);
  const params = useLocalSearchParams<{
    attachmentId?: string | string[];
    shareId?: string | string[];
    waypointId?: string | string[];
  }>();
  const resolvedAttachmentId = Array.isArray(params.attachmentId) ? params.attachmentId[0] : params.attachmentId;
  const resolvedShareId = Array.isArray(params.shareId) ? params.shareId[0] : params.shareId;
  const resolvedWaypointId = Array.isArray(params.waypointId) ? params.waypointId[0] : params.waypointId;
  const [sharedTrip, setSharedTrip] = useState<SharedTripDetail | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSharedTrip() {
      if (!identitySession?.sessionToken || !resolvedShareId) {
        return;
      }

      const nextSharedTrip = await getSharedTrip(identitySession.sessionToken, resolvedShareId);

      if (active) {
        setSharedTrip(nextSharedTrip);
      }
    }

    void loadSharedTrip();

    return () => {
      active = false;
    };
  }, [identitySession?.sessionToken, resolvedShareId]);

  const attachments = useMemo(() => {
    const sessionToken = identitySession?.sessionToken;
    const selectedWaypoint = sharedTrip?.trip.waypoints.find((waypoint) => waypoint.id === resolvedWaypointId);

    if (!sharedTrip || !selectedWaypoint || !sessionToken) {
      return [];
    }

    return sharedTrip.trip.attachments
      .filter((attachment) => attachment.waypointId === selectedWaypoint.id)
      .map(
        (attachment) =>
          ({
            localId: attachment.id,
            serverId: attachment.id,
            waypointLocalId: selectedWaypoint.id,
            deviceId: "shared-trip",
            userId: sharedTrip.owner.id,
            type: "photo",
            localUri: buildTripAttachmentContentUrl(sessionToken, attachment.id),
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSizeBytes,
            createdAt: attachment.createdAt,
            updatedAt: attachment.updatedAt,
            deletedAt: null,
            syncStatus: "synced",
          }) satisfies WaypointAttachment,
      );
  }, [identitySession?.sessionToken, resolvedWaypointId, sharedTrip]);

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (identitySession.mode === "demo") {
    return <Redirect href="/trips" />;
  }

  if (!resolvedShareId || !resolvedWaypointId) {
    return <Redirect href="/trips" />;
  }

  if (sharedTrip && attachments.length === 0) {
    return <Redirect href={`/trips/shared/${resolvedShareId}/waypoints/${resolvedWaypointId}`} />;
  }

  return (
    <WaypointPhotoViewerScreen
      attachments={attachments}
      onBack={() => router.back()}
      readOnly
      selectedAttachmentId={resolvedAttachmentId ?? null}
    />
  );
}
