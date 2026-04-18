import { useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import ScreenLayout from "../../components/layout/screen-layout";
import RecordingControl from "../../components/recording/recording-control";
import {
  DEFAULT_RECORDING_PROFILE,
  getRecordingProfileLabel,
  RECORDING_PROFILE_OPTIONS,
} from "../../constants/recording-profiles";
import {
  DEFAULT_WAYPOINT_CATEGORY,
  WAYPOINT_CATEGORY_OPTIONS,
  getWaypointCategoryOption,
} from "../../constants/waypoint-categories";
import type { RecordingMode, RecordingProfile } from "../../domain/trips";
import type { TrailbookMapType } from "../trips/components/trip-route-map";
import {
  getBackgroundLocationAccess,
  getCurrentForegroundLocation,
  isBackgroundLocationTrackingSupported,
  requestBackgroundLocationAccess,
  requestForegroundLocationAccess,
  restartBackgroundLocationTracking,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  type CurrentLocationSnapshot,
  watchImmediateForegroundLocation,
  watchForegroundLocation,
} from "../../services/location/location.service";
import {
  closeActiveTrip,
  continueInterruptedRecording,
  createRecordingSession,
  createPausedRecordingState,
  createResumedRecordingState,
  createTripForRecording,
  getConcreteRecordingProfileForMode,
  pauseActiveTrip,
  resumePausedTrip,
  type RecordingDraftInput,
  stopRecordingSession,
  updateRecordingSegment,
  updateRecordingLastPoint,
} from "../../services/recording/recording.service";
import { applyAutoRecordingTransition } from "../../services/recording/auto-recording.service";
import {
  closeActiveTripSegment,
  createInitialTripSegment,
  getOpenTripSegmentForTrip,
  normalizeAutoClosedTripSegment,
  startNextTripSegment,
} from "../../services/trip-segments/trip-segments.service";
import { getVisibleTripPausesForTrip } from "../../services/trip-pauses/trip-pauses.service";
import {
  capturePhotoWithCamera,
  pickPhotosFromLibrary,
} from "../../services/media/photo-picker.service";
import {
  DEMO_MONTHLY_TRIP_LIMIT,
  DEMO_PHOTO_LIMIT_PER_TRIP,
  getRemainingDemoPhotoSlotsForTrip,
  getRemainingDemoTripSlots,
  isDemoSession,
} from "../../services/demo/demo-mode.service";
import {
  appendTripPointIfUseful,
  createTripPointForLocation,
  flushTripPointDiagnostics,
  getVisibleTripPointsForTrip,
  resetTripPointDiagnostics,
} from "../../services/trip-points/trip-points.service";
import {
  markWaypointAttachmentDeleted,
  markWaypointDeleted,
} from "../../services/trips/trips-management.service";
import {
  createAttachmentTimestamp,
  createPhotoAttachmentForWaypoint,
  createWaypointForTrip,
  getSuggestedWaypointTitle,
  type WaypointDraftInput,
} from "../../services/waypoints/waypoints.service";
import {
  setRecordingSession,
  useRecordingStore,
} from "../../state/recording-store";
import { setActiveIdentitySession, useSessionStore } from "../../state/session-store";
import { setTripSegments, useTripSegmentsStore } from "../../state/trip-segments-store";
import { setTripPauses, useTripPausesStore } from "../../state/trip-pauses-store";
import { setTripPoints, useTripPointsStore } from "../../state/trip-points-store";
import {
  setWaypointAttachments,
  useWaypointAttachmentsStore,
} from "../../state/waypoint-attachments-store";
import { setTrips, useTripsStore } from "../../state/trips-store";
import { setWaypoints, useWaypointsStore } from "../../state/waypoints-store";

export default function RecordingScreen() {
  const mapTypeOptions: Array<{ label: string; value: TrailbookMapType }> = [
    { label: "Map", value: "standard" },
    { label: "Satellite", value: "satellite" },
    { label: "Hybrid", value: "hybrid" },
  ];
  const identitySession = useSessionStore((state) => state.identitySession);
  const recordingSession = useRecordingStore((state) => state.session);
  const trips = useTripsStore((state) => state.trips);
  const tripSegments = useTripSegmentsStore((state) => state.tripSegments);
  const tripPauses = useTripPausesStore((state) => state.tripPauses);
  const tripPoints = useTripPointsStore((state) => state.tripPoints);
  const waypoints = useWaypointsStore((state) => state.waypoints);
  const waypointAttachments = useWaypointAttachmentsStore((state) => state.attachments);

  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [backgroundRecordingSupported, setBackgroundRecordingSupported] = useState<boolean | null>(null);
  const [backgroundLocationPermissionGranted, setBackgroundLocationPermissionGranted] = useState<boolean | null>(
    null,
  );
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [sessionMenuVisible, setSessionMenuVisible] = useState(false);
  const [selectedPhotoAttachmentId, setSelectedPhotoAttachmentId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const recordingTitleInputRef = useRef<TextInput | null>(null);
  const recordingDescriptionInputRef = useRef<TextInput | null>(null);
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraftInput>({
    title: "",
    description: "",
    recordingMode: DEFAULT_RECORDING_PROFILE,
  });
  const [waypointDraft, setWaypointDraft] = useState<WaypointDraftInput>({
    category: DEFAULT_WAYPOINT_CATEGORY,
    title: "",
    note: "",
    photos: [],
  });

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
  const currentUserTripPoints = activeIdentitySession
    ? tripPoints.filter((tripPoint) => tripPoint.userId === activeIdentitySession.userId)
    : [];
  const currentUserWaypoints = activeIdentitySession
    ? waypoints.filter((waypoint) => waypoint.userId === activeIdentitySession.userId)
    : [];
  const currentUserWaypointAttachments = activeIdentitySession
    ? waypointAttachments.filter((attachment) => attachment.userId === activeIdentitySession.userId)
    : [];

  const activeTrip =
    currentUserTrips.find(
      (trip) => trip.localId === recordingSession.activeTripId && trip.status === "active",
    ) ?? null;
  const pausedTrips = currentUserTrips.filter((trip) => trip.status === "paused");
  const activeSegment = recordingSession.activeSegmentId
    ? currentUserTripSegments.find((segment) => segment.localId === recordingSession.activeSegmentId) ?? null
    : activeTrip
      ? getOpenTripSegmentForTrip(currentUserTripSegments, activeTrip.localId)
      : null;
  const activeRecordingMode = recordingSession.recordingMode;
  const activeRecordingProfile = activeSegment?.recordingProfile ?? recordingSession.recordingProfile;
  const activeTripPoints = activeTrip ? getVisibleTripPointsForTrip(currentUserTripPoints, activeTrip.localId) : [];
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
  const canStartRecording = recordingDraft.title.trim().length > 0;
  const canSaveWaypoint = waypointDraft.title.trim().length > 0;
  const selectedPhotoAttachment =
    selectedPhotoAttachmentId === null
      ? null
      : currentUserWaypointAttachments.find(
          (attachment) =>
            attachment.localId === selectedPhotoAttachmentId && attachment.deletedAt === null,
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

  function getDemoRemainingPhotoSlots(pendingDraftPhotoCount = 0) {
    if (!activeTrip) {
      return 0;
    }

    return getRemainingDemoPhotoSlotsForTrip(
      activeTrip.localId,
      currentUserWaypoints,
      currentUserWaypointAttachments,
      pendingDraftPhotoCount,
    );
  }

  async function refreshCurrentLocation() {
    const nextLocation = await getCurrentForegroundLocation();

    if (nextLocation) {
      setCurrentLocation(nextLocation);
    }
  }

  function promptOpenBackgroundLocationSettings(message: string) {
    Alert.alert("Background permission not enabled", message, [
      {
        text: "Not now",
        style: "cancel",
      },
      {
        text: "Open Settings",
        onPress: () => {
          void Linking.openSettings();
        },
      },
    ]);
  }

  useEffect(() => {
    if (!startModalVisible) {
      return;
    }

    const timeoutId = setTimeout(() => {
      recordingTitleInputRef.current?.focus();
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [startModalVisible]);

  useEffect(() => {
    let active = true;
    let stopWatchingLocation: (() => void) | null = null;

    async function hydrateLocation() {
      const backgroundSupported = await isBackgroundLocationTrackingSupported();

      if (!active) {
        return;
      }

      setBackgroundRecordingSupported(backgroundSupported);

      const granted = await requestForegroundLocationAccess();

      if (!active) {
        return;
      }

      setLocationPermissionGranted(granted);

      if (!granted) {
        return;
      }

      if (backgroundSupported) {
        const backgroundGranted = await getBackgroundLocationAccess();

        if (!active) {
          return;
        }

        setBackgroundLocationPermissionGranted(backgroundGranted);
      }

      const initialLocation = await getCurrentForegroundLocation();

      if (active && initialLocation) {
        setCurrentLocation(initialLocation);
      }

      stopWatchingLocation =
        recordingSession.status === "idle"
          ? await watchImmediateForegroundLocation((nextLocation) => {
              setCurrentLocation(nextLocation);
            })
          : await watchForegroundLocation(recordingSession.recordingMode, (nextLocation) => {
              setCurrentLocation(nextLocation);
            });
    }

    void hydrateLocation();

    return () => {
      active = false;
      stopWatchingLocation?.();
    };
  }, [recordingSession.recordingMode, recordingSession.status]);

  useEffect(() => {
    if (locationPermissionGranted !== true || currentLocation) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshCurrentLocation();
    }, 3000);

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        void refreshCurrentLocation();
      }
    });

    return () => {
      clearInterval(intervalId);
      subscription.remove();
    };
  }, [currentLocation, locationPermissionGranted]);

  useEffect(() => {
    if (
      (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) ||
      !currentLocation ||
      recordingSession.status !== "recording"
    ) {
      return;
    }

    if (!activeTrip) {
      return;
    }

    if (recordingSession.lastPointRecordedAt === currentLocation.recordedAt) {
      return;
    }

    const nextTripPoint = createTripPointForLocation(
      activeTrip,
      recordingSession.activeSegmentId,
      currentLocation,
    );
    const nextTripPoints = appendTripPointIfUseful(
      tripPoints,
      nextTripPoint,
      recordingSession.recordingMode,
    );

    if (nextTripPoints === tripPoints) {
      return;
    }

    void (async () => {
      const nextRecordingSession = updateRecordingLastPoint(recordingSession, currentLocation.recordedAt);
      const autoTransition = applyAutoRecordingTransition(
        nextRecordingSession,
        activeTrip,
        tripSegments,
        nextTripPoints,
        waypoints,
        currentLocation.recordedAt,
      );

      if (autoTransition.changed) {
        await setTripSegments(autoTransition.tripSegments);
        await setWaypoints(autoTransition.waypoints);
      }

      await setTripPoints(nextTripPoints);
      await setRecordingSession(autoTransition.session);

      if (
        autoTransition.changed &&
        backgroundRecordingSupported !== false &&
        backgroundLocationPermissionGranted !== false
      ) {
        await restartBackgroundLocationTracking(autoTransition.session.recordingMode);
      }
    })();
  }, [
    activeTrip,
    backgroundLocationPermissionGranted,
    backgroundRecordingSupported,
    currentLocation,
    recordingSession,
    tripSegments,
    tripPoints,
  ]);

  async function handleStartRecording() {
    if (!activeIdentitySession) {
      return;
    }

    if (isDemoSession(activeIdentitySession)) {
      const remainingTripSlots = getRemainingDemoTripSlots(currentUserTrips, activeIdentitySession.userId);

      if (remainingTripSlots <= 0) {
        Alert.alert(
          "Demo limit reached",
          `Demo mode allows up to ${DEMO_MONTHLY_TRIP_LIMIT} trips per calendar month.`,
        );
        return;
      }
    }

    if (currentUserTrips.some((trip) => trip.status === "active")) {
      Alert.alert("Active route", "Pause or stop the current active route before starting a new one.");
      return;
    }

    const foregroundGranted =
      locationPermissionGranted ?? (await requestForegroundLocationAccess());

    setLocationPermissionGranted(foregroundGranted);

    if (!foregroundGranted) {
      Alert.alert(
        "Location required",
        "Allow location access so Trailbook can start recording this trip.",
      );
      return;
    }

    const supportsBackgroundRecording =
      backgroundRecordingSupported ?? (await isBackgroundLocationTrackingSupported());

    setBackgroundRecordingSupported(supportsBackgroundRecording);
    let backgroundPermissionGranted = backgroundLocationPermissionGranted ?? false;

    const startedAt = new Date().toISOString();
    const concreteRecordingProfile = getConcreteRecordingProfileForMode(recordingDraft.recordingMode);
    const nextTrip = createTripForRecording(activeIdentitySession, startedAt, recordingDraft);
    resetTripPointDiagnostics(nextTrip.localId);
    const nextSegment = createInitialTripSegment(nextTrip, startedAt);
    const nextSession = createRecordingSession(
      activeIdentitySession,
      nextTrip.localId,
      nextSegment.localId,
      startedAt,
      recordingDraft.recordingMode,
      concreteRecordingProfile,
    );

    try {
      await setTrips([...trips, nextTrip]);
      await setTripSegments([...tripSegments, nextSegment]);
      await setRecordingSession(nextSession);
      setStartModalVisible(false);
      setRecordingDraft({
        title: "",
        description: "",
        recordingMode: DEFAULT_RECORDING_PROFILE,
      });

      if (supportsBackgroundRecording) {
        try {
          backgroundPermissionGranted = await requestBackgroundLocationAccess();
          setBackgroundLocationPermissionGranted(backgroundPermissionGranted);

          if (backgroundPermissionGranted) {
            await startBackgroundLocationTracking(recordingDraft.recordingMode);
          } else {
            promptOpenBackgroundLocationSettings(
              "Recording has started, but it will continue only while Trailbook stays active until background location is enabled. In Trailbook permissions, allow location all the time.",
            );
          }
        } catch {
          setBackgroundLocationPermissionGranted(false);
          promptOpenBackgroundLocationSettings(
            "Recording has started, but Trailbook could not enable background recording on this device. Open app settings and allow location all the time.",
          );
        }
      }
    } catch {
      await setTrips(trips);
      await setTripSegments(tripSegments);
      await setRecordingSession(recordingSession);
      Alert.alert(
        "Recording unavailable",
        "Trailbook could not start background trip recording on this device.",
      );
    }
  }

  async function handlePauseRecording() {
    if (!activeTrip || !recordingSession.activeSegmentId) {
      return;
    }

    const pausedAt = new Date().toISOString();

    if (backgroundRecordingSupported !== false) {
      await stopBackgroundLocationTracking();
    }

    const nextState = createPausedRecordingState(
      activeTrip,
      recordingSession,
      tripSegments,
      tripPauses,
      pausedAt,
    );
    const normalizedState =
      recordingSession.recordingMode === "auto"
        ? normalizeAutoClosedTripSegment(
            nextState.tripSegments,
            tripPoints,
            waypoints,
            activeTrip.localId,
            pausedAt,
          )
        : {
            tripSegments: nextState.tripSegments,
            tripPoints,
            waypoints,
          };

    await setTripSegments(normalizedState.tripSegments);
    await setWaypoints(normalizedState.waypoints);
    await setTripPauses(nextState.tripPauses);
    await setTrips(pauseActiveTrip(trips, activeTrip.localId, pausedAt));
    await setRecordingSession(nextState.session);
    flushTripPointDiagnostics(activeTrip.localId);
    setSessionMenuVisible(false);
  }

  async function handleStopRecording() {
    if (!recordingSession.activeTripId || !recordingSession.activeSegmentId) {
      return;
    }

    const endedAt = new Date().toISOString();

    if (backgroundRecordingSupported !== false) {
      await stopBackgroundLocationTracking();
    }
    const closedTripSegments = closeActiveTripSegment(tripSegments, recordingSession.activeSegmentId, endedAt);
    const normalizedState =
      recordingSession.recordingMode === "auto" && activeTrip
        ? normalizeAutoClosedTripSegment(
            closedTripSegments,
            tripPoints,
            waypoints,
            activeTrip.localId,
            endedAt,
          )
        : {
            tripSegments: closedTripSegments,
            tripPoints,
            waypoints,
          };
    await setTripSegments(normalizedState.tripSegments);
    await setWaypoints(normalizedState.waypoints);
    await setTrips(closeActiveTrip(trips, recordingSession.activeTripId, endedAt));
    await setRecordingSession(stopRecordingSession(recordingSession));
    flushTripPointDiagnostics(recordingSession.activeTripId);
  }

  async function handleResumePausedTrip(tripLocalId: string) {
    if (!activeIdentitySession) {
      return;
    }

    if (currentUserTrips.some((trip) => trip.status === "active")) {
      Alert.alert("Active route", "Stop or pause the current active route before resuming another one.");
      return;
    }

    const tripToResume = currentUserTrips.find((trip) => trip.localId === tripLocalId && trip.status === "paused");

    if (!tripToResume) {
      Alert.alert("Paused route missing", "The selected paused route is no longer available.");
      return;
    }

    const resumedAt = new Date().toISOString();
    const nextState = createResumedRecordingState(
      activeIdentitySession,
      tripToResume,
      tripSegments,
      tripPauses,
      resumedAt,
    );

    await setTripSegments(nextState.tripSegments);
    await setTripPauses(nextState.tripPauses);
    await setTrips(resumePausedTrip(trips, tripToResume.localId, resumedAt));
    await setRecordingSession(nextState.session);

    if (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) {
      await startBackgroundLocationTracking(nextState.session.recordingMode);
    }

    setSessionMenuVisible(false);
  }

  async function handleContinueInterruptedRecording() {
    const nextSession = continueInterruptedRecording(recordingSession);

    try {
      await setRecordingSession(nextSession);
      if (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) {
        await startBackgroundLocationTracking(nextSession.recordingMode);
      }
    } catch {
      await setRecordingSession(recordingSession);
      Alert.alert(
        "Recording unavailable",
        "Trailbook could not resume background trip recording on this device.",
      );
    }
  }

  async function handleClearLocalSession() {
    if (backgroundRecordingSupported !== false) {
      await stopBackgroundLocationTracking();
    }
    await setActiveIdentitySession(null);
  }

  async function handleSelectRecordingProfile(mode: RecordingMode) {
    if (!recordingSession.activeTripId || !activeTrip) {
      setRecordingDraft((current) => ({
        ...current,
        recordingMode: mode,
      }));
      setProfileModalVisible(false);
      return;
    }

    if (!recordingSession.activeSegmentId) {
      return;
    }

    if (mode === "auto") {
      await setRecordingSession({
        ...recordingSession,
        recordingMode: "auto",
        autoCandidateProfile: null,
        autoCandidateSince: null,
      });
      if (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) {
        await restartBackgroundLocationTracking("auto");
      }
      setProfileModalVisible(false);
      return;
    }

    if (recordingSession.recordingMode === "auto" && recordingSession.recordingProfile === mode) {
      await setRecordingSession({
        ...recordingSession,
        recordingMode: mode,
        autoCandidateProfile: null,
        autoCandidateSince: null,
      });
      if (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) {
        await restartBackgroundLocationTracking(mode);
      }
      setProfileModalVisible(false);
      return;
    }

    const changedAt = new Date().toISOString();
    const closedSegments = closeActiveTripSegment(
      tripSegments,
      recordingSession.activeSegmentId,
      changedAt,
    );
    const { nextSegment, tripSegments: nextTripSegments } = startNextTripSegment(
      activeTrip,
      closedSegments,
      mode,
      changedAt,
    );

    await setTripSegments(nextTripSegments);
    await setRecordingSession({
      ...updateRecordingSegment(recordingSession, nextSegment.localId, mode),
      recordingMode: mode,
    });
    if (backgroundRecordingSupported !== false && backgroundLocationPermissionGranted !== false) {
      await restartBackgroundLocationTracking(mode);
    }
    setProfileModalVisible(false);
  }

  async function handleSaveWaypoint() {
    if (!activeTrip) {
      Alert.alert("No active route", "Start recording before adding a note to the route.");
      return;
    }

    if (!currentLocation) {
      Alert.alert("Location not ready", "Wait for the current location to load before saving a note.");
      return;
    }

    const createdAt = new Date().toISOString();
    const nextWaypoint = createWaypointForTrip(
      activeTrip,
      recordingSession.activeSegmentId,
      currentLocation,
      waypointDraft,
      createdAt,
    );
    const nextAttachments = [
      ...waypointAttachments,
      ...waypointDraft.photos.map((photo, index) =>
        createPhotoAttachmentForWaypoint(nextWaypoint, photo, createAttachmentTimestamp(createdAt, index)),
      ),
    ];

    await setWaypoints([...waypoints, nextWaypoint]);
    await setWaypointAttachments(nextAttachments);
    setWaypointModalVisible(false);
    setWaypointDraft({
      category: DEFAULT_WAYPOINT_CATEGORY,
      title: "",
      note: "",
      photos: [],
    });
  }

  async function handleTakePhoto() {
    if (activeIdentitySession && isDemoSession(activeIdentitySession)) {
      const remainingPhotoSlots = getDemoRemainingPhotoSlots(waypointDraft.photos.length);

      if (remainingPhotoSlots <= 0) {
        Alert.alert(
          "Demo photo limit reached",
          `Demo mode allows up to ${DEMO_PHOTO_LIMIT_PER_TRIP} photos per trip.`,
        );
        return;
      }
    }

    const photo = await capturePhotoWithCamera();

    if (!photo) {
      Alert.alert("Photo not added", "Trailbook could not get a photo from the camera.");
      return;
    }

    setWaypointDraft((current) => ({
      ...current,
      photos: [...current.photos, photo],
    }));
  }

  async function handleChoosePhoto() {
    const photos = await pickPhotosFromLibrary();

    if (photos.length === 0) {
      Alert.alert("Photos not added", "Trailbook could not get photos from the library.");
      return;
    }

    if (activeIdentitySession && isDemoSession(activeIdentitySession)) {
      const remainingPhotoSlots = getDemoRemainingPhotoSlots(waypointDraft.photos.length);

      if (remainingPhotoSlots <= 0) {
        Alert.alert(
          "Demo photo limit reached",
          `Demo mode allows up to ${DEMO_PHOTO_LIMIT_PER_TRIP} photos per trip.`,
        );
        return;
      }

      const limitedPhotos = photos.slice(0, remainingPhotoSlots);

      if (limitedPhotos.length < photos.length) {
        Alert.alert(
          "Demo photo limit",
          `Only ${remainingPhotoSlots} more photo(s) can be added to this trip in demo mode.`,
        );
      }

      setWaypointDraft((current) => ({
        ...current,
        photos: [...current.photos, ...limitedPhotos],
      }));
      return;
    }

    setWaypointDraft((current) => ({
      ...current,
      photos: [...current.photos, ...photos],
    }));
  }

  function handleRemoveDraftPhoto(indexToRemove: number) {
    setWaypointDraft((current) => ({
      ...current,
      photos: current.photos.filter((_, index) => index !== indexToRemove),
    }));
  }

  function handleSelectWaypointCategory(category: WaypointDraftInput["category"]) {
    setWaypointDraft((current) => {
      const previousSuggestedTitle = getSuggestedWaypointTitle(current.category);
      const nextSuggestedTitle = getSuggestedWaypointTitle(category);
      const shouldReplaceTitle =
        current.title.trim().length === 0 || current.title.trim() === previousSuggestedTitle;

      return {
        ...current,
        category,
        title: shouldReplaceTitle ? nextSuggestedTitle : current.title,
      };
    });
  }

  async function handleAddPhotoToWaypoint(waypointLocalId: string, source: "camera" | "library") {
    const waypoint = waypoints.find(
      (currentWaypoint) => currentWaypoint.localId === waypointLocalId && currentWaypoint.deletedAt === null,
    );

    if (!waypoint) {
      return;
    }

    if (activeIdentitySession && isDemoSession(activeIdentitySession)) {
      const remainingPhotoSlots = getDemoRemainingPhotoSlots();

      if (remainingPhotoSlots <= 0) {
        Alert.alert(
          "Demo photo limit reached",
          `Demo mode allows up to ${DEMO_PHOTO_LIMIT_PER_TRIP} photos per trip.`,
        );
        return;
      }
    }

    const createdAt = new Date().toISOString();

    if (source === "camera") {
      const photo = await capturePhotoWithCamera();

      if (!photo) {
        return;
      }

      await setWaypointAttachments([
        ...waypointAttachments,
        createPhotoAttachmentForWaypoint(waypoint, photo, createdAt),
      ]);
      return;
    }

    const photos = await pickPhotosFromLibrary();

    if (photos.length === 0) {
      return;
    }

    if (activeIdentitySession && isDemoSession(activeIdentitySession)) {
      const remainingPhotoSlots = getDemoRemainingPhotoSlots();
      const limitedPhotos = photos.slice(0, remainingPhotoSlots);

      if (limitedPhotos.length < photos.length) {
        Alert.alert(
          "Demo photo limit",
          `Only ${remainingPhotoSlots} more photo(s) can be added to this trip in demo mode.`,
        );
      }

      await setWaypointAttachments([
        ...waypointAttachments,
        ...limitedPhotos.map((photo, index) =>
          createPhotoAttachmentForWaypoint(waypoint, photo, createAttachmentTimestamp(createdAt, index)),
        ),
      ]);
      return;
    }

    await setWaypointAttachments([
      ...waypointAttachments,
      ...photos.map((photo, index) =>
        createPhotoAttachmentForWaypoint(waypoint, photo, createAttachmentTimestamp(createdAt, index)),
      ),
    ]);
  }

  function handlePromptAddPhotoToWaypoint(waypointLocalId: string) {
    Alert.alert("Add photo", "How do you want to add photos to this waypoint?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Camera",
        onPress: () => void handleAddPhotoToWaypoint(waypointLocalId, "camera"),
      },
      {
        text: "Library",
        onPress: () => void handleAddPhotoToWaypoint(waypointLocalId, "library"),
      },
    ]);
  }

  async function handleRemoveWaypoint(waypointLocalId: string) {
    const deletedAt = new Date().toISOString();
    const nextState = markWaypointDeleted(waypoints, waypointAttachments, waypointLocalId, deletedAt);

    await setWaypoints(nextState.waypoints);
    await setWaypointAttachments(nextState.attachments);
  }

  async function handleRemoveWaypointPhoto(attachmentLocalId: string) {
    const currentIndex = selectedPhotoWaypointAttachments.findIndex(
      (attachment) => attachment.localId === attachmentLocalId,
    );
    const fallbackAttachment =
      selectedPhotoWaypointAttachments[currentIndex + 1] ??
      selectedPhotoWaypointAttachments[currentIndex - 1] ??
      null;

    await setWaypointAttachments(
      markWaypointAttachmentDeleted(
        waypointAttachments,
        attachmentLocalId,
        new Date().toISOString(),
      ),
    );
    setSelectedPhotoAttachmentId(fallbackAttachment?.localId ?? null);
  }

  function handleShowPreviousPhoto() {
    if (!hasPreviousPhoto || selectedPhotoIndex === -1) {
      return;
    }

    setSelectedPhotoAttachmentId(selectedPhotoWaypointAttachments[selectedPhotoIndex - 1]?.localId ?? null);
  }

  function handleShowNextPhoto() {
    if (!hasNextPhoto || selectedPhotoIndex === -1) {
      return;
    }

    setSelectedPhotoAttachmentId(selectedPhotoWaypointAttachments[selectedPhotoIndex + 1]?.localId ?? null);
  }

  function handleRecordingControlPress() {
    if (recordingSession.status === "idle") {
      setStartModalVisible(true);
      return;
    }

    if (recordingSession.status === "recording") {
      void handleStopRecording();
      return;
    }

    Alert.alert(
      "Interrupted recording",
      "This trip was not cleanly stopped. Do you want to continue it or stop it now?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Stop",
          style: "destructive",
          onPress: () => void handleStopRecording(),
        },
        {
          text: "Continue",
          onPress: () => void handleContinueInterruptedRecording(),
        },
      ],
    );
  }

  const mapRegion: Region | undefined = currentLocation
    ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : undefined;

  if (!activeIdentitySession) {
    return <Redirect href="/login" />;
  }

  return (
    <ScreenLayout
      accountEmail={activeIdentitySession.userEmail}
      accountMode={activeIdentitySession.mode}
      contentStyle={styles.screenContent}
      contentVariant="plain"
      onLogout={() => void handleClearLocalSession()}
      scrollEnabled={false}
      showBottomNavigation
      title="Trailbook"
    >
      <Modal
        animationType="fade"
        onRequestClose={() => setWaypointModalVisible(false)}
        transparent
        visible={waypointModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Add note</Text>
              <Text style={styles.modalSubtitle}>
                Save a quick waypoint for this route using your current location.
              </Text>

              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                autoCapitalize="sentences"
                onChangeText={(title) => setWaypointDraft((current) => ({ ...current, title }))}
                placeholder="Viewpoint"
                placeholderTextColor="#8c9a86"
                style={styles.fieldInput}
                value={waypointDraft.title}
              />

              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView
                contentContainerStyle={styles.categoryPickerRow}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {WAYPOINT_CATEGORY_OPTIONS.map((option) => {
                  const selected = option.value === waypointDraft.category;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleSelectWaypointCategory(option.value)}
                      style={[
                        styles.categoryChip,
                        { borderColor: option.color },
                        selected && { backgroundColor: option.color },
                      ]}
                    >
                      <MaterialIcons
                        color={selected ? "#fffdf8" : option.color}
                        name={option.iconName}
                        size={16}
                      />
                      <Text
                        style={[
                          styles.categoryChipText,
                          selected && styles.categoryChipTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Note</Text>
              <TextInput
                autoCapitalize="sentences"
                multiline
                numberOfLines={3}
                onChangeText={(note) => setWaypointDraft((current) => ({ ...current, note }))}
                placeholder="What do you want to remember here?"
                placeholderTextColor="#8c9a86"
                style={[styles.fieldInput, styles.fieldTextarea]}
                textAlignVertical="top"
                value={waypointDraft.note}
              />

              <Text style={styles.fieldLabel}>Photos</Text>
              <Text style={styles.photoHelpText}>
                Add one or more photos from the camera or your library.
              </Text>
              <View style={styles.photoActionRow}>
                <Pressable onPress={() => void handleTakePhoto()} style={styles.photoActionPrimary}>
                  <Text style={styles.photoActionPrimaryText}>Take photo</Text>
                </Pressable>
                <Pressable onPress={() => void handleChoosePhoto()} style={styles.photoActionSecondary}>
                  <Text style={styles.photoActionSecondaryText}>Add photos</Text>
                </Pressable>
              </View>

              {waypointDraft.photos.length > 0 ? (
                <View style={styles.photoDraftList}>
                  {waypointDraft.photos.map((photo, index) => (
                    <View key={`${photo.localUri}-${index}`} style={styles.photoDraftCard}>
                      <Image source={{ uri: photo.localUri }} style={styles.photoPreview} />
                      <Pressable
                        onPress={() => handleRemoveDraftPhoto(index)}
                        style={styles.removeDraftPhotoButton}
                      >
                        <Text style={styles.removeDraftPhotoText}>Remove</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoPlaceholderText}>No photos selected yet.</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setWaypointModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canSaveWaypoint}
                  onPress={() => void handleSaveWaypoint()}
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    !canSaveWaypoint && styles.modalButtonDisabled,
                  ]}
                >
                  <Text style={styles.modalButtonPrimaryText}>Save note</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedPhotoAttachmentId(null)}
        transparent
        visible={selectedPhotoAttachment !== null}
      >
        <View style={styles.photoViewerBackdrop}>
          <Pressable
            onPress={() => setSelectedPhotoAttachmentId(null)}
            style={styles.photoViewerBackdropPressable}
          />
          {selectedPhotoAttachment ? (
            <View style={styles.photoViewerCard}>
              <Image
                resizeMode="contain"
                source={{ uri: selectedPhotoAttachment.localUri }}
                style={styles.photoViewerImage}
              />
              {selectedPhotoWaypointAttachments.length > 1 ? (
                <View style={styles.photoViewerPager}>
                  <Pressable
                    disabled={!hasPreviousPhoto}
                    onPress={handleShowPreviousPhoto}
                    style={[
                      styles.photoViewerNavButton,
                      !hasPreviousPhoto && styles.photoViewerNavButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.photoViewerNavText,
                        !hasPreviousPhoto && styles.photoViewerNavTextDisabled,
                      ]}
                    >
                      Previous
                    </Text>
                  </Pressable>
                  <Text style={styles.photoViewerPagerText}>
                    {selectedPhotoIndex + 1} / {selectedPhotoWaypointAttachments.length}
                  </Text>
                  <Pressable
                    disabled={!hasNextPhoto}
                    onPress={handleShowNextPhoto}
                    style={[
                      styles.photoViewerNavButton,
                      !hasNextPhoto && styles.photoViewerNavButtonDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.photoViewerNavText,
                        !hasNextPhoto && styles.photoViewerNavTextDisabled,
                      ]}
                    >
                      Next
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.photoViewerActions}>
                <Pressable
                  onPress={() => setSelectedPhotoAttachmentId(null)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Close</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleRemoveWaypointPhoto(selectedPhotoAttachment.localId)}
                  style={[styles.modalButton, styles.photoViewerRemoveButton]}
                >
                  <Text style={styles.photoViewerRemoveText}>Remove photo</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
        transparent
        visible={profileModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Recording mode</Text>
              <Text style={styles.modalSubtitle}>
                Choose a fixed mode or let Trailbook infer segments automatically.
              </Text>

              <View style={styles.profileList}>
                {RECORDING_PROFILE_OPTIONS.map((option) => {
                  const selected = option.value === activeRecordingMode;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => void handleSelectRecordingProfile(option.value)}
                      style={[styles.profileOption, selected && styles.profileOptionSelected]}
                    >
                      <View style={styles.profileOptionHeader}>
                        <Text
                          style={[
                            styles.profileOptionLabel,
                            selected && styles.profileOptionLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.profileOptionTag,
                            selected && styles.profileOptionTagSelected,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.profileOptionHint,
                          selected && styles.profileOptionHintSelected,
                        ]}
                      >
                        {option.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setProfileModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setStartModalVisible(false)}
        transparent
        visible={startModalVisible}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Start recording</Text>
              <Text style={styles.modalSubtitle}>
                Give this route a name and choose the recording mode before the trip starts.
              </Text>

              <Text style={styles.fieldLabel}>Route name</Text>
              <TextInput
                autoCapitalize="sentences"
                autoCorrect
                enablesReturnKeyAutomatically
                enterKeyHint="next"
                onSubmitEditing={() => recordingDescriptionInputRef.current?.focus()}
                onChangeText={(title) => setRecordingDraft((current) => ({ ...current, title }))}
                placeholder="e.g. Drive to Belgrade"
                placeholderTextColor="#8c9a86"
                ref={recordingTitleInputRef}
                returnKeyType="next"
                style={styles.fieldInput}
                value={recordingDraft.title}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                autoCapitalize="sentences"
                autoCorrect
                enterKeyHint="done"
                blurOnSubmit
                multiline
                numberOfLines={3}
                onChangeText={(description) =>
                  setRecordingDraft((current) => ({ ...current, description }))
                }
                onSubmitEditing={() => Keyboard.dismiss()}
                placeholder="Optional notes. You can also dictate with the keyboard microphone."
                placeholderTextColor="#8c9a86"
                ref={recordingDescriptionInputRef}
                returnKeyType="done"
                style={[styles.fieldInput, styles.fieldTextarea]}
                textAlignVertical="top"
                value={recordingDraft.description}
              />

              <Text style={styles.fieldLabel}>Recording mode</Text>
              <View style={styles.profileList}>
                {RECORDING_PROFILE_OPTIONS.map((option) => {
                  const selected = option.value === recordingDraft.recordingMode;

                  return (
                    <Pressable
                      key={option.value}
                      onPress={() =>
                        setRecordingDraft((current) => ({
                          ...current,
                          recordingMode: option.value,
                        }))
                      }
                      style={[styles.profileOption, selected && styles.profileOptionSelected]}
                    >
                      <View style={styles.profileOptionHeader}>
                        <Text
                          style={[
                            styles.profileOptionLabel,
                            selected && styles.profileOptionLabelSelected,
                          ]}
                        >
                          {option.label}
                        </Text>
                        <Text
                          style={[
                            styles.profileOptionTag,
                            selected && styles.profileOptionTagSelected,
                          ]}
                        >
                          {option.description}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.profileOptionHint,
                          selected && styles.profileOptionHintSelected,
                        ]}
                      >
                        {option.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={() => setStartModalVisible(false)}
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  disabled={!canStartRecording}
                  onPress={() => void handleStartRecording()}
                  style={[
                    styles.modalButton,
                    styles.modalButtonPrimary,
                    !canStartRecording && styles.modalButtonDisabled,
                  ]}
                >
                  <Text style={styles.modalButtonPrimaryText}>Start</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.mapShell}>
        {mapRegion && currentLocation ? (
          <MapView
            initialRegion={mapRegion}
            mapType={mapType}
            region={mapRegion}
            showsUserLocation={locationPermissionGranted === true}
            style={styles.map}
          >
            {activeTripPoints.length > 1 ? (
              <Polyline
                coordinates={activeTripPoints.map((tripPoint) => ({
                  latitude: tripPoint.latitude,
                  longitude: tripPoint.longitude,
                }))}
                lineCap="round"
                lineJoin="round"
                strokeColor="#355035"
                strokeWidth={4}
              />
            ) : null}
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="You are here"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.placeholderTitle}>
              {locationPermissionGranted === false
                ? "Location permission is required"
                : "Locating you..."}
            </Text>
            <Text style={styles.placeholderText}>
              {locationPermissionGranted === false
                ? "Allow location access so Trailbook can show where you are and keep recording in the background."
                : "The recording screen will center the map on your current position."}
            </Text>
            {locationPermissionGranted === true ? (
              <Pressable onPress={() => void refreshCurrentLocation()} style={styles.retryLocationButton}>
                <Text style={styles.retryLocationButtonText}>Retry location</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={styles.mapTopOverlay}>
          <View style={styles.sessionBar}>
            <RecordingControl
              compact
              onPress={handleRecordingControlPress}
              status={recordingSession.status}
            />
            <Pressable
              onPress={() => setSessionMenuVisible((current) => !current)}
              style={styles.sessionTrigger}
            >
              <Text style={styles.sessionTriggerLabel}>{sessionTriggerLabel}</Text>
              <Text style={styles.sessionTriggerMeta}>
                {recordingSession.status === "idle"
                  ? "Tap for session details"
                  : `${recordingSession.status} • tap for details`}
              </Text>
            </Pressable>
          </View>
          <View style={styles.mapTypeBar}>
            {mapTypeOptions.map((option) => {
              const selected = option.value === mapType;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setMapType(option.value)}
                  style={[styles.mapTypeChip, selected && styles.mapTypeChipSelected]}
                >
                  <Text style={[styles.mapTypeChipText, selected && styles.mapTypeChipTextSelected]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {sessionMenuVisible ? (
          <View style={styles.drawerOverlay}>
            <Pressable
              onPress={() => setSessionMenuVisible(false)}
              style={styles.drawerBackdrop}
            />
            <View style={styles.drawerPanel}>
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Current session</Text>
                <Pressable
                  onPress={() => setSessionMenuVisible(false)}
                  style={styles.drawerCloseButton}
                >
                  <Text style={styles.drawerCloseText}>Close</Text>
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={styles.drawerContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.metaPanel}>
                  <Text style={styles.metaLine}>Active user: {activeIdentitySession.userEmail}</Text>
                  <Text style={styles.metaLine}>Route: {activeTrip?.title ?? "n/a"}</Text>
                  <Text style={styles.metaLine}>Mode: {activeRecordingProfileLabel}</Text>
                  <Text style={styles.metaLine}>Last point: {lastPoint}</Text>
                  <Text style={styles.metaLine}>Active trips: {String(activeTripCount)}</Text>
                  <Text style={styles.metaLine}>Paused trips: {String(pausedTrips.length)}</Text>
                  <View style={styles.inlineActions}>
                    {canChangeMode ? (
                      <Pressable
                        onPress={() => {
                          setSessionMenuVisible(false);
                          setProfileModalVisible(true);
                        }}
                        style={styles.modeButton}
                      >
                        <Text style={styles.modeButtonText}>Change mode</Text>
                      </Pressable>
                    ) : null}
                    {activeTrip && recordingSession.status === "recording" ? (
                      <Pressable
                        onPress={() => void handlePauseRecording()}
                        style={styles.pauseButton}
                      >
                        <Text style={styles.pauseButtonText}>Pause</Text>
                      </Pressable>
                    ) : null}
                    {activeTrip ? (
                      <Pressable
                        onPress={() => {
                          setSessionMenuVisible(false);
                          setWaypointModalVisible(true);
                        }}
                        style={styles.noteButton}
                      >
                        <Text style={styles.noteButtonText}>Add note</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {recordingSession.status === "interrupted" ? (
                    <Text style={styles.metaWarning}>
                      The previous recording was interrupted. Tap the control to continue or stop it.
                    </Text>
                  ) : null}
                </View>

                {pausedTrips.length > 0 ? (
                  <View style={styles.waypointsPanel}>
                    <Text style={styles.metaTitle}>Paused trips</Text>
                    <View style={styles.pausedTripList}>
                      {pausedTrips.map((pausedTrip) => {
                        const visiblePauses = getVisibleTripPausesForTrip(currentUserTripPauses, pausedTrip.localId);
                        const openPause = visiblePauses[visiblePauses.length - 1] ?? null;

                        return (
                          <View key={pausedTrip.localId} style={styles.pausedTripCard}>
                            <View style={styles.pausedTripTextBlock}>
                              <Text style={styles.pausedTripTitle}>{pausedTrip.title}</Text>
                              <Text style={styles.pausedTripMeta}>
                                Paused{" "}
                                {openPause
                                  ? new Date(openPause.startedAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "earlier"}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => void handleResumePausedTrip(pausedTrip.localId)}
                              style={styles.resumeTripButton}
                            >
                              <Text style={styles.resumeTripButtonText}>Resume</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {activeTrip ? (
                  <View style={styles.waypointsPanel}>
                    <Text style={styles.metaTitle}>Recent waypoints</Text>
                    <ScrollView
                      contentContainerStyle={styles.waypointsScrollContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                    >
                      {recentWaypoints.length === 0 ? (
                        <Text style={styles.metaLine}>No saved notes on this route yet.</Text>
                      ) : (
                        recentWaypointCards.map(({ waypoint, category, photos }) => (
                          <View key={waypoint.localId} style={styles.waypointCard}>
                            {photos.length > 0 ? (
                              <ScrollView
                                contentContainerStyle={styles.waypointPhotoRow}
                                horizontal
                                nestedScrollEnabled
                                showsHorizontalScrollIndicator={false}
                              >
                                {photos.map((photo) => (
                                  <Pressable
                                    key={photo.localId}
                                    onPress={() => setSelectedPhotoAttachmentId(photo.localId)}
                                  >
                                    <Image
                                      source={{ uri: photo.localUri }}
                                      style={styles.waypointPhoto}
                                    />
                                  </Pressable>
                                ))}
                              </ScrollView>
                            ) : null}
                            <View style={styles.waypointCategoryRow}>
                              <View
                                style={[
                                  styles.waypointCategoryBadge,
                                  { backgroundColor: category.color },
                                ]}
                              >
                                <MaterialIcons
                                  color="#fffdf8"
                                  name={category.iconName}
                                  size={14}
                                />
                                <Text style={styles.waypointCategoryBadgeText}>{category.label}</Text>
                              </View>
                            </View>
                            <Text style={styles.waypointTitle}>{waypoint.title}</Text>
                            {waypoint.note ? (
                          <Text numberOfLines={2} style={styles.waypointNote}>
                            {waypoint.note}
                          </Text>
                        ) : null}
                        <View style={styles.waypointActions}>
                          <Pressable
                            onPress={() => handlePromptAddPhotoToWaypoint(waypoint.localId)}
                            style={styles.waypointActionButton}
                          >
                            <Text style={styles.waypointActionText}>Add photo</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void handleRemoveWaypoint(waypoint.localId)}
                            style={[styles.waypointActionButton, styles.waypointRemoveButton]}
                          >
                            <Text style={[styles.waypointActionText, styles.waypointRemoveText]}>
                              Remove note
                            </Text>
                          </Pressable>
                        </View>
                        <Text style={styles.waypointLocation}>
                          Location: {waypoint.latitude.toFixed(5)}, {waypoint.longitude.toFixed(5)}
                        </Text>
                            <Text style={styles.waypointMeta}>
                              {new Date(waypoint.createdAt).toLocaleString()}
                            </Text>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </View>
        ) : null}

      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 28, 20, 0.42)",
  },
  modalScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#fffdf8",
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1f2a1f",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#52624f",
    marginBottom: 4,
  },
  retryLocationButton: {
    marginTop: 12,
    alignSelf: "center",
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryLocationButtonText: {
    color: "#fffdf8",
    fontSize: 14,
    fontWeight: "700",
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#60705d",
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#243224",
  },
  fieldTextarea: {
    minHeight: 90,
  },
  photoDraftList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  photoHelpText: {
    fontSize: 13,
    color: "#52624f",
    marginTop: -2,
  },
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionPrimary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#243224",
    paddingVertical: 12,
  },
  photoActionPrimaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  photoActionSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#3c5a3c",
    paddingVertical: 12,
  },
  photoActionSecondaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fffdf8",
  },
  photoDraftCard: {
    width: 132,
    gap: 8,
  },
  photoPreview: {
    width: 132,
    height: 132,
    borderRadius: 18,
    backgroundColor: "#d7ddcf",
  },
  removeDraftPhotoButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f7e0db",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  removeDraftPhotoText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9f3f31",
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 18,
    backgroundColor: "#f3f6ef",
    minHeight: 110,
    paddingHorizontal: 16,
  },
  photoPlaceholderText: {
    fontSize: 14,
    color: "#60705d",
  },
  profileList: {
    gap: 8,
  },
  profileOption: {
    borderWidth: 1,
    borderColor: "#d7ddcf",
    borderRadius: 16,
    backgroundColor: "#ffffff",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  categoryPickerRow: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: "#fffdf8",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  categoryChipTextSelected: {
    color: "#fffdf8",
  },
  profileOptionSelected: {
    borderColor: "#243224",
    backgroundColor: "#edf4e9",
  },
  profileOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  profileOptionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  profileOptionLabelSelected: {
    color: "#1a261a",
  },
  profileOptionTag: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#60705d",
  },
  profileOptionTagSelected: {
    color: "#2d492d",
  },
  profileOptionHint: {
    fontSize: 13,
    color: "#52624f",
  },
  profileOptionHintSelected: {
    color: "#384738",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingVertical: 14,
  },
  modalButtonPrimary: {
    backgroundColor: "#243224",
  },
  modalButtonSecondary: {
    backgroundColor: "#e6ece1",
  },
  modalButtonPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fffdf8",
  },
  modalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  modalButtonDisabled: {
    opacity: 0.45,
  },
  photoViewerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(12, 16, 12, 0.86)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  photoViewerBackdropPressable: {
    ...StyleSheet.absoluteFillObject,
  },
  photoViewerCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 24,
    backgroundColor: "#101510",
    padding: 14,
    gap: 14,
  },
  photoViewerImage: {
    width: "100%",
    height: 420,
    borderRadius: 18,
    backgroundColor: "#1b231b",
  },
  photoViewerPager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  photoViewerNavButton: {
    minWidth: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  photoViewerNavButtonDisabled: {
    backgroundColor: "#2d342d",
    opacity: 0.4,
  },
  photoViewerNavText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  photoViewerNavTextDisabled: {
    color: "#cbd4cb",
  },
  photoViewerPagerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#dbe3db",
    textAlign: "center",
  },
  photoViewerActions: {
    flexDirection: "row",
    gap: 10,
  },
  photoViewerRemoveButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#8f3428",
    paddingVertical: 14,
  },
  photoViewerRemoveText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff7f4",
  },
  mapShell: {
    flex: 1,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: "#dfe8db",
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#dfe8db",
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#243224",
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 15,
    color: "#52624f",
    textAlign: "center",
  },
  mapTopOverlay: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    gap: 10,
  },
  sessionBar: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 22,
    backgroundColor: "rgba(255, 253, 248, 0.94)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  mapTypeBar: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255, 253, 248, 0.94)",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  mapTypeChip: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapTypeChipSelected: {
    backgroundColor: "#243224",
  },
  mapTypeChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#355035",
  },
  mapTypeChipTextSelected: {
    color: "#fffdf8",
  },
  sessionTrigger: {
    flex: 1,
    minHeight: 52,
    justifyContent: "center",
  },
  sessionTriggerLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#243224",
  },
  sessionTriggerMeta: {
    marginTop: 2,
    fontSize: 12,
    color: "#60705d",
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 28, 20, 0.18)",
  },
  drawerPanel: {
    width: "82%",
    maxWidth: 360,
    backgroundColor: "#f8f4ea",
    paddingTop: 72,
    paddingHorizontal: 14,
    paddingBottom: 18,
    borderTopLeftRadius: 28,
    borderBottomLeftRadius: 28,
    shadowColor: "#243224",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: -4, height: 0 },
    elevation: 10,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#243224",
  },
  drawerCloseButton: {
    borderRadius: 999,
    backgroundColor: "#e6ece1",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  drawerCloseText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#243224",
  },
  drawerContent: {
    gap: 10,
    paddingBottom: 20,
  },
  metaPanel: {
    width: "100%",
    borderRadius: 20,
    backgroundColor: "#fffdf8",
    padding: 16,
    gap: 6,
  },
  metaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#243224",
  },
  metaLine: {
    fontSize: 14,
    color: "#52624f",
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },
  modeButton: {
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  noteButton: {
    borderRadius: 999,
    backgroundColor: "#3c5a3c",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  pauseButton: {
    borderRadius: 999,
    backgroundColor: "#d5832b",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pauseButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  metaWarning: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: "#b0661d",
  },
  waypointsPanel: {
    width: "100%",
    borderRadius: 20,
    backgroundColor: "#fffdf8",
    padding: 16,
    gap: 10,
    maxHeight: 320,
  },
  pausedTripList: {
    gap: 10,
  },
  pausedTripCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#eef3e7",
    padding: 12,
  },
  pausedTripTextBlock: {
    flex: 1,
    gap: 2,
  },
  pausedTripTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  pausedTripMeta: {
    fontSize: 13,
    color: "#60705d",
  },
  resumeTripButton: {
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resumeTripButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fffdf8",
  },
  waypointsScrollContent: {
    gap: 10,
    paddingBottom: 4,
  },
  waypointCard: {
    borderRadius: 16,
    backgroundColor: "#eef3e7",
    padding: 12,
    gap: 4,
  },
  waypointCategoryRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  waypointCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  waypointCategoryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fffdf8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  waypointPhoto: {
    width: 112,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#d7ddcf",
  },
  waypointPhotoRow: {
    gap: 8,
    marginBottom: 4,
  },
  waypointTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#243224",
  },
  waypointNote: {
    fontSize: 13,
    color: "#455445",
  },
  waypointActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  waypointActionButton: {
    borderRadius: 999,
    backgroundColor: "#dfead9",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  waypointActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#355035",
  },
  waypointRemoveButton: {
    backgroundColor: "#f7e0db",
  },
  waypointRemoveText: {
    color: "#9f3f31",
  },
  waypointLocation: {
    fontSize: 12,
    fontWeight: "600",
    color: "#52624f",
  },
  waypointMeta: {
    fontSize: 12,
    color: "#60705d",
  },
});
