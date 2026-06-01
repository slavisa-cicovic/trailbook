import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";

import ScreenLayout from "../../components/layout/screen-layout";
import type { SharedTripSummary } from "../../domain/shared-trips";
import type { Trip, TripGroup, TripGroupMember } from "../../domain/trips";
import {
  buildTripModeSummary,
  getOpenTripSegmentForTrip,
  getVisibleTripSegmentsForTrip,
} from "../../services/trip-segments/trip-segments.service";
import {
  buildTripsAggregateSummary,
  buildTripSummaryWithPoints,
  filterTripsByDate,
  formatDurationSummary,
  getVisibleTrips,
  markTripDeleted,
  restoreTripDeletedState,
  type TripDateFilter,
  updateTripMetadata,
  type TripUpdateInput,
} from "../../services/trips/trips-management.service";
import {
  buildTripGroupMembersForTrips,
  buildTripGroupSummaries,
  createTripGroup,
  getVisibleTripGroupMembers,
  getVisibleTripGroups,
} from "../../services/trips/trip-groups.service";
import {
  createResumedRecordingState,
  resumePausedTrip,
  stopRecordingSession,
} from "../../services/recording/recording.service";
import { setRecordingSession, useRecordingStore } from "../../state/recording-store";
import { useSessionStore } from "../../state/session-store";
import { setTripGroupMembers, useTripGroupMembersStore } from "../../state/trip-group-members-store";
import { setTripGroups, useTripGroupsStore } from "../../state/trip-groups-store";
import { setTripPauses, useTripPausesStore } from "../../state/trip-pauses-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { setWaypointAttachments, useWaypointAttachmentsStore } from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";
import { formatDistanceKm } from "../../services/trip-points/trip-points.service";
import {
  listSharedTrips,
  syncTripGroupsToServer,
  syncTripToServer,
  uploadTripAttachmentToServer,
} from "../../services/trips/server-trip-sharing.service";
import { loadTripPointsForTrip, loadTripStatsByTripLocalIds, type TripStatsRow } from "../../storage/trip-points-storage";
import TripEditModal from "./components/trip-edit-modal";

interface PendingUndoState {
  tripLocalId: string;
  tripTitle: string;
}

type TripListMode = "owned" | "groups" | "shared";

interface GroupDraft {
  description: string;
  title: string;
}

const TRIP_DATE_FILTER_OPTIONS: Array<{ label: string; value: TripDateFilter }> = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_year", label: "Last year" },
];

