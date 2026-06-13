import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import {
  getWaypointPhotoViewerModel,
  type WaypointPhotoGroup,
  type WaypointPhotoViewerModel,
} from "../../repositories/waypoints-repository";
import { loadWaypointAttachments } from "../../repositories/waypoint-attachments-repository";
import {
  markWaypointAttachmentDeleted,
} from "../../services/trips/trips-management.service";
import { repairMissingWaypointPhotos } from "../../services/media/photo-recovery.service";
import { useSessionStore } from "../../state/session-store";
import {
  setWaypointAttachments,
  useWaypointAttachmentsStore,
} from "../../state/waypoint-attachments-store";
import WaypointPhotoViewerScreen from "./components/waypoint-photo-viewer-screen";

export default function TripWaypointPhotoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    attachmentId?: string | string[];
    photoTransition?: string | string[];
    tripId?: string | string[];
    waypointId?: string | string[];
  }>();
  const identitySession = useSessionStore((state) => state.identitySession);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);
  const [viewerModel, setViewerModel] = useState<WaypointPhotoViewerModel | null>(null);
  const [viewerModelLoading, setViewerModelLoading] = useState(true);

  const resolvedAttachmentId = Array.isArray(params.attachmentId) ? params.attachmentId[0] : params.attachmentId;
  const resolvedPhotoTransition = Array.isArray(params.photoTransition)
    ? params.photoTransition[0]
    : params.photoTransition;
  const resolvedTripId = Array.isArray(params.tripId) ? params.tripId[0] : params.tripId;
  const resolvedWaypointId = Array.isArray(params.waypointId) ? params.waypointId[0] : params.waypointId;
  const screenAnimation =
    resolvedPhotoTransition === "previous"
      ? "slide_from_left"
      : resolvedPhotoTransition === "next"
        ? "slide_from_right"
        : "default";

  useEffect(() => {
    let cancelled = false;

    async function loadViewerModel() {
      if (!identitySession || !resolvedTripId || !resolvedWaypointId) {
        setViewerModel(null);
        setViewerModelLoading(false);
        return;
      }

      setViewerModelLoading(true);

      try {
        let nextViewerModel = await getWaypointPhotoViewerModel({
          selectedAttachmentLocalId: resolvedAttachmentId ?? null,
          tripLocalId: resolvedTripId,
          userId: identitySession.userId,
          waypointLocalId: resolvedWaypointId,
        });

        if (nextViewerModel) {
          const repairedPhotos = await repairMissingWaypointPhotos({
            allAttachments: waypointAttachments,
            attachments: nextViewerModel.attachments,
            sessionToken: identitySession.sessionToken,
            tripServerId: nextViewerModel.trip.serverId,
          });

          if (repairedPhotos.repairedCount > 0 && !cancelled) {
            const latestAttachments = await loadWaypointAttachments();
            const repairedPhotosById = new Map(
              repairedPhotos.attachments.map((attachment) => [attachment.localId, attachment]),
            );
            const nextAttachments = latestAttachments.map(
              (attachment) => repairedPhotosById.get(attachment.localId) ?? attachment,
            );

            await setWaypointAttachments(nextAttachments);
            nextViewerModel = {
              ...nextViewerModel,
              attachments: repairedPhotos.attachments,
              selectedAttachment: nextViewerModel.selectedAttachment
                ? repairedPhotos.attachments.find(
                    (attachment) => attachment.localId === nextViewerModel?.selectedAttachment?.localId,
                  ) ?? nextViewerModel.selectedAttachment
                : null,
            };
          }
        }

        if (!cancelled) {
          setViewerModel(nextViewerModel);
        }
      } finally {
        if (!cancelled) {
          setViewerModelLoading(false);
        }
      }
    }

    void loadViewerModel();

    return () => {
      cancelled = true;
    };
  }, [identitySession, resolvedAttachmentId, resolvedTripId, resolvedWaypointId, waypointAttachments]);

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  if (viewerModelLoading) {
    return null;
  }

  if (!viewerModel || viewerModel.attachments.length === 0) {
    return <Redirect href={`/trips/${resolvedTripId}/waypoints/${resolvedWaypointId}`} />;
  }

  const loadedViewerModel = viewerModel;
  const { attachments } = loadedViewerModel;

  async function handleRemoveCurrentPhoto(attachmentLocalId: string) {
    const currentIndex = attachments.findIndex((attachment) => attachment.localId === attachmentLocalId);
    const fallbackAttachment = attachments[currentIndex + 1] ?? attachments[currentIndex - 1] ?? null;

    await setWaypointAttachments(
      markWaypointAttachmentDeleted(waypointAttachments, attachmentLocalId, new Date().toISOString()),
    );

    if (fallbackAttachment) {
      router.replace(
        `/trips/${loadedViewerModel.trip.localId}/waypoints/${loadedViewerModel.waypoint.localId}/photos/${fallbackAttachment.localId}`,
      );
      return;
    }

    router.back();
  }

  function navigateToWaypointPhoto(
    photoGroup: WaypointPhotoGroup | null,
    transition: "next" | "previous",
  ) {
    if (!photoGroup) {
      return;
    }

    if (!photoGroup.attachmentLocalId) {
      router.replace(
        `/trips/${loadedViewerModel.trip.localId}/waypoints/${photoGroup.waypointLocalId}`,
      );
      return;
    }

    router.replace(
      `/trips/${loadedViewerModel.trip.localId}/waypoints/${photoGroup.waypointLocalId}/photos/${photoGroup.attachmentLocalId}?photoTransition=${transition}`,
    );
  }

  return (
    <>
      <Stack.Screen options={{ animation: screenAnimation }} />
      <WaypointPhotoViewerScreen
        attachments={attachments}
        hasNextGroup={loadedViewerModel.nextPhotoWaypoint !== null}
        hasPreviousGroup={loadedViewerModel.previousPhotoWaypoint !== null}
        nextGroupTitle={loadedViewerModel.nextPhotoWaypoint?.title ?? null}
        onBack={() => router.back()}
        onRemoveCurrent={(attachmentLocalId) => void handleRemoveCurrentPhoto(attachmentLocalId)}
        onScrollPastEnd={() => navigateToWaypointPhoto(loadedViewerModel.nextPhotoWaypoint, "next")}
        onScrollPastStart={() => navigateToWaypointPhoto(loadedViewerModel.previousPhotoWaypoint, "previous")}
        previousGroupTitle={loadedViewerModel.previousPhotoWaypoint?.title ?? null}
        routeCoordinates={loadedViewerModel.routeCoordinates}
        selectedAttachmentId={resolvedAttachmentId ?? null}
        tripTitle={loadedViewerModel.trip.title}
        waypointCoordinate={loadedViewerModel.waypointCoordinate}
        waypointTitle={loadedViewerModel.waypoint.title}
      />
    </>
  );
}
