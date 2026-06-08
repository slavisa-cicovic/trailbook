import { useCallback, useEffect, useRef, useState } from "react";
import { Redirect, useFocusEffect, useRouter } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import ScreenLayout from "../../components/layout/screen-layout";
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
import { useSharedTripsList } from "../../features/sharing/hooks/queries/use-shared-trips-list";
import {
  enqueueAndDrainTripGroupsSync,
  enqueueAndDrainTripSync,
} from "../../services/sync/sync-actions.service";
import { listTripsScreenItems, type TripSummaryStats } from "../../repositories/trips-repository";
import { useTripsScreenHydration } from "../../core/hooks/use-trips-screen-hydration";
import TripGroupModal from "./components/trip-group-modal";
import TripGroupEditModal from "./components/trip-group-edit-modal";
import { TripCard } from "./components/trip-card";

interface PendingUndoState {
  tripLocalId: string;
  tripTitle: string;
}

type TripListMode = "owned" | "groups" | "shared";

interface GroupDraft {
  description: string;
  title: string;
}

const TRIP_DATE_FILTER_OPTIONS: { label: string; value: TripDateFilter }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "last_year", label: "Last year" },
];

type TripSortBy = "newest" | "oldest" | "distance" | "duration";

const ACTIVITY_FILTER_OPTIONS: { label: string; value: string }[] = [
  { value: "walk", label: "Walk" },
  { value: "bike", label: "Bike" },
  { value: "drive", label: "Drive" },
  { value: "boat", label: "Boat" },
  { value: "plane", label: "Plane" },
];

const TRIP_SORT_OPTIONS: { label: string; value: TripSortBy }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
];