export default function TripsScreen() {
  const router = useRouter();
  const suppressTapUntilRef = useRef(0);
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const tripGroups = useTripGroupsStore((state) => state.tripGroups);
  const tripGroupMembers = useTripGroupMembersStore((state) => state.tripGroupMembers);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [pendingUndo, setPendingUndo] = useState<PendingUndoState | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [tripEditVisible, setTripEditVisible] = useState(false);
  const [dateFilter, setDateFilter] = useState<TripDateFilter>("all");
  const [listMode, setListMode] = useState<TripListMode>("owned");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [sharedTrips, setSharedTrips] = useState<SharedTripSummary[]>([]);
  const [sharedTripsLoading, setSharedTripsLoading] = useState(false);
  const [sharedTripsError, setSharedTripsError] = useState<string | null>(null);
  const [syncingTripId, setSyncingTripId] = useState<string | null>(null);
  const [syncingGroups, setSyncingGroups] = useState(false);
  const [tripStatsByTripId, setTripStatsByTripId] = useState<Map<string, TripStatsRow>>(new Map());
  const [tripStatsLoading, setTripStatsLoading] = useState(false);
  const [selectedGroupTripIds, setSelectedGroupTripIds] = useState<string[]>([]);
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [groupEditModalVisible, setGroupEditModalVisible] = useState(false);
  const [selectedExistingGroupId, setSelectedExistingGroupId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>({
    title: "",
    description: "",
  });
  const [groupEditDraft, setGroupEditDraft] = useState<GroupDraft>({
    title: "",
    description: "",
  });
  const [tripDraft, setTripDraft] = useState<TripUpdateInput>({
    title: "",
    description: "",
  });

  const currentUserTrips = identitySession
    ? trips.filter((trip) => trip.userId === identitySession.userId)
    : [];
  const currentUserTripSegments = identitySession
    ? tripSegments.filter((segment) => segment.userId === identitySession.userId)
    : [];
  const currentUserTripGroups = identitySession
    ? tripGroups.filter((group) => group.userId === identitySession.userId)
    : [];
  const currentUserTripGroupMembers = identitySession
    ? tripGroupMembers.filter((member) => member.userId === identitySession.userId)
    : [];
  const currentUserWaypoints = identitySession
    ? waypoints.filter((waypoint) => waypoint.userId === identitySession.userId)
    : [];
  const currentUserWaypointAttachments = identitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === identitySession.userId)
    : [];

  const visibleTrips = getVisibleTrips(currentUserTrips);
  const visibleTripGroups = getVisibleTripGroups(currentUserTripGroups);
  const visibleTripGroupIdsKey = visibleTripGroups.map((group) => group.localId).join("|");
  const visibleTripGroupMembers = getVisibleTripGroupMembers(currentUserTripGroupMembers);
  const tripGroupSummaries = buildTripGroupSummaries(visibleTripGroups, visibleTripGroupMembers, visibleTrips);
  const selectedGroup = selectedGroupId
    ? visibleTripGroups.find((group) => group.localId === selectedGroupId) ?? null
    : null;
  const selectedGroupMembers = selectedGroup
    ? visibleTripGroupMembers
        .filter((member) => member.groupLocalId === selectedGroup.localId)
        .sort((left, right) => left.sortOrder - right.sortOrder)
    : [];
  const selectedGroupTrips = selectedGroupMembers
    .map((member) => visibleTrips.find((trip) => trip.localId === member.tripLocalId))
    .filter((trip): trip is Trip => trip !== undefined);
  const isTripSelectionMode = selectedGroupTripIds.length > 0;
  const filteredTrips = filterTripsByDate(visibleTrips, dateFilter);
  const filteredTripIds = filteredTrips.map((trip) => trip.localId);
  const filteredTripIdsKey = filteredTripIds.join("|");
  const hasMissingTripStats = filteredTripIds.some((tripLocalId) => !tripStatsByTripId.has(tripLocalId));
  const showTripStatsSkeleton = filteredTripIds.length > 0 && (tripStatsLoading || hasMissingTripStats);
  const tripSummaries = filteredTrips.map((trip) => ({
    ...buildTripSummaryWithPoints(trip, [], currentUserWaypoints, currentUserWaypointAttachments),
    distanceMeters: tripStatsByTripId.get(trip.localId)?.distance_meters ?? null,
  }));
  const tripsAggregateSummary = filteredTrips.reduce(
    (summary, trip) => {
      const distanceMeters = tripStatsByTripId.get(trip.localId)?.distance_meters ?? 0;
      const durationMs = Math.max(
        0,
        new Date(trip.endedAt ?? new Date().toISOString()).getTime() - new Date(trip.startedAt).getTime(),
      );

      summary.totalTripCount += 1;
      summary.totalDurationMs += durationMs;
      summary.totalDistanceMeters += distanceMeters;

      if (trip.recordingProfile === "drive") {
        summary.driveTripCount += 1;
        summary.driveDurationMs += durationMs;
        summary.driveDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "boat") {
        summary.boatTripCount += 1;
        summary.boatDurationMs += durationMs;
        summary.boatDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "plane") {
        summary.planeTripCount += 1;
        summary.planeDurationMs += durationMs;
        summary.planeDistanceMeters += distanceMeters;
      } else if (trip.recordingProfile === "bike") {
        summary.bikeTripCount += 1;
        summary.bikeDurationMs += durationMs;
        summary.bikeDistanceMeters += distanceMeters;
      } else {
        summary.walkTripCount += 1;
        summary.walkDurationMs += durationMs;
        summary.walkDistanceMeters += distanceMeters;
      }

      return summary;
    },
    buildTripsAggregateSummary([], []),
  );
  const summaryRows = [
    {
      label: "Walk",
      distanceMeters: tripsAggregateSummary.walkDistanceMeters,
      durationMs: tripsAggregateSummary.walkDurationMs,
      tripCount: tripsAggregateSummary.walkTripCount,
    },
    {
      label: "Bike",
      distanceMeters: tripsAggregateSummary.bikeDistanceMeters,
      durationMs: tripsAggregateSummary.bikeDurationMs,
      tripCount: tripsAggregateSummary.bikeTripCount,
    },
    {
      label: "Drive",
      distanceMeters: tripsAggregateSummary.driveDistanceMeters,
      durationMs: tripsAggregateSummary.driveDurationMs,
      tripCount: tripsAggregateSummary.driveTripCount,
    },
    {
      label: "Boat",
      distanceMeters: tripsAggregateSummary.boatDistanceMeters,
      durationMs: tripsAggregateSummary.boatDurationMs,
      tripCount: tripsAggregateSummary.boatTripCount,
    },
    {
      label: "Plane",
      distanceMeters: tripsAggregateSummary.planeDistanceMeters,
      durationMs: tripsAggregateSummary.planeDurationMs,
      tripCount: tripsAggregateSummary.planeTripCount,
    },
  ].filter((row) => row.distanceMeters > 0 || row.durationMs > 0);
  const selectedTrip = visibleTrips.find((trip) => trip.localId === selectedTripId) ?? null;

  useEffect(() => {
    if (!pendingUndo) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setPendingUndo(null);
    }, 5000);

    return () => clearTimeout(timeoutId);
  }, [pendingUndo]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function loadTripStats() {
        if (filteredTripIds.length === 0) {
          setTripStatsByTripId(new Map());
          setTripStatsLoading(false);
          return;
        }

        setTripStatsLoading(true);

        try {
          const nextTripStatsByTripId = await loadTripStatsByTripLocalIds(filteredTripIds);

          if (!cancelled) {
            setTripStatsByTripId(nextTripStatsByTripId);
          }
        } finally {
          if (!cancelled) {
            setTripStatsLoading(false);
          }
        }
      }

      void loadTripStats();

      return () => {
        cancelled = true;
      };
    }, [filteredTripIdsKey]),
  );

  useEffect(() => {
    if (listMode !== "shared" || identitySession?.mode !== "authenticated" || !identitySession.sessionToken) {
      return;
    }

    void refreshSharedTrips();
  }, [identitySession?.mode, identitySession?.sessionToken, listMode]);

  useEffect(() => {
    if (listMode !== "owned" && selectedGroupTripIds.length > 0) {
      setSelectedGroupTripIds([]);
    }
  }, [listMode, selectedGroupTripIds.length]);

  useEffect(() => {
    if (!selectedGroupId) {
      return;
    }

    if (!visibleTripGroups.some((group) => group.localId === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [selectedGroupId, visibleTripGroupIdsKey]);

  async function refreshSharedTrips() {
    if (!identitySession?.sessionToken) {
      return;
    }

    setSharedTripsLoading(true);
    setSharedTripsError(null);

    try {
      const response = await listSharedTrips(identitySession.sessionToken);
      setSharedTrips(response.sharedTrips);
    } catch (error) {
      setSharedTripsError(error instanceof Error ? error.message : "Unable to load shared trips.");
    } finally {
      setSharedTripsLoading(false);
    }
  }

  async function syncTripMutationToServer(
    tripLocalId: string,
    nextTrips: Trip[],
    nextWaypoints = waypoints,
    nextAttachments = waypointAttachments,
  ) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken) {
      return;
    }

    const trip = nextTrips.find((candidate) => candidate.localId === tripLocalId);

    if (!trip) {
      return;
    }

    const tripWaypoints = nextWaypoints.filter((waypoint) => waypoint.tripLocalId === tripLocalId);
    const tripWaypointIds = new Set(tripWaypoints.map((waypoint) => waypoint.localId));
    const tripAttachments = nextAttachments.filter((attachment) =>
      tripWaypointIds.has(attachment.waypointLocalId),
    );

    await syncTripToServer(identitySession.sessionToken, {
      attachments: tripAttachments,
      trip,
      tripPoints: await loadTripPointsForTrip(tripLocalId),
      tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === tripLocalId),
      waypoints: tripWaypoints,
    });
  }

  async function handleSyncTrip(trip: Trip) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken || syncingTripId) {
      return;
    }

    if (trip.status !== "ended") {
      return;
    }

    setSyncingTripId(trip.localId);

    try {
      const tripWaypoints = currentUserWaypoints.filter((waypoint) => waypoint.tripLocalId === trip.localId);
      const tripWaypointIds = new Set(tripWaypoints.map((waypoint) => waypoint.localId));
      const tripAttachments = currentUserWaypointAttachments.filter((attachment) =>
        tripWaypointIds.has(attachment.waypointLocalId),
      );
      const response = await syncTripToServer(identitySession.sessionToken, {
        attachments: tripAttachments,
        trip,
        tripPoints: await loadTripPointsForTrip(trip.localId),
        tripSegments: currentUserTripSegments.filter((segment) => segment.tripLocalId === trip.localId),
        waypoints: tripWaypoints,
      });
      const uploadedAttachments = [];
      const attachmentsToUpload = tripAttachments.filter(
        (attachment) =>
          attachment.deletedAt === null &&
          (!attachment.serverId ||
            attachment.syncStatus !== "synced" ||
            !attachment.localUri.startsWith("http")),
      );

      for (const attachment of attachmentsToUpload) {
        const uploadedAttachment = await uploadTripAttachmentToServer(identitySession.sessionToken, response.tripId, {
          attachmentLocalId: attachment.localId,
          localUri: attachment.localUri,
          mimeType: attachment.mimeType,
        });

        uploadedAttachments.push(uploadedAttachment);
      }

      const nextTrips = trips.map((candidate) =>
        candidate.localId === trip.localId
          ? {
              ...candidate,
              serverId: response.tripId,
              syncStatus: "synced" as const,
              updatedAt: response.syncedAt,
            }
          : candidate,
      );

      await setTrips(nextTrips);

      if (uploadedAttachments.length > 0) {
        const uploadedAttachmentIds = new Map(
          uploadedAttachments.map((attachment) => [attachment.attachmentLocalId, attachment.attachmentId]),
        );

        await setWaypointAttachments(
          waypointAttachments.map((attachment) =>
            uploadedAttachmentIds.has(attachment.localId)
              ? {
                  ...attachment,
                  serverId: uploadedAttachmentIds.get(attachment.localId) ?? attachment.serverId,
                  syncStatus: "synced",
                  updatedAt: response.syncedAt,
                }
              : attachment,
          ),
        );
      }

      if (tripGroupMembers.some((member) => member.tripLocalId === trip.localId && member.deletedAt === null)) {
        await syncTripGroupsMutation(tripGroups, tripGroupMembers, {
          syncableTripLocalIds: new Set(
            nextTrips
              .filter((candidate) => candidate.userId === identitySession.userId && candidate.serverId)
              .map((candidate) => candidate.localId),
          ),
        });
      }
    } catch (error) {
      await setTrips(
        trips.map((candidate) =>
          candidate.localId === trip.localId
            ? {
                ...candidate,
                syncStatus: "sync-error",
                updatedAt: new Date().toISOString(),
              }
            : candidate,
        ),
      );
      Alert.alert("Sync failed", error instanceof Error ? error.message : "Trip could not be synced.");
    } finally {
      setSyncingTripId(null);
    }
  }

  function applyTripGroupSyncResponse(
    nextGroups: TripGroup[],
    nextMembers: TripGroupMember[],
    response: {
      groups: Array<{ groupId: string; localId: string }>;
      members: Array<{ localId: string; memberId: string }>;
      syncedAt: string;
    },
  ) {
    const groupIdByLocalId = new Map(response.groups.map((group) => [group.localId, group.groupId]));
    const memberIdByLocalId = new Map(response.members.map((member) => [member.localId, member.memberId]));

    return {
      groups: nextGroups.map((group) =>
        group.userId === identitySession?.userId && groupIdByLocalId.has(group.localId)
          ? {
              ...group,
              serverId: groupIdByLocalId.get(group.localId) ?? group.serverId,
              syncStatus: "synced" as const,
              updatedAt: response.syncedAt,
            }
          : group,
      ),
      members: nextMembers.map((member) =>
        member.userId === identitySession?.userId && memberIdByLocalId.has(member.localId)
          ? {
              ...member,
              serverId: memberIdByLocalId.get(member.localId) ?? member.serverId,
              syncStatus: "synced" as const,
              updatedAt: response.syncedAt,
            }
          : member,
      ),
    };
  }

  async function syncTripGroupsMutation(
    nextGroups: TripGroup[],
    nextMembers: TripGroupMember[],
    options: { syncableTripLocalIds?: Set<string> } = {},
  ) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken || syncingGroups) {
      return;
    }

    setSyncingGroups(true);

    try {
      const syncableTripLocalIds =
        options.syncableTripLocalIds ??
        new Set(
          trips
            .filter((trip) => trip.userId === identitySession.userId && trip.serverId)
            .map((trip) => trip.localId),
        );
      const groupsToSync = nextGroups.filter((group) => group.userId === identitySession.userId);
      const membersToSync = nextMembers.filter(
        (member) => member.userId === identitySession.userId && syncableTripLocalIds.has(member.tripLocalId),
      );
      const response = await syncTripGroupsToServer(identitySession.sessionToken, {
        groups: groupsToSync,
        members: membersToSync,
      });
      const syncedState = applyTripGroupSyncResponse(nextGroups, nextMembers, response);

      await setTripGroups(syncedState.groups);
      await setTripGroupMembers(syncedState.members);
    } catch (error) {
      const failedAt = new Date().toISOString();

      await setTripGroups(
        nextGroups.map((group) =>
          group.userId === identitySession.userId && group.syncStatus === "pending-sync"
            ? { ...group, syncStatus: "sync-error", updatedAt: failedAt }
            : group,
        ),
      );
      await setTripGroupMembers(
        nextMembers.map((member) =>
          member.userId === identitySession.userId && member.syncStatus === "pending-sync"
            ? { ...member, syncStatus: "sync-error", updatedAt: failedAt }
            : member,
        ),
      );
      Alert.alert("Group sync failed", error instanceof Error ? error.message : "Trip group could not be synced.");
    } finally {
      setSyncingGroups(false);
    }
  }

  function handleEnterTripSelection(tripLocalId: string) {
    setSelectedTripId(null);
    setTripEditVisible(false);
    setSelectedGroupTripIds([tripLocalId]);
  }

  function handleToggleTripSelection(tripLocalId: string) {
    setSelectedGroupTripIds((current) =>
      current.includes(tripLocalId)
        ? current.filter((candidate) => candidate !== tripLocalId)
        : [...current, tripLocalId],
    );
  }

  function handleOpenGroupModal() {
    setGroupDraft({
      title: "",
      description: "",
    });
    setSelectedExistingGroupId(null);
    setGroupModalVisible(true);
  }

  function handleOpenGroupEditModal(group: TripGroup) {
    setEditingGroupId(group.localId);
    setGroupEditDraft({
      title: group.title,
      description: group.description ?? "",
    });
    setGroupEditModalVisible(true);
  }

  async function handleSaveGroupEdit() {
    if (!editingGroupId || groupEditDraft.title.trim().length === 0) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextGroups = tripGroups.map((group) =>
      group.localId === editingGroupId
        ? {
            ...group,
            title: groupEditDraft.title.trim(),
            description: groupEditDraft.description.trim() || null,
            updatedAt,
            syncStatus: group.syncStatus === "synced" ? "pending-sync" as const : group.syncStatus,
          }
        : group,
    );

    await setTripGroups(nextGroups);
    setGroupEditModalVisible(false);
    setEditingGroupId(null);
    await syncTripGroupsMutation(nextGroups, tripGroupMembers);
  }

  async function handleSaveGroupSelection() {
    if (!identitySession || selectedGroupTripIds.length === 0) {
      return;
    }

    const now = new Date().toISOString();
    const selectedVisibleTripIds = selectedGroupTripIds.filter((tripLocalId) =>
      visibleTrips.some((trip) => trip.localId === tripLocalId),
    );

    if (selectedVisibleTripIds.length === 0) {
      setGroupModalVisible(false);
      setSelectedGroupTripIds([]);
      return;
    }

    let targetGroup = selectedExistingGroupId
      ? visibleTripGroups.find((group) => group.localId === selectedExistingGroupId) ?? null
      : null;
    let nextGroups = tripGroups;

    if (!targetGroup) {
      if (groupDraft.title.trim().length === 0) {
        Alert.alert("Group title required", "Enter a title or select an existing group.");
        return;
      }

      targetGroup = createTripGroup(identitySession, {
        title: groupDraft.title,
        description: groupDraft.description,
      }, now);
      nextGroups = [...tripGroups, targetGroup];
    } else {
      nextGroups = tripGroups.map((group) =>
        group.localId === targetGroup?.localId
          ? {
              ...group,
              updatedAt: now,
              syncStatus: group.syncStatus === "synced" ? "pending-sync" : group.syncStatus,
            }
          : group,
      );
    }

    const newMembers = buildTripGroupMembersForTrips(identitySession, {
      existingMembers: tripGroupMembers,
      groupLocalId: targetGroup.localId,
      tripLocalIds: selectedVisibleTripIds,
    }, now);

    if (newMembers.length === 0) {
      setGroupModalVisible(false);
      setSelectedGroupTripIds([]);
      return;
    }

    const nextMembers = [...tripGroupMembers, ...newMembers];

    await setTripGroups(nextGroups);
    await setTripGroupMembers(nextMembers);
    setGroupModalVisible(false);
    setSelectedGroupTripIds([]);
    setListMode("groups");
    setSelectedGroupId(targetGroup.localId);
    await syncTripGroupsMutation(nextGroups, nextMembers);
  }

  async function handleRemoveTripFromGroup(member: TripGroupMember) {
    const removedAt = new Date().toISOString();
    const nextMembers = tripGroupMembers.map((candidate) =>
      candidate.localId === member.localId
        ? {
            ...candidate,
            deletedAt: removedAt,
            updatedAt: removedAt,
            syncStatus: candidate.syncStatus === "synced" ? "pending-sync" as const : candidate.syncStatus,
          }
        : candidate,
    );

    await setTripGroupMembers(nextMembers);
    await syncTripGroupsMutation(tripGroups, nextMembers);
  }

  function handleConfirmDeleteTripGroup(group: TripGroup) {
    Alert.alert("Delete group", `Delete "${group.title}"? Trips will not be deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete group",
        style: "destructive",
        onPress: () => {
          void handleDeleteTripGroup(group);
        },
      },
    ]);
  }

  async function handleDeleteTripGroup(group: TripGroup) {
    const deletedAt = new Date().toISOString();
    const nextGroups = tripGroups.map((candidate) =>
      candidate.localId === group.localId
        ? {
            ...candidate,
            deletedAt,
            updatedAt: deletedAt,
            syncStatus: candidate.syncStatus === "synced" ? "pending-sync" as const : candidate.syncStatus,
          }
        : candidate,
    );
    const nextMembers = tripGroupMembers.map((member) =>
      member.groupLocalId === group.localId && member.deletedAt === null
        ? {
            ...member,
            deletedAt,
            updatedAt: deletedAt,
            syncStatus: member.syncStatus === "synced" ? "pending-sync" as const : member.syncStatus,
          }
        : member,
    );

    await setTripGroups(nextGroups);
    await setTripGroupMembers(nextMembers);
    setSelectedGroupId(null);
    await syncTripGroupsMutation(nextGroups, nextMembers);
  }

  async function handleDeleteTrip(trip: Trip) {
    if (trip.status !== "ended") {
      Alert.alert("Open trip", "Stop the route before deleting it.");
      return;
    }

    const deletedAt = new Date().toISOString();
    const nextState = markTripDeleted(trips, waypoints, waypointAttachments, trip.localId, deletedAt);

    await setTrips(nextState.trips);
    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);

    if (recordingSession.activeTripId === trip.localId) {
      await setRecordingSession(stopRecordingSession(recordingSession));
    }

    try {
      await syncTripMutationToServer(trip.localId, nextState.trips, nextState.waypoints, nextState.attachments);
    } catch (error) {
      Alert.alert(
        "Delete sync failed",
        error instanceof Error ? error.message : "Trip was deleted locally but could not be synced to the server.",
      );
    }

    setPendingUndo({
      tripLocalId: trip.localId,
      tripTitle: trip.title,
    });
    if (selectedTripId === trip.localId) {
      setSelectedTripId(null);
      setTripEditVisible(false);
    }
  }

  async function handleUndoDelete() {
    if (!pendingUndo) {
      return;
    }

    const restoredAt = new Date().toISOString();
    const nextState = restoreTripDeletedState(
      trips,
      waypoints,
      waypointAttachments,
      pendingUndo.tripLocalId,
      restoredAt,
    );

    await setTrips(nextState.trips);
    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);

    try {
      await syncTripMutationToServer(
        pendingUndo.tripLocalId,
        nextState.trips,
        nextState.waypoints,
        nextState.attachments,
      );
    } catch (error) {
      Alert.alert(
        "Restore sync failed",
        error instanceof Error ? error.message : "Trip was restored locally but could not be synced to the server.",
      );
    }

    setPendingUndo(null);
  }

  function openTripEdit(trip: Trip) {
    setSelectedTripId(trip.localId);
    setTripDraft({
      title: trip.title,
      description: trip.description ?? "",
    });
    setTripEditVisible(true);
  }

  async function handleSaveTripEdit() {
    if (!selectedTrip || tripDraft.title.trim().length === 0) {
      return;
    }

    await setTrips(updateTripMetadata(trips, selectedTrip.localId, tripDraft, new Date().toISOString()));
    setTripEditVisible(false);
  }

  async function handleResumeTrip(trip: Trip) {
    if (!identitySession) {
      return;
    }

    if (
      currentUserTrips.some(
        (candidate) =>
          candidate.deletedAt === null && candidate.status === "active" && candidate.localId !== trip.localId,
      )
    ) {
      Alert.alert("Active trip", "Pause or stop the current active trip before resuming another one.");
      return;
    }

    if (trip.status === "paused") {
      const resumedAt = new Date().toISOString();
      const nextState = createResumedRecordingState(
        identitySession,
        trip,
        tripSegments,
        tripPauses,
        resumedAt,
      );

      await setTripSegments(nextState.tripSegments);
      await setTripPauses(nextState.tripPauses);
      await setTrips(resumePausedTrip(trips, trip.localId, resumedAt));
      await setRecordingSession(nextState.session);
      router.replace("/recording");
      return;
    }

    const activeSegment = getOpenTripSegmentForTrip(currentUserTripSegments, trip.localId);

    await setRecordingSession({
      status: "interrupted",
      activeTripId: trip.localId,
      activeSegmentId: activeSegment?.localId ?? null,
      startedAt: trip.startedAt,
      lastPointRecordedAt: null,
      interruptedAt: new Date().toISOString(),
      userId: trip.userId,
      userEmail: identitySession.userEmail,
      deviceId: trip.deviceId,
      recordingMode: activeSegment?.recordingProfile ?? trip.recordingProfile,
      recordingProfile: activeSegment?.recordingProfile ?? trip.recordingProfile,
      autoCandidateProfile: null,
      autoCandidateSince: null,
      motionActivityType: null,
      motionActivityConfidence: null,
      motionActivityRecordedAt: null,
      motionActivitySourcePlatform: null,
    });

    router.replace("/recording");
  }

  function handleTripCardPress(tripLocalId: string) {
    if (Date.now() < suppressTapUntilRef.current) {
      return;
    }

    if (isTripSelectionMode) {
      handleToggleTripSelection(tripLocalId);
      return;
    }

    router.push(`/trips/${tripLocalId}`);
  }

  function suppressTapAfterSwipe() {
    suppressTapUntilRef.current = Date.now() + 1200;
  }

  if (!identitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={identitySession.userEmail}
      accountMode={identitySession.mode}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      scrollEnabled={false}
      showBottomNavigation
      title="Trips"
    >
      <TripEditModal
        draft={tripDraft}
        onChangeDescription={(description) => setTripDraft((current) => ({ ...current, description }))}
        onChangeTitle={(title) => setTripDraft((current) => ({ ...current, title }))}
        onClose={() => setTripEditVisible(false)}
        onSave={() => void handleSaveTripEdit()}
        visible={tripEditVisible}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setGroupModalVisible(false)}
        transparent
        visible={groupModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
          style={styles.groupModalKeyboard}
        >
          <View style={styles.groupModalBackdrop}>
            <ScrollView
              contentContainerStyle={styles.groupModalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.groupModalCard}>
                <Text style={styles.groupModalTitle}>Add to group</Text>
                <Text style={styles.groupModalDescription}>
                  {selectedGroupTripIds.length} selected trip{selectedGroupTripIds.length === 1 ? "" : "s"}
                </Text>

                {visibleTripGroups.length > 0 ? (
                  <View style={styles.existingGroupsBlock}>
                    <Text style={styles.groupModalLabel}>Existing groups</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.existingGroupsRow}>
                        {visibleTripGroups.map((group) => {
                          const selected = selectedExistingGroupId === group.localId;

                          return (
                            <Pressable
                              key={group.localId}
                              onPress={() => setSelectedExistingGroupId(selected ? null : group.localId)}
                              style={[
                                styles.existingGroupChip,
                                selected && styles.existingGroupChipSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.existingGroupChipText,
                                  selected && styles.existingGroupChipTextSelected,
                                ]}
                              >
                                {group.title}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ) : null}

                <View style={styles.newGroupBlock}>
                  <Text style={styles.groupModalLabel}>New group</Text>
                  <TextInput
                    editable={!selectedExistingGroupId}
                    onChangeText={(title) => setGroupDraft((current) => ({ ...current, title }))}
                    placeholder="Title"
                    placeholderTextColor="#8a9784"
                    style={[styles.groupInput, selectedExistingGroupId && styles.groupInputDisabled]}
                    value={groupDraft.title}
                  />
                  <TextInput
                    editable={!selectedExistingGroupId}
                    multiline
                    onChangeText={(description) =>
                      setGroupDraft((current) => ({ ...current, description }))
                    }
                    placeholder="Description"
                    placeholderTextColor="#8a9784"
                    style={[
                      styles.groupInput,
                      styles.groupDescriptionInput,
                      selectedExistingGroupId && styles.groupInputDisabled,
                    ]}
                    value={groupDraft.description}
                  />
                </View>

                <View style={styles.groupModalActions}>
                  <Pressable
                    onPress={() => setGroupModalVisible(false)}
                    style={styles.groupModalSecondaryButton}
                  >
                    <Text style={styles.groupModalSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={syncingGroups}
                    onPress={() => void handleSaveGroupSelection()}
                    style={[styles.groupModalPrimaryButton, syncingGroups && styles.groupModalButtonDisabled]}
                  >
                    <Text style={styles.groupModalPrimaryText}>{syncingGroups ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setGroupEditModalVisible(false)}
        transparent
        visible={groupEditModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 18 : 0}
          style={styles.groupModalKeyboard}
        >
          <View style={styles.groupModalBackdrop}>
            <ScrollView
              contentContainerStyle={styles.groupModalScrollContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.groupModalCard}>
                <Text style={styles.groupModalTitle}>Edit group</Text>
                <View style={styles.newGroupBlock}>
                  <Text style={styles.groupModalLabel}>Group details</Text>
                  <TextInput
                    onChangeText={(title) => setGroupEditDraft((current) => ({ ...current, title }))}
                    placeholder="Title"
                    placeholderTextColor="#8a9784"
                    style={styles.groupInput}
                    value={groupEditDraft.title}
                  />
                  <TextInput
                    multiline
                    onChangeText={(description) =>
                      setGroupEditDraft((current) => ({ ...current, description }))
                    }
                    placeholder="Description"
                    placeholderTextColor="#8a9784"
                    style={[styles.groupInput, styles.groupDescriptionInput]}
                    value={groupEditDraft.description}
                  />
                </View>
                <View style={styles.groupModalActions}>
                  <Pressable
                    onPress={() => setGroupEditModalVisible(false)}
                    style={styles.groupModalSecondaryButton}
                  >
                    <Text style={styles.groupModalSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    disabled={syncingGroups || groupEditDraft.title.trim().length === 0}
                    onPress={() => void handleSaveGroupEdit()}
                    style={[
                      styles.groupModalPrimaryButton,
                      (syncingGroups || groupEditDraft.title.trim().length === 0) &&
                        styles.groupModalButtonDisabled,
                    ]}
                  >
                    <Text style={styles.groupModalPrimaryText}>{syncingGroups ? "Saving..." : "Save"}</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.tripsRoot}>
        <Text style={styles.subtitle}>Your local recorded routes and saved trip content.</Text>

        <View style={styles.modeToggleRow}>
          <Pressable
            onPress={() => setListMode("owned")}
            style={[styles.modeToggleChip, listMode === "owned" && styles.modeToggleChipSelected]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "owned" && styles.modeToggleTextSelected]}
            >
              My trips
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setListMode("groups")}
            style={[styles.modeToggleChip, listMode === "groups" && styles.modeToggleChipSelected]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "groups" && styles.modeToggleTextSelected]}
            >
              Groups
            </Text>
          </Pressable>
          <Pressable
            disabled={identitySession.mode !== "authenticated"}
            onPress={() => setListMode("shared")}
            style={[
              styles.modeToggleChip,
              listMode === "shared" && styles.modeToggleChipSelected,
              identitySession.mode !== "authenticated" && styles.modeToggleChipDisabled,
            ]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "shared" && styles.modeToggleTextSelected]}
            >
              Shared with me
            </Text>
          </Pressable>
        </View>

        {listMode === "owned" ? (
          <>
            <ScrollView
              contentContainerStyle={styles.filterRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroll}
            >
              {TRIP_DATE_FILTER_OPTIONS.map((option) => {
                const selected = option.value === dateFilter;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setDateFilter(option.value)}
                    style={[styles.filterChip, selected && styles.filterChipSelected]}
                  >
                    <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.summaryTable}>
              <Pressable
                onPress={() => setSummaryExpanded((current) => !current)}
                style={styles.summaryCollapsedHeader}
              >
                <Text style={styles.summaryCollapsedTitle}>Total</Text>
                <View style={styles.summaryCollapsedValues}>
                  {showTripStatsSkeleton ? (
                    <View style={styles.summaryValueSkeleton} />
                  ) : (
                    <Text style={styles.summaryCollapsedValue}>
                      {formatDistanceKm(tripsAggregateSummary.totalDistanceMeters)}
                    </Text>
                  )}
                  <Text style={styles.summaryCollapsedValue}>
                    {formatDurationSummary(tripsAggregateSummary.totalDurationMs)}
                  </Text>
                </View>
                <View style={styles.summaryToggleIcon}>
                  <MaterialIcons
                    color="#52624f"
                    name={summaryExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                    size={22}
                  />
                </View>
              </Pressable>

              {summaryExpanded ? (
                <View>
                  <View style={[styles.summaryRow, styles.summaryHeaderRow]}>
                    <Text style={[styles.summaryHeaderCell, styles.summaryModeCell]}>Mode</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>km</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>time</Text>
                    <Text style={[styles.summaryHeaderCell, styles.summaryValueCell]}>Trips</Text>
                  </View>
                  {summaryRows.map((row) => (
                    <View key={row.label} style={styles.summaryRow}>
                      <Text style={[styles.summaryModeText, styles.summaryModeCell]}>{row.label}</Text>
                      {showTripStatsSkeleton ? (
                        <View style={[styles.summaryValueCell, styles.summarySkeletonCell]}>
                          <View style={styles.summaryValueSkeleton} />
                        </View>
                      ) : (
                        <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                          {formatDistanceKm(row.distanceMeters)}
                        </Text>
                      )}
                      <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                        {formatDurationSummary(row.durationMs)}
                      </Text>
                      <Text style={[styles.summaryValueText, styles.summaryValueCell]}>
                        {String(row.tripCount)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {isTripSelectionMode ? (
              <View style={styles.selectionBar}>
                <Text style={styles.selectionBarText}>
                  {selectedGroupTripIds.length} selected
                </Text>
                <View style={styles.selectionActions}>
                  <Pressable
                    onPress={() => setSelectedGroupTripIds([])}
                    style={styles.selectionSecondaryButton}
                  >
                    <Text style={styles.selectionSecondaryText}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={handleOpenGroupModal} style={styles.selectionPrimaryButton}>
                    <Text style={styles.selectionPrimaryText}>Add to group</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.listScrollContent} style={styles.listScroll}>
              {tripSummaries.length === 0 ? (
                <Text style={styles.empty}>No trips match the selected date filter.</Text>
              ) : (
                <View style={styles.list}>
                  {tripSummaries.map(({ trip, waypointCount, photoCount, distanceMeters }) => {
                    const statusLabel =
                      trip.status === "active" ? "Active" : trip.status === "paused" ? "Paused" : trip.syncStatus;
                    const showStatusBadge =
                      trip.status !== "ended" || identitySession.mode === "authenticated";
                    const isSyncBadge = trip.status === "ended" && identitySession.mode === "authenticated";
                    const isTripSyncing = syncingTripId === trip.localId;
                    const tripModeSummary = buildTripModeSummary(currentUserTripSegments, trip.localId);
                    const tripSegmentsForCard = getVisibleTripSegmentsForTrip(currentUserTripSegments, trip.localId);
                    const isTripSelected = selectedGroupTripIds.includes(trip.localId);
                    const tripDurationMs = Math.max(
                      0,
                      new Date(trip.endedAt ?? new Date().toISOString()).getTime() -
                        new Date(trip.startedAt).getTime(),
                    );
                    const tripDistanceLoading = !tripStatsByTripId.has(trip.localId);

                    return (
                      <Swipeable
                        key={trip.localId}
                        enabled={!isTripSelectionMode}
                        friction={2}
                        onSwipeableCloseStartDrag={suppressTapAfterSwipe}
                        onSwipeableOpenStartDrag={suppressTapAfterSwipe}
                        onSwipeableWillClose={suppressTapAfterSwipe}
                        onSwipeableWillOpen={suppressTapAfterSwipe}
                        overshootRight={false}
                        renderRightActions={() => (
                          <View style={styles.swipeActions}>
                            <Pressable
                              onPress={() => router.push(`/trips/${trip.localId}`)}
                              style={[styles.swipeAction, styles.openSwipeAction]}
                            >
                              <Text style={styles.swipeActionText}>Open</Text>
                            </Pressable>
                            {trip.status !== "ended" ? (
                              <Pressable
                                onPress={() => void handleResumeTrip(trip)}
                                style={[styles.swipeAction, styles.resumeSwipeAction]}
                              >
                                <Text style={[styles.swipeActionText, styles.resumeSwipeActionText]}>
                                  Resume
                                </Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                onPress={() => void handleDeleteTrip(trip)}
                                style={[styles.swipeAction, styles.deleteSwipeAction]}
                              >
                                <Text style={[styles.swipeActionText, styles.deleteSwipeActionText]}>
                                  Delete
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        )}
                      >
                        <View style={styles.tripCardRow}>
                          <View style={[styles.tripCard, isTripSelected && styles.tripCardSelected]}>
                            <Pressable
                              onLongPress={() => handleEnterTripSelection(trip.localId)}
                              onPress={() => handleTripCardPress(trip.localId)}
                              style={styles.tripBodyPressable}
                            >
                              <View style={styles.tripHeader}>
                                <View style={styles.tripHeaderText}>
                                  <Text style={styles.tripTitle}>{trip.title}</Text>
                                  {trip.description ? (
                                    <Text style={styles.tripDescription}>{trip.description}</Text>
                                  ) : null}
                                </View>
                                {showStatusBadge ? (
                                  isSyncBadge ? (
                                    <Pressable
                                      accessibilityLabel={isTripSyncing ? "Syncing trip" : "Sync trip"}
                                      disabled={isTripSyncing || syncingTripId !== null}
                                      onPress={(event) => {
                                        event.stopPropagation();
                                        void handleSyncTrip(trip);
                                      }}
                                      style={[
                                        styles.tripBadge,
                                        styles.tripBadgePressable,
                                        isTripSyncing && styles.tripBadgeDisabled,
                                      ]}
                                    >
                                      {isTripSyncing ? <ActivityIndicator color="#355035" size="small" /> : null}
                                      <Text style={styles.tripBadgeText}>{isTripSyncing ? "syncing" : statusLabel}</Text>
                                    </Pressable>
                                  ) : (
                                    <View style={styles.tripBadge}>
                                      <Text style={styles.tripBadgeText}>{statusLabel}</Text>
                                    </View>
                                  )
                                ) : null}
                                {isTripSelectionMode ? (
                                  <View
                                    style={[
                                      styles.selectionCheck,
                                      isTripSelected && styles.selectionCheckSelected,
                                    ]}
                                  >
                                    {isTripSelected ? (
                                      <MaterialIcons color="#fffdf8" name="check" size={16} />
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>

                              <View style={styles.metaGrid}>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Mode</Text>
                                  <Text style={styles.metaValue}>{tripModeSummary}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Distance</Text>
                                  {tripDistanceLoading ? (
                                    <View style={styles.metaValueSkeleton} />
                                  ) : (
                                    <Text style={styles.metaValue}>
                                      {distanceMeters === null ? "" : formatDistanceKm(distanceMeters)}
                                    </Text>
                                  )}
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Waypoints</Text>
                                  <Text style={styles.metaValue}>{String(waypointCount)}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Photos</Text>
                                  <Text style={styles.metaValue}>{String(photoCount)}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Segments</Text>
                                  <Text style={styles.metaValue}>{String(tripSegmentsForCard.length)}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Duration</Text>
                                  <Text style={styles.metaValue}>
                                    {formatDurationSummary(tripDurationMs)}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Started</Text>
                                  <Text style={styles.metaValue}>
                                    {new Date(trip.startedAt).toLocaleDateString()}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Ended</Text>
                                  <Text style={styles.metaValue}>
                                    {trip.endedAt
                                      ? new Date(trip.endedAt).toLocaleDateString()
                                      : trip.status === "paused"
                                        ? "Paused"
                                        : "Active"}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      </Swipeable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </>
        ) : listMode === "groups" ? (
          <>
            {selectedGroup ? (
              <View style={styles.groupDetailHeader}>
                <Pressable onPress={() => setSelectedGroupId(null)} style={styles.groupBackButton}>
                  <MaterialIcons color="#355035" name="chevron-left" size={22} />
                  <Text style={styles.groupBackButtonText}>Groups</Text>
                </Pressable>
                <Text style={styles.groupDetailTitle}>{selectedGroup.title}</Text>
                {selectedGroup.description ? (
                  <Text style={styles.groupDetailDescription}>{selectedGroup.description}</Text>
                ) : null}
                <View style={styles.groupHeaderActions}>
                  <Pressable
                    onPress={() => handleOpenGroupEditModal(selectedGroup)}
                    style={styles.groupEditButton}
                  >
                    <MaterialIcons color="#355035" name="edit" size={18} />
                    <Text style={styles.groupEditButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleConfirmDeleteTripGroup(selectedGroup)}
                    style={styles.groupDeleteButton}
                  >
                    <MaterialIcons color="#9f3f31" name="delete-outline" size={18} />
                    <Text style={styles.groupDeleteButtonText}>Delete group</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.listScrollContent} style={styles.listScroll}>
              {selectedGroup ? (
                selectedGroupTrips.length === 0 ? (
                  <Text style={styles.empty}>No trips in this group.</Text>
                ) : (
                  <View style={styles.list}>
                    {selectedGroupMembers.map((member) => {
                      const trip = visibleTrips.find((candidate) => candidate.localId === member.tripLocalId);

                      if (!trip) {
                        return null;
                      }

                      const durationMs = trip.endedAt
                        ? Math.max(0, new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime())
                        : 0;

                      return (
                        <View key={trip.localId} style={styles.tripCardRow}>
                          <View style={styles.groupMemberCard}>
                            <Pressable
                              onPress={() => router.push(`/trips/${trip.localId}`)}
                              style={styles.tripBodyPressable}
                            >
                              <View style={styles.tripHeader}>
                                <View style={styles.tripHeaderText}>
                                  <Text style={styles.tripTitle}>{trip.title}</Text>
                                  {trip.description ? (
                                    <Text style={styles.tripDescription}>{trip.description}</Text>
                                  ) : null}
                                </View>
                                <Pressable
                                  onPress={(event) => {
                                    event.stopPropagation();
                                    void handleRemoveTripFromGroup(member);
                                  }}
                                  style={styles.groupRemoveButton}
                                >
                                  <MaterialIcons color="#9f3f31" name="remove-circle-outline" size={18} />
                                </Pressable>
                              </View>
                              <View style={styles.metaGrid}>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Distance</Text>
                                  <Text style={styles.metaValue}>
                                    {formatDistanceKm(trip.distanceMeters ?? 0)}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Duration</Text>
                                  <Text style={styles.metaValue}>{formatDurationSummary(durationMs)}</Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Started</Text>
                                  <Text style={styles.metaValue}>
                                    {new Date(trip.startedAt).toLocaleDateString()}
                                  </Text>
                                </View>
                                <View style={styles.metaCell}>
                                  <Text style={styles.metaKey}>Ended</Text>
                                  <Text style={styles.metaValue}>
                                    {trip.endedAt ? new Date(trip.endedAt).toLocaleDateString() : "Active"}
                                  </Text>
                                </View>
                              </View>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )
              ) : tripGroupSummaries.length === 0 ? (
                <Text style={styles.empty}>No trip groups yet. Long press a trip to create one.</Text>
              ) : (
                <View style={styles.list}>
                  {tripGroupSummaries.map((summary) => (
                    <View key={summary.group.localId} style={styles.tripCardRow}>
                      <Pressable
                        onPress={() => setSelectedGroupId(summary.group.localId)}
                        style={styles.groupCard}
                      >
                        <View style={styles.tripHeader}>
                          <View style={styles.tripHeaderText}>
                            <Text style={styles.tripTitle}>{summary.group.title}</Text>
                            {summary.description ? (
                              <Text numberOfLines={2} style={styles.tripDescription}>
                                {summary.description}
                              </Text>
                            ) : null}
                          </View>
                          <View style={styles.tripBadge}>
                            <Text style={styles.tripBadgeText}>{summary.tripCount} trips</Text>
                          </View>
                        </View>
                        <View style={styles.metaGrid}>
                          <View style={styles.metaCell}>
                            <Text style={styles.metaKey}>Distance</Text>
                            <Text style={styles.metaValue}>
                              {formatDistanceKm(summary.totalDistanceMeters)}
                            </Text>
                          </View>
                          <View style={styles.metaCell}>
                            <Text style={styles.metaKey}>Duration</Text>
                            <Text style={styles.metaValue}>
                              {formatDurationSummary(summary.totalDurationMs)}
                            </Text>
                          </View>
                          <View style={styles.metaCell}>
                            <Text style={styles.metaKey}>Last trip</Text>
                            <Text style={styles.metaValue}>
                              {summary.lastTripStartedAt
                                ? new Date(summary.lastTripStartedAt).toLocaleDateString()
                                : ""}
                            </Text>
                          </View>
                          <View style={styles.metaCell}>
                            <Text style={styles.metaKey}>Sync</Text>
                            <Text style={styles.metaValue}>{summary.group.syncStatus}</Text>
                          </View>
                        </View>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.sharedHeaderRow}>
              <Pressable onPress={() => void refreshSharedTrips()} style={styles.sharedRefreshButton}>
                <Text style={styles.sharedRefreshButtonText}>
                  {sharedTripsLoading ? "Refreshing..." : "Refresh"}
                </Text>
              </Pressable>
            </View>

            {sharedTripsError ? <Text style={styles.sharedError}>{sharedTripsError}</Text> : null}

            <ScrollView contentContainerStyle={styles.listScrollContent} style={styles.listScroll}>
              {sharedTrips.length === 0 && !sharedTripsLoading ? (
                <Text style={styles.empty}>No trips have been shared with you yet.</Text>
              ) : (
                <View style={styles.list}>
                  {sharedTrips.map((sharedTrip) => (
                    <View key={sharedTrip.shareId} style={styles.tripCardRow}>
                      <View style={[styles.tripCard, styles.sharedTripCard]}>
                        <Pressable
                          onPress={() => router.push(`/trips/shared/${sharedTrip.shareId}`)}
                          style={styles.tripBodyPressable}
                        >
                          <View style={styles.tripHeader}>
                            <View style={styles.tripHeaderText}>
                              <Text style={styles.tripTitle}>{sharedTrip.trip.title}</Text>
                              <Text style={styles.tripDescription}>
                                Shared by {sharedTrip.owner.displayName}
                              </Text>
                            </View>
                            <View style={[styles.tripBadge, styles.sharedTripBadge]}>
                              <Text style={styles.tripBadgeText}>Read only</Text>
                            </View>
                          </View>

                          <View style={styles.metaGrid}>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Owner</Text>
                              <Text style={styles.metaValue}>{sharedTrip.owner.email}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Mode</Text>
                              <Text style={styles.metaValue}>
                                {sharedTrip.trip.segmentCount > 1 ? "Mixed" : sharedTrip.trip.recordingProfile}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Waypoints</Text>
                              <Text style={styles.metaValue}>{String(sharedTrip.trip.waypointCount)}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Segments</Text>
                              <Text style={styles.metaValue}>{String(sharedTrip.trip.segmentCount)}</Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Started</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.trip.startedAt).toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Shared</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.sharedAt).toLocaleDateString()}
                              </Text>
                            </View>
                            <View style={styles.metaCell}>
                              <Text style={styles.metaKey}>Updated</Text>
                              <Text style={styles.metaValue}>
                                {new Date(sharedTrip.trip.updatedAt).toLocaleDateString()}
                              </Text>
                            </View>
                          </View>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </>
        )}
      </View>

      {pendingUndo ? (
        <View style={styles.undoBanner}>
          <View style={styles.undoTextBlock}>
            <Text style={styles.undoTitle}>Trip deleted</Text>
            <Text numberOfLines={1} style={styles.undoText}>
              {pendingUndo.tripTitle}
            </Text>
          </View>
          <Pressable onPress={() => void handleUndoDelete()} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    justifyContent: "flex-start",
  },
  tripsRoot: {
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    color: "#52624f",
    marginBottom: 12,
  },
  modeToggleRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  modeToggleChip: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modeToggleChipSelected: {
    backgroundColor: "#243224",
  },
  modeToggleChipDisabled: {
    opacity: 0.45,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  modeToggleTextSelected: {
    color: "#fffdf8",
  },
  groupModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 28, 20, 0.36)",
  },
  groupModalKeyboard: {
    flex: 1,
  },
  groupModalScrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  groupModalCard: {
    borderRadius: 24,
    backgroundColor: "#fffdf8",
    padding: 20,
    gap: 14,
  },
  groupModalTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#243224",
  },
  groupModalDescription: {
    fontSize: 14,
    color: "#52624f",
  },
  groupModalLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: "#76856f",
  },
  existingGroupsBlock: {
    gap: 8,
  },
  existingGroupsRow: {
    flexDirection: "row",
    gap: 8,
  },
  existingGroupChip: {
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  existingGroupChipSelected: {
    backgroundColor: "#243224",
  },
  existingGroupChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  existingGroupChipTextSelected: {
    color: "#fffdf8",
  },
  newGroupBlock: {
    gap: 8,
  },
  groupInput: {
    borderRadius: 14,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    color: "#243224",
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  groupDescriptionInput: {
    minHeight: 78,
    textAlignVertical: "top",
  },
  groupInputDisabled: {
    opacity: 0.42,
  },
  groupModalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  groupModalSecondaryButton: {
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  groupModalSecondaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#355035",
  },
  groupModalPrimaryButton: {
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  groupModalButtonDisabled: {
    opacity: 0.62,
  },
  groupModalPrimaryText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fffdf8",
  },
  filterRow: {
    alignItems: "center",
    gap: 10,
    minHeight: 38,
  },
  filterScroll: {
    flexGrow: 0,
    height: 38,
    marginBottom: 8,
  },
  filterChip: {
    height: 38,
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  filterChipSelected: {
    backgroundColor: "#243224",
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  filterChipTextSelected: {
    color: "#fffdf8",
  },
  summaryTable: {
    borderRadius: 18,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    marginBottom: 12,
    overflow: "hidden",
  },
  summaryCollapsedHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryCollapsedTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#243224",
  },
  summaryCollapsedValues: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 12,
  },
  summaryCollapsedValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#243224",
  },
  summaryToggleIcon: {
    width: 30,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: "#ebe1cf",
  },
  summaryHeaderRow: {
    minHeight: 44,
    backgroundColor: "#ece4d4",
    borderTopWidth: 0,
  },
  summaryTotalRow: {
    backgroundColor: "#f0eadb",
  },
  summaryModeCell: {
    flex: 1.15,
  },
  summaryValueCell: {
    flex: 1,
  },
  summaryHeaderCell: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
    fontWeight: "700",
  },
  summaryModeText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  summaryValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#355035",
  },
  summarySkeletonCell: {
    alignItems: "flex-start",
  },
  summaryValueSkeleton: {
    width: 68,
    height: 14,
    borderRadius: 999,
    backgroundColor: "#ddd4c3",
  },
  empty: {
    fontSize: 15,
    color: "#52624f",
  },
  listScroll: {
    flex: 1,
  },
  listScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  list: {
    paddingBottom: 0,
  },
  selectionBar: {
    borderRadius: 18,
    backgroundColor: "#243224",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectionBarText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fffdf8",
  },
  selectionActions: {
    flexDirection: "row",
    gap: 8,
  },
  selectionSecondaryButton: {
    borderRadius: 999,
    backgroundColor: "rgba(255, 253, 248, 0.14)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectionSecondaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#fffdf8",
  },
  selectionPrimaryButton: {
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectionPrimaryText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#243224",
  },
  tripCardRow: {
    marginBottom: 14,
  },
  tripCard: {
    borderRadius: 22,
    backgroundColor: "#f6f1e5",
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: "#ebe1cf",
  },
  tripCardSelected: {
    borderColor: "#243224",
    backgroundColor: "#eee7d7",
  },
  groupCard: {
    borderRadius: 22,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    gap: 14,
    padding: 18,
  },
  groupMemberCard: {
    borderRadius: 22,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    gap: 14,
    padding: 18,
  },
  groupDetailHeader: {
    borderRadius: 18,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    gap: 6,
    marginBottom: 12,
    padding: 14,
  },
  groupBackButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginLeft: -6,
  },
  groupBackButtonText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#355035",
  },
  groupDetailTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#243224",
  },
  groupDetailDescription: {
    fontSize: 14,
    color: "#52624f",
    lineHeight: 20,
  },
  groupHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  groupEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  groupEditButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#355035",
  },
  groupDeleteButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#f7e0db",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  groupDeleteButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#9f3f31",
  },
  groupRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: "#f7e0db",
    alignItems: "center",
    justifyContent: "center",
  },
  sharedTripCard: {
    backgroundColor: "#eef3eb",
    borderColor: "#d9e3d3",
  },
  tripBodyPressable: {
    gap: 14,
  },
  tripHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  tripHeaderText: {
    flex: 1,
    gap: 4,
  },
  tripTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  tripDescription: {
    fontSize: 14,
    color: "#4f5f4f",
    lineHeight: 20,
  },
  tripBadge: {
    borderRadius: 999,
    backgroundColor: "#e2ecda",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tripBadgePressable: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  tripBadgeDisabled: {
    opacity: 0.72,
  },
  tripBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#355035",
  },
  selectionCheck: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#9aa691",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCheckSelected: {
    borderColor: "#243224",
    backgroundColor: "#243224",
  },
  sharedTripBadge: {
    backgroundColor: "#d7e3d2",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
    rowGap: 10,
  },
  metaCell: {
    width: "50%",
    paddingHorizontal: 4,
    gap: 2,
  },
  metaKey: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  metaValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#243224",
  },
  metaValueSkeleton: {
    width: 78,
    height: 15,
    borderRadius: 999,
    backgroundColor: "#ddd4c3",
    marginTop: 2,
  },
  sharedHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  sharedRefreshButton: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sharedRefreshButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  sharedError: {
    fontSize: 14,
    fontWeight: "600",
    color: "#a03a32",
    marginBottom: 12,
  },
  swipeActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "stretch",
    justifyContent: "flex-end",
    paddingLeft: 12,
    marginBottom: 14,
  },
  swipeAction: {
    width: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#e6ece1",
    paddingVertical: 18,
  },
  swipeActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  openSwipeAction: {
    backgroundColor: "#e6ece1",
  },
  deleteSwipeAction: {
    backgroundColor: "#f7e0db",
  },
  deleteSwipeActionText: {
    color: "#9f3f31",
  },
  resumeSwipeAction: {
    backgroundColor: "#dfead9",
  },
  resumeSwipeActionText: {
    color: "#355035",
  },
  undoBanner: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 18,
    backgroundColor: "#243224",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  undoTextBlock: {
    flex: 1,
    gap: 2,
  },
  undoTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  undoText: {
    fontSize: 13,
    color: "#dbe6d5",
  },
  undoButton: {
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  undoButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
});
