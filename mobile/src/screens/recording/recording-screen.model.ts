import { getRecordingProfileLabel } from "../../constants/recording-profiles";
import { getWaypointCategoryOption } from "../../constants/waypoint-categories";
import type { RecordingDraftInput } from "../../services/recording/recording.service";
import type { WaypointDraftInput } from "../../services/waypoints/waypoints.service";
import { useTrailbookPermissions } from "../../core/hooks/use-trailbook-permissions";
import { getOpenTripSegmentForTrip } from "../../services/trip-segments/trip-segments.service";
import {
  buildActiveRecordingRouteModel,
  type ActiveRecordingRouteModel,
} from "../../services/recording/active-recording-route-model";
import { useRecordingStore } from "../../state/recording-store";
import { useSessionStore } from "../../state/session-store";
import { useTripPausesStore } from "../../state/trip-pauses-store";
import { useTripPointsStore } from "../../state/trip-points-store";
import { useTripSegmentsStore } from "../../state/trip-segments-store";
import { useTripsStore } from "../../state/trips-store";
import { useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { useWaypointsStore } from "../../state/waypoints-store";

export type { ActiveRecordingRouteModel };

interface UseRecordingScreenModelInput {
  recordingDraft: RecordingDraftInput;
  screenWidth: number;
  selectedPhotoAttachmentId: string | null;
  waypointDraft: WaypointDraftInput;
}

export function useRecordingScreenModel(input: UseRecordingScreenModelInput) {
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);
  const permissions = useTrailbookPermissions();

  const activeIdentitySession = identitySession;
  const currentUserTrips = activeIdentitySession
    ? trips.filter((trip) => trip.userId === activeIdentitySession.userId)
    : [];
  const currentUserTripSegments = activeIdentitySession
    ? tripSegments.filter((segment) => segment.userId === activeIdentitySession.userId)
    : [];
  const currentUserTripPauses = activeIdentitySession
    ? tripPauses.filter((tripPause) => tripPause.userId === activeIdentitySession.userId)
    : [];
  const currentUserWaypoints = activeIdentitySession
    ? waypoints.filter((waypoint) => waypoint.userId === activeIdentitySession.userId)
    : [];
  const currentUserWaypointAttachments = activeIdentitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === activeIdentitySession.userId)
    : [];

  const activeRecordingRouteModel = buildActiveRecordingRouteModel({
    recordingSession,
    tripPoints,
    tripSegments,
    trips,
  });
  const { activeTrip, activeTripPoints } = activeRecordingRouteModel;
  const pausedTrips = currentUserTrips.filter((trip) => trip.status === "paused");
  const activeSegment = recordingSession.activeSegmentId
    ? currentUserTripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ?? null
    : activeTrip
      ? getOpenTripSegmentForTrip(currentUserTripSegments, activeTrip.localId)
      : null;
  const activeRecordingMode = recordingSession.recordingMode;
  const activeRecordingProfile = activeSegment?.recordingProfile ?? recordingSession.recordingProfile;
  const activeRecordingProfileLabel =
    activeRecordingMode === "auto"
      ? `Auto • ${getRecordingProfileLabel(activeRecordingProfile)}`
      : getRecordingProfileLabel(activeRecordingProfile);
  const lastPoint = recordingSession.lastPointRecordedAt ?? "n/a";
  const activeTripCount = currentUserTrips.filter((trip) => trip.status === "active").length;
  const recentWaypoints = activeTrip
    ? currentUserWaypoints
        .filter((waypoint) => waypoint.tripLocalId === activeTrip.localId && waypoint.deletedAt === null)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 3)
    : [];
  const recentWaypointCards = recentWaypoints.map((waypoint) => ({
    waypoint,
    category: getWaypointCategoryOption(waypoint.category),
    photos: currentUserWaypointAttachments.filter(
      (attachment) =>
        attachment.waypointLocalId === waypoint.localId &&
        attachment.deletedAt === null &&
        attachment.type === "photo",
    ),
  }));
  const canChangeMode = recordingSession.activeTripId !== null;
  const canStartRecording = input.recordingDraft.title.trim().length > 0 && permissions.permissionsReady;
  const canSaveWaypoint = input.waypointDraft.title.trim().length > 0;
  const draftPhotoCardWidth = Math.min(Math.max(input.screenWidth * 0.5, 170), 230);
  const selectedPhotoAttachment =
    input.selectedPhotoAttachmentId === null
      ? null
      : currentUserWaypointAttachments.find(
          (attachment) =>
            attachment.localId === input.selectedPhotoAttachmentId && attachment.deletedAt === null,
        ) ?? null;
  const selectedPhotoWaypointAttachments = selectedPhotoAttachment
    ? currentUserWaypointAttachments
        .filter(
          (attachment) =>
            attachment.waypointLocalId === selectedPhotoAttachment.waypointLocalId &&
            attachment.deletedAt === null &&
            attachment.type === "photo",
        )
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];
  const selectedPhotoIndex =
    selectedPhotoAttachment === null
      ? -1
      : selectedPhotoWaypointAttachments.findIndex(
          (attachment) => attachment.localId === selectedPhotoAttachment.localId,
        );
  const hasPreviousPhoto = selectedPhotoIndex > 0;
  const hasNextPhoto =
    selectedPhotoIndex !== -1 && selectedPhotoIndex < selectedPhotoWaypointAttachments.length - 1;
  const sessionTriggerLabel = activeTrip
    ? `${activeTrip.title} • ${activeRecordingProfileLabel}`
    : pausedTrips.length > 0
      ? `${pausedTrips.length} paused trip${pausedTrips.length === 1 ? "" : "s"}`
      : recordingSession.status === "idle"
        ? "No active route"
        : "Session details";

  return {
    ...permissions,
    activeIdentitySession,
    activeRecordingMode,
    activeRecordingRouteModel,
    activeRecordingProfile,
    activeRecordingProfileLabel,
    activeSegment,
    activeTrip,
    activeTripCount,
    activeTripPoints,
    canChangeMode,
    canSaveWaypoint,
    canStartRecording,
    currentUserTripPauses,
    currentUserTripSegments,
    currentUserTrips,
    currentUserWaypointAttachments,
    currentUserWaypoints,
    draftPhotoCardWidth,
    hasNextPhoto,
    hasPreviousPhoto,
    lastPoint,
    pausedTrips,
    recentWaypointCards,
    recentWaypoints,
    recordingSession,
    selectedPhotoAttachment,
    selectedPhotoIndex,
    selectedPhotoWaypointAttachments,
    sessionTriggerLabel,
    tripPauses,
    tripPoints,
    tripSegments,
    trips,
    waypointAttachments,
    waypoints,
  };
}