function applyTripSort(
  trips: Trip[],
  sortBy: TripSortBy,
  statsByTripId: Map<string, TripSummaryStats>,
): Trip[] {
  const copy = [...trips];

  if (sortBy === "oldest") {
    return copy.sort(
      (a, b) => a.startedAt.localeCompare(b.startedAt) || a.localId.localeCompare(b.localId),
    );
  }

  if (sortBy === "distance") {
    return copy.sort(
      (a, b) =>
        (statsByTripId.get(b.localId)?.distanceMeters ?? 0) -
        (statsByTripId.get(a.localId)?.distanceMeters ?? 0),
    );
  }

  if (sortBy === "duration") {
    return copy.sort((a, b) => {
      const dA = a.endedAt ? new Date(a.endedAt).getTime() - new Date(a.startedAt).getTime() : 0;
      const dB = b.endedAt ? new Date(b.endedAt).getTime() - new Date(b.startedAt).getTime() : 0;
      return dB - dA;
    });
  }

  return copy.sort(
    (a, b) => b.startedAt.localeCompare(a.startedAt) || b.localId.localeCompare(a.localId),
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const suppressTapAfterSwipeRef = useRef(false);
  const suppressTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useTripsScreenHydration();
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
  const [dateFilter, setDateFilter] = useState<TripDateFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilters, setActivityFilters] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<TripSortBy>("newest");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [listMode, setListMode] = useState<TripListMode>("owned");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const {
    data: sharedTripsData,
    isFetching: sharedTripsLoading,
    error: sharedTripsQueryError,
    refetch: refetchSharedTrips,
  } = useSharedTripsList();
  const sharedTrips = sharedTripsData?.sharedTrips ?? [];
  const sharedTripsError = sharedTripsQueryError instanceof Error ? sharedTripsQueryError.message : null;
  const [syncingTripId, setSyncingTripId] = useState<string | null>(null);
  const [syncingGroups, setSyncingGroups] = useState(false);
  const [tripStatsByTripId, setTripStatsByTripId] = useState<Map<string, TripSummaryStats>>(new Map());
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
  const searchLower = searchQuery.trim().toLowerCase();
  const searchedTrips = searchLower
    ? filteredTrips.filter((trip) => trip.title.toLowerCase().includes(searchLower))
    : filteredTrips;
  const activityFilteredTrips =
    activityFilters.length === 0
      ? searchedTrips
      : searchedTrips.filter((trip) => activityFilters.includes(trip.recordingProfile));
  const displayTrips = applyTripSort(activityFilteredTrips, sortBy, tripStatsByTripId);
  const activeFilterCount =
    (dateFilter !== "all" ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0) +
    (activityFilters.length > 0 ? 1 : 0) +
    (sortBy !== "newest" ? 1 : 0);
  const tripSummaries = displayTrips.map((trip) => ({
    ...buildTripSummaryWithPoints(trip, [], currentUserWaypoints, currentUserWaypointAttachments),
    distanceMeters: tripStatsByTripId.get(trip.localId)?.distanceMeters ?? null,
  }));
  const tripsAggregateSummary = displayTrips.reduce(
    (summary, trip) => {
      const distanceMeters = tripStatsByTripId.get(trip.localId)?.distanceMeters ?? 0;
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
        const tripIds = filteredTripIdsKey.length > 0 ? filteredTripIdsKey.split("|") : [];

        if (tripIds.length === 0) {
          setTripStatsByTripId(new Map());
          setTripStatsLoading(false);
          return;
        }

        setTripStatsLoading(true);

        try {
          const tripItems = await listTripsScreenItems({
            tripLocalIds: tripIds,
            userId: identitySession?.userId ?? null,
          });
          const nextTripStatsByTripId = new Map<string, TripSummaryStats>();

          for (const item of tripItems) {
            if (item.stats) {
              nextTripStatsByTripId.set(item.trip.localId, item.stats);
            }
          }

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
    }, [filteredTripIdsKey, identitySession?.userId]),
  );

  useEffect(
    () => () => {
      if (suppressTapTimeoutRef.current) {
        clearTimeout(suppressTapTimeoutRef.current);
      }
    },
    [],
  );

  async function syncTripMutationViaOutbox(tripLocalId: string) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken) {
      return;
    }

    await enqueueAndDrainTripSync({
      identitySession,
      tripLocalId,
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
    let tripSyncSucceeded = false;

    try {
      const pendingTrips = trips.map((candidate) =>
        candidate.localId === trip.localId
          ? {
              ...candidate,
              syncStatus: "pending-sync" as const,
              updatedAt: new Date().toISOString(),
            }
          : candidate,
      );

      await setTrips(pendingTrips);
      const drainResult = await enqueueAndDrainTripSync({
        enqueueTripGroupsForUserId: tripGroupMembers.some(
          (member) => member.tripLocalId === trip.localId && member.deletedAt === null,
        )
          ? identitySession.userId
          : null,
        identitySession,
        tripLocalId: trip.localId,
      });

      tripSyncSucceeded =
        drainResult.trips?.find((candidate) => candidate.localId === trip.localId)?.syncStatus === "synced";
    } catch (error) {
      if (!tripSyncSucceeded) {
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
      }
      Alert.alert("Sync failed", error instanceof Error ? error.message : "Trip could not be synced.");
    } finally {
      setSyncingTripId(null);
    }
  }

  async function syncTripGroupsMutation(
    nextGroups: TripGroup[],
    nextMembers: TripGroupMember[],
  ) {
    if (identitySession?.mode !== "authenticated" || !identitySession.sessionToken || syncingGroups) {
      return;
    }

    setSyncingGroups(true);

    try {
      await enqueueAndDrainTripGroupsSync({
        identitySession,
        userId: identitySession.userId,
      });
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

  function handleToggleActivityFilter(profile: string) {
    setActivityFilters((current) =>
      current.includes(profile) ? current.filter((p) => p !== profile) : [...current, profile],
    );
  }

  function handleEnterTripSelection(tripLocalId: string) {
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

  function handleChangeListMode(nextListMode: TripListMode) {
    setListMode(nextListMode);

    if (nextListMode !== "owned") {
      setSelectedGroupTripIds([]);
    }
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
      await syncTripMutationViaOutbox(trip.localId);
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
      await syncTripMutationViaOutbox(pendingUndo.tripLocalId);
    } catch (error) {
      Alert.alert(
        "Restore sync failed",
        error instanceof Error ? error.message : "Trip was restored locally but could not be synced to the server.",
      );
    }

    setPendingUndo(null);
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
    if (suppressTapAfterSwipeRef.current) {
      return;
    }

    if (isTripSelectionMode) {
      handleToggleTripSelection(tripLocalId);
      return;
    }

    router.push(`/trips/${tripLocalId}`);
  }

  function suppressTapAfterSwipe() {
    suppressTapAfterSwipeRef.current = true;

    if (suppressTapTimeoutRef.current) {
      clearTimeout(suppressTapTimeoutRef.current);
    }

    suppressTapTimeoutRef.current = setTimeout(() => {
      suppressTapAfterSwipeRef.current = false;
      suppressTapTimeoutRef.current = null;
    }, 1200);
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
      <TripGroupModal
        draft={groupDraft}
        existingGroups={visibleTripGroups}
        selectedExistingGroupId={selectedExistingGroupId}
        selectedTripCount={selectedGroupTripIds.length}
        syncingGroups={syncingGroups}
        visible={groupModalVisible}
        onChangeDraftDescription={(description) => setGroupDraft((current) => ({ ...current, description }))}
        onChangeDraftTitle={(title) => setGroupDraft((current) => ({ ...current, title }))}
        onClose={() => setGroupModalVisible(false)}
        onSave={() => void handleSaveGroupSelection()}
        onSelectExistingGroup={setSelectedExistingGroupId}
      />

      <TripGroupEditModal
        draft={groupEditDraft}
        syncingGroups={syncingGroups}
        visible={groupEditModalVisible}
        onChangeDraftDescription={(description) => setGroupEditDraft((current) => ({ ...current, description }))}
        onChangeDraftTitle={(title) => setGroupEditDraft((current) => ({ ...current, title }))}
        onClose={() => setGroupEditModalVisible(false)}
        onSave={() => void handleSaveGroupEdit()}
      />

      <View style={styles.tripsRoot}>
        <Text style={styles.subtitle}>Your local recorded routes and saved trip content.</Text>

        <View style={styles.modeToggleRow}>
          <Pressable
            onPress={() => handleChangeListMode("owned")}
            style={[styles.modeToggleChip, listMode === "owned" && styles.modeToggleChipSelected]}
          >
            <Text
              style={[styles.modeToggleText, listMode === "owned" && styles.modeToggleTextSelected]}
            >
              My trips
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleChangeListMode("groups")}
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
            onPress={() => handleChangeListMode("shared")}
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
            <View style={styles.filterToggleRow}>
              <Pressable
                onPress={() => setFilterPanelOpen((v) => !v)}
                style={[styles.filterToggleButton, filterPanelOpen && styles.filterToggleButtonOpen]}
              >
                <MaterialIcons
                  color={filterPanelOpen ? "#fffdf8" : "#355035"}
                  name="tune"
                  size={16}
                />
                <Text style={[styles.filterToggleText, filterPanelOpen && styles.filterToggleTextOpen]}>
                  Filters
                </Text>
                {activeFilterCount > 0 ? (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{String(activeFilterCount)}</Text>
                  </View>
                ) : null}
                <MaterialIcons
                  color={filterPanelOpen ? "#fffdf8" : "#355035"}
                  name={filterPanelOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={16}
                />
              </Pressable>
            </View>

            {filterPanelOpen ? (
              <View style={styles.filterPanel}>
                <View style={styles.filterPanelSection}>
                  <Text style={styles.filterPanelLabel}>Search</Text>
                  <View style={styles.searchRow}>
                    <MaterialIcons color="#76856f" name="search" size={18} />
                    <TextInput
                      placeholder="Search trips..."
                      placeholderTextColor="#9aa691"
                      style={styles.searchInput}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 ? (
                      <Pressable hitSlop={8} onPress={() => setSearchQuery("")}>
                        <MaterialIcons color="#76856f" name="close" size={16} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.filterPanelSection}>
                  <Text style={styles.filterPanelLabel}>Period</Text>
                  <ScrollView
                    contentContainerStyle={styles.filterRow}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterPanelScroll}
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
                </View>

                <View style={styles.filterPanelSection}>
                  <Text style={styles.filterPanelLabel}>Activity</Text>
                  <ScrollView
                    contentContainerStyle={styles.filterRow}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterPanelScroll}
                  >
                    {ACTIVITY_FILTER_OPTIONS.map((option) => {
                      const selected = activityFilters.includes(option.value);

                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => handleToggleActivityFilter(option.value)}
                          style={[styles.filterChip, selected && styles.filterChipSelected]}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                <View style={styles.filterPanelSection}>
                  <Text style={styles.filterPanelLabel}>Sort</Text>
                  <ScrollView
                    contentContainerStyle={styles.filterRow}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterPanelScroll}
                  >
                    {TRIP_SORT_OPTIONS.map((option) => {
                      const selected = option.value === sortBy;

                      return (
                        <Pressable
                          key={option.value}
                          onPress={() => setSortBy(option.value)}
                          style={[styles.sortChip, selected && styles.sortChipSelected]}
                        >
                          <Text style={[styles.sortChipText, selected && styles.sortChipTextSelected]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>

                {activeFilterCount > 0 ? (
                  <Pressable
                    onPress={() => {
                      setSearchQuery("");
                      setDateFilter("all");
                      setActivityFilters([]);
                      setSortBy("newest");
                    }}
                    style={styles.filterResetButton}
                  >
                    <MaterialIcons color="#9f3f31" name="restart-alt" size={15} />
                    <Text style={styles.filterResetText}>Reset filters</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
                <Text style={styles.empty}>No trips match the selected filters.</Text>
              ) : (
                <View style={styles.list}>
                  {tripSummaries.map(({ trip, waypointCount, photoCount, distanceMeters }) => (
                    <TripCard
                      key={trip.localId}
                      anySyncing={syncingTripId !== null}
                      distanceLoading={!tripStatsByTripId.has(trip.localId)}
                      distanceMeters={distanceMeters}
                      isSyncing={syncingTripId === trip.localId}
                      isTripSelected={selectedGroupTripIds.includes(trip.localId)}
                      isTripSelectionMode={isTripSelectionMode}
                      photoCount={photoCount}
                      sessionMode={identitySession.mode}
                      trip={trip}
                      tripModeSummary={buildTripModeSummary(currentUserTripSegments, trip.localId)}
                      tripSegmentsCount={getVisibleTripSegmentsForTrip(currentUserTripSegments, trip.localId).length}
                      waypointCount={waypointCount}
                      onDelete={() => void handleDeleteTrip(trip)}
                      onLongPress={() => handleEnterTripSelection(trip.localId)}
                      onOpen={() => router.push(`/trips/${trip.localId}`)}
                      onPress={() => handleTripCardPress(trip.localId)}
                      onResume={() => void handleResumeTrip(trip)}
                      onSwipeGesture={suppressTapAfterSwipe}
                      onSync={() => void handleSyncTrip(trip)}
                    />
                  ))}
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
                              onPress={() =>
                                router.push(
                                  `/trips/${trip.localId}?groupId=${encodeURIComponent(selectedGroup.localId)}`,
                                )
                              }
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
              <Pressable onPress={() => void refetchSharedTrips()} style={styles.sharedRefreshButton}>
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
  filterToggleRow: {
    marginBottom: 8,
  },
  filterToggleButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#e8ede2",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  filterToggleButtonOpen: {
    backgroundColor: "#243224",
  },
  filterToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  filterToggleTextOpen: {
    color: "#fffdf8",
  },
  filterBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: "#587a55",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fffdf8",
  },
  filterResetButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#f7e0db",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 2,
  },
  filterResetText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9f3f31",
  },
  filterPanel: {
    borderRadius: 18,
    backgroundColor: "#f6f1e5",
    borderWidth: 1,
    borderColor: "#ebe1cf",
    padding: 14,
    gap: 14,
    marginBottom: 10,
  },
  filterPanelSection: {
    gap: 7,
  },
  filterPanelLabel: {
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: "#76856f",
  },
  filterPanelScroll: {
    flexGrow: 0,
    height: 36,
  },
  filterRow: {
    alignItems: "center",
    gap: 8,
    minHeight: 36,
  },
  filterChip: {
    height: 36,
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#ece7dc",
    borderWidth: 1,
    borderColor: "#ddd5c4",
    paddingHorizontal: 12,
    paddingVertical: 0,
    height: 40,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#243224",
    paddingVertical: 0,
  },
  sortChip: {
    height: 36,
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "#e0e8de",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sortChipSelected: {
    backgroundColor: "#355035",
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#355035",
  },
  sortChipTextSelected: {
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
