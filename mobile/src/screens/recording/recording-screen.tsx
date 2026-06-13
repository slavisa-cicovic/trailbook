import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Redirect } from "expo-router";
import { MaterialIcons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, type Region } from "react-native-maps";

import ScreenLayout from "../../components/layout/screen-layout";
import RecordingControl from "../../components/recording/recording-control";
import Card from "../../components/ui/card";
import FormField from "../../components/ui/form-field";
import WaypointCategoryPicker from "../../components/waypoints/waypoint-category-picker";
import WaypointPhotoActionRow from "../../components/waypoints/waypoint-photo-action-row";
import WaypointPhotoDraftCarousel from "../../components/waypoints/waypoint-photo-draft-carousel";
import {
  DEFAULT_WAYPOINT_CATEGORY,
} from "../../constants/waypoint-categories";
import type { TrailbookMapType } from "../trips/components/trip-route-map";
import {
  getBackgroundLocationTrackingDiagnosticState,
  getCurrentForegroundLocation,
  restartBackgroundLocationTracking,
  type CurrentLocationSnapshot,
  watchImmediateForegroundLocation,
  watchForegroundLocation,
  getUnifiedAutoTrackingProfile,
} from "../../services/location/location.service";
import {
  ensureMotionActivityUpdatesForAutoMode,
  isMotionActivityAvailableAsync,
  stopMotionActivityUpdates,
} from "../../services/motion/motion-activity.service";
import {
  type RecordingDraftInput,
} from "../../services/recording/recording.service";
import {
  getOpenTripSegmentForTrip,
} from "../../services/trip-segments/trip-segments.service";
import { getVisibleTripPausesForTrip } from "../../services/trip-pauses/trip-pauses.service";
import {
  capturePhotoWithCamera,
  isCameraPermissionDeniedError,
  pickPhotosFromLibrary,
} from "../../services/media/photo-picker.service";
import {
  DEMO_PHOTO_LIMIT_PER_TRIP,
  getRemainingDemoPhotoSlotsForTrip,
  isDemoSession,
} from "../../services/demo/demo-mode.service";
import {
  getLocationCallbackDiagnosticState,
  recordLocationSilentGap,
} from "../../services/trip-points/trip-points.service";
import { recordRecordingNativeEvent } from "../../services/recording/recording-native-events.service";
import {
  markWaypointAttachmentDeleted,
  markWaypointDeleted,
} from "../../services/trips/trips-management.service";
import { loadTripPointsForTrip } from "../../repositories/trip-points-repository";
import {
  createAttachmentTimestamp,
  createPhotoAttachmentForWaypoint,
  createWaypointForTrip,
  getSuggestedWaypointTitle,
  type WaypointDraftInput,
} from "../../services/waypoints/waypoints.service";
import {
  mergeTripPointsInMemory,
  setTripPointsInMemory,
} from "../../state/trip-points-store";
import {
  setWaypointAttachments,
} from "../../state/waypoint-attachments-store";
import { setWaypoints } from "../../state/waypoints-store";
import { useRecordingScreenModel } from "./recording-screen.model";
import {
  getEmptyRecordingDraft,
  continueInterruptedRecordingFromScreenController,
  pauseRecordingFromScreenController,
  resumePausedTripFromScreenController,
  startRecordingFromScreenController,
  stopRecordingFromScreenController,
} from "./recording-screen.controller";
import RecordingPhotoViewerModal from "./components/recording-photo-viewer-modal";
import RecordingStartModal from "./components/recording-start-modal";

const LOCATION_SILENT_GAP_WARNING_MS = 2 * 60 * 1000;
const LOCATION_SILENT_GAP_WATCHDOG_INTERVAL_MS = 30 * 1000;
const SESSION_SHEET_DISMISS_DRAG_Y = 80;
const SESSION_SHEET_DISMISS_VELOCITY_Y = 1.1;

export default function RecordingScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const mapTypeOptions: { label: string; value: TrailbookMapType }[] = [
    { label: "Map", value: "standard" },
    { label: "Satellite", value: "satellite" },
    { label: "Hybrid", value: "hybrid" },
  ];
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationSnapshot | null>(null);
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [startRecordingBusy, setStartRecordingBusy] = useState(false);
  const [waypointModalVisible, setWaypointModalVisible] = useState(false);
  const [sessionMenuVisible, setSessionMenuVisible] = useState(false);
  const [selectedPhotoAttachmentId, setSelectedPhotoAttachmentId] = useState<string | null>(null);
  const [mapType, setMapType] = useState<TrailbookMapType>("standard");
  const [sessionSheetDragY] = useState(() => new Animated.Value(0));
  const lastWatchdogTickBucketRef = useRef<string | null>(null);
  const lastSilentGapBucketRef = useRef<string | null>(null);
  const lastSilentGapRecoveryBucketRef = useRef<string | null>(null);
  const silentGapRecoveryRunningRef = useRef(false);
  const [recordingDraft, setRecordingDraft] = useState<RecordingDraftInput>(getEmptyRecordingDraft);
  const [waypointDraft, setWaypointDraft] = useState<WaypointDraftInput>({
    category: DEFAULT_WAYPOINT_CATEGORY,
    title: "",
    note: "",
    photos: [],
  });
  const {
    activeIdentitySession,
    activeRecordingProfile,
    activeRecordingRouteModel,
    activeSegment,
    activeTrip,
    activeTripCount,
    activeTripPoints,
    backgroundLocationPermissionGranted,
    backgroundRecordingSupported,
    batteryOptimizationIgnored,
    batteryOptimizationSupported,
    canSaveWaypoint,
    canStartRecording,
    currentUserTripPauses,
    currentUserTrips,
    currentUserWaypointAttachments,
    currentUserWaypoints,
    draftPhotoCardWidth,
    hasNextPhoto,
    hasPreviousPhoto,
    lastPoint,
    locationPermissionGranted,
    missingPermissionsText,
    missingRequired,
    pausedTrips,
    permissionsReady,
    recentWaypointCards,
    recentWaypoints,
    recordingSession,
    refreshStatus,
    requestPermissions,
    selectedPhotoAttachment,
    selectedPhotoIndex,
    selectedPhotoWaypointAttachments,
    sessionTriggerLabel,
    tripPauses,
    tripSegments,
    trips,
    waypointAttachments,
    waypoints,
  } = useRecordingScreenModel({
    recordingDraft,
    screenWidth,
    selectedPhotoAttachmentId,
    waypointDraft,
  });
  const activeTripLocalId = activeTrip?.localId ?? null;

  function logRecordingStartStep(step: string, details?: Record<string, unknown>) {
    console.warn("[Trailbook][recording-start]", details ? { step, ...details } : { step });
  }

  function closeSessionMenu() {
    setSessionMenuVisible(false);
    sessionSheetDragY.setValue(0);
  }

  const sessionSheetPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) =>
      Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 4,
    onPanResponderMove: (_event, gestureState) => {
      sessionSheetDragY.setValue(Math.max(0, gestureState.dy));
    },
    onPanResponderRelease: (_event, gestureState) => {
      if (
        gestureState.dy > SESSION_SHEET_DISMISS_DRAG_Y ||
        gestureState.vy > SESSION_SHEET_DISMISS_VELOCITY_Y
      ) {
        closeSessionMenu();
        return;
      }

      Animated.spring(sessionSheetDragY, {
        toValue: 0,
        tension: 90,
        friction: 12,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(sessionSheetDragY, {
        toValue: 0,
        tension: 90,
        friction: 12,
        useNativeDriver: true,
      }).start();
    },
  });

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

  function resetWaypointDraft() {
    setWaypointDraft({
      category: DEFAULT_WAYPOINT_CATEGORY,
      title: "",
      note: "",
      photos: [],
    });
  }

  function closeWaypointModal() {
    setWaypointModalVisible(false);
    resetWaypointDraft();
  }

  function openWaypointModal() {
    resetWaypointDraft();
    setWaypointModalVisible(true);
  }


  useEffect(() => {
    let active = true;
    let stopWatchingLocation: (() => void) | null = null;

    async function hydrateLocation() {
      if (locationPermissionGranted !== true) {
        return;
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
          : await watchForegroundLocation(activeRecordingProfile, (nextLocation) => {
              setCurrentLocation(nextLocation);
            });
    }

    void hydrateLocation();

    return () => {
      active = false;
      stopWatchingLocation?.();
    };
  }, [activeRecordingProfile, activeTrip, locationPermissionGranted, recordingSession.status]);

  useEffect(() => {
    let cancelled = false;

    async function loadActiveTripPoints() {
      if (!activeTripLocalId) {
        setTripPointsInMemory([]);
        return;
      }

      setTripPointsInMemory([]);
      const nextTripPoints = await loadTripPointsForTrip(activeTripLocalId);

      if (!cancelled) {
        mergeTripPointsInMemory(nextTripPoints);
      }
    }

    void loadActiveTripPoints();

    return () => {
      cancelled = true;
    };
  }, [activeTripLocalId]);

  useEffect(() => {
    let active = true;

    async function syncMotionActivityUpdates() {
      const available = await isMotionActivityAvailableAsync();

      if (!active || !available) {
        return;
      }

      if (recordingSession.status === "recording") {
        await ensureMotionActivityUpdatesForAutoMode();
        return;
      }

      await stopMotionActivityUpdates();
    }

    void syncMotionActivityUpdates();

    return () => {
      active = false;
    };
  }, [recordingSession.status]);

  useEffect(() => {
    if (recordingSession.status !== "recording" || !recordingSession.activeTripId) {
      lastWatchdogTickBucketRef.current = null;
      lastSilentGapBucketRef.current = null;
      lastSilentGapRecoveryBucketRef.current = null;
      silentGapRecoveryRunningRef.current = false;
      return;
    }

    const tripLocalId = recordingSession.activeTripId;

    async function checkLocationSilentGap() {
      const observedAtMs = Date.now();
      const observedAt = new Date(observedAtMs).toISOString();
      const backgroundTrackingProfile = getUnifiedAutoTrackingProfile();
      const diagnosticState = getLocationCallbackDiagnosticState(tripLocalId);
      const sessionStartedAtMs = recordingSession.startedAt
        ? new Date(recordingSession.startedAt).getTime()
        : Number.NaN;
      const lastCallbackReceivedAtMs =
        diagnosticState.lastCallbackReceivedAtMs ??
        (Number.isFinite(sessionStartedAtMs) ? sessionStartedAtMs : observedAtMs);
      const gapMs = observedAtMs - lastCallbackReceivedAtMs;
      const lastCallbackReceivedAt =
        diagnosticState.lastCallbackReceivedAtMs === null
          ? null
          : new Date(diagnosticState.lastCallbackReceivedAtMs).toISOString();
      const tickBucket = `${tripLocalId}:${Math.floor(observedAtMs / LOCATION_SILENT_GAP_WARNING_MS)}`;
      let backgroundTrackingState: Awaited<
        ReturnType<typeof getBackgroundLocationTrackingDiagnosticState>
      > | null = null;
      const basePayload = {
        appState: AppState.currentState,
        backgroundTrackingProfile,
        batteryOptimizationIgnored:
          batteryOptimizationSupported === true ? batteryOptimizationIgnored : null,
        gapMs: Math.trunc(gapMs),
        lastCallbackReceivedAt,
        profile: activeRecordingProfile,
        recordingMode: "auto",
      };

      if (Platform.OS === "android" && lastWatchdogTickBucketRef.current !== tickBucket) {
        lastWatchdogTickBucketRef.current = tickBucket;
        backgroundTrackingState =
          await getBackgroundLocationTrackingDiagnosticState(backgroundTrackingProfile);
        void recordRecordingNativeEvent({
          eventType: "native_watchdog_tick",
          payload: {
            ...basePayload,
            backgroundTrackingState,
          },
          recordedAt: observedAt,
          tripLocalId,
        });
      }

      if (gapMs < LOCATION_SILENT_GAP_WARNING_MS) {
        return;
      }

      const gapBucket = `${tripLocalId}:${Math.floor(gapMs / LOCATION_SILENT_GAP_WARNING_MS)}`;

      if (lastSilentGapBucketRef.current === gapBucket) {
        return;
      }

      lastSilentGapBucketRef.current = gapBucket;

      if (Platform.OS === "android" && !backgroundTrackingState) {
        backgroundTrackingState =
          await getBackgroundLocationTrackingDiagnosticState(backgroundTrackingProfile);
      }

      void recordRecordingNativeEvent({
        eventType: "native_watchdog_stale",
        payload: {
          ...basePayload,
          backgroundTrackingState,
        },
        recordedAt: observedAt,
        tripLocalId,
      });
      recordLocationSilentGap(tripLocalId, "auto", {
        batteryOptimizationIgnored:
          batteryOptimizationSupported === true ? batteryOptimizationIgnored : null,
        gapMs,
        lastCallbackReceivedAt,
        observedAt,
      });

      if (
        Platform.OS !== "android" ||
        AppState.currentState !== "active" ||
        lastSilentGapRecoveryBucketRef.current === gapBucket ||
        silentGapRecoveryRunningRef.current
      ) {
        return;
      }

      lastSilentGapRecoveryBucketRef.current = gapBucket;
      silentGapRecoveryRunningRef.current = true;

      try {
        console.warn("[Trailbook][location-silent-gap-recovery]", {
          gapMs: Math.trunc(gapMs),
          profile: activeRecordingProfile,
          trackingStarted: backgroundTrackingState?.started ?? null,
          tripLocalId,
        });
        await restartBackgroundLocationTracking(
          backgroundTrackingProfile,
          tripLocalId,
          "silent-gap-watchdog",
        );
      } catch (error) {
        console.warn("[Trailbook][location-silent-gap-recovery]", {
          error: error instanceof Error ? error.message : String(error),
          step: "failed",
          tripLocalId,
        });
      } finally {
        silentGapRecoveryRunningRef.current = false;
      }
    }

    void checkLocationSilentGap();
    const intervalId = setInterval(() => void checkLocationSilentGap(), LOCATION_SILENT_GAP_WATCHDOG_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [
    activeRecordingProfile,
    batteryOptimizationIgnored,
    batteryOptimizationSupported,
    recordingSession.activeTripId,
    recordingSession.startedAt,
    recordingSession.status,
  ]);

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

  async function handleStartRecording() {
    if (startRecordingBusy) {
      return;
    }

    setStartRecordingBusy(true);

    try {
      const result = await startRecordingFromScreenController({
        activeIdentitySession,
        backgroundLocationPermissionGranted,
        backgroundRecordingSupported,
        currentUserTrips,
        logStep: logRecordingStartStep,
        missingRequired,
        permissionsReady,
        recordingDraft,
        recordingSession,
        refreshStatus,
        tripSegments,
        trips,
      });

      if (result.ok) {
        setStartModalVisible(false);
        setRecordingDraft(getEmptyRecordingDraft());
        return;
      }

      if (result.reason === "demo_limit") {
        Alert.alert("Demo limit reached", result.message);
        return;
      }

      if (result.reason === "active_route") {
        Alert.alert("Active route", result.message);
        return;
      }

      if (result.reason === "native_start_failed") {
        Alert.alert("Recording unavailable", result.message);
      }
    } finally {
      setStartRecordingBusy(false);
    }
  }

  async function handlePauseRecording() {
    const result = await pauseRecordingFromScreenController({
      backgroundRecordingSupported,
      routeModel: activeRecordingRouteModel,
      tripPauses,
      tripSegments,
      trips,
      waypoints,
    });

    if (result.ok) {
      setSessionMenuVisible(false);
    }
  }

  async function handleStopRecording() {
    await stopRecordingFromScreenController({
      backgroundRecordingSupported,
      routeModel: activeRecordingRouteModel,
      tripSegments,
      trips,
      waypoints,
    });
  }

  async function handleResumePausedTrip(tripLocalId: string) {
    const result = await resumePausedTripFromScreenController({
      activeIdentitySession,
      backgroundLocationPermissionGranted,
      backgroundRecordingSupported,
      currentUserTrips,
      recordingSession,
      tripLocalId,
      tripPauses,
      tripSegments,
      trips,
    });

    if (result.ok) {
      setSessionMenuVisible(false);
      return;
    }

    if (result.reason === "active_route") {
      Alert.alert("Active route", result.message);
      return;
    }

    if (result.reason === "paused_route_missing") {
      Alert.alert("Paused route missing", result.message);
    }
  }

  async function handleContinueInterruptedRecording() {
    const result = await continueInterruptedRecordingFromScreenController({
      backgroundLocationPermissionGranted,
      backgroundRecordingSupported,
      recordingSession,
    });

    if (!result.ok && result.reason === "native_start_failed") {
      Alert.alert("Recording unavailable", result.message);
    }
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
      recordingSession.activeSegmentId ?? activeSegment?.localId ?? getOpenTripSegmentForTrip(tripSegments, activeTrip.localId)?.localId ?? null,
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
    closeWaypointModal();
  }

  function showCameraPermissionAlert(canAskAgain: boolean) {
    Alert.alert(
      "Camera permission needed",
      "Trailbook needs camera access to attach waypoint photos. Run permission setup again and allow camera access.",
      canAskAgain
        ? [{ text: "Set up permissions", onPress: () => void requestPermissions() }]
        : [
            { text: "Cancel", style: "cancel" },
            { text: "Set up permissions", onPress: () => void requestPermissions() },
          ],
    );
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

    let photo = null;

    try {
      photo = await capturePhotoWithCamera();
    } catch (error) {
      if (isCameraPermissionDeniedError(error)) {
        showCameraPermissionAlert(error.canAskAgain);
        return;
      }

      throw error;
    }

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
      let photo = null;

      try {
        photo = await capturePhotoWithCamera();
      } catch (error) {
        if (isCameraPermissionDeniedError(error)) {
          showCameraPermissionAlert(error.canAskAgain);
          return;
        }

        throw error;
      }

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
      if (!permissionsReady) {
        return;
      }

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
      scrollEnabled={false}
      showBottomNavigation
      title="Trailbook"
    >
      <Modal
        animationType="fade"
        onRequestClose={closeWaypointModal}
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
            <Card
              style={styles.modalCard}
              subtitle="Save a quick waypoint for this route using your current location."
              title="Add note"
            >
              <FormField
                autoCapitalize="sentences"
                label="Title"
                onChangeText={(title) => setWaypointDraft((current) => ({ ...current, title }))}
                placeholder="Viewpoint"
                value={waypointDraft.title}
              />

              <WaypointCategoryPicker
                onChangeCategory={handleSelectWaypointCategory}
                value={waypointDraft.category}
              />

              <FormField
                autoCapitalize="sentences"
                label="Note"
                multiline
                numberOfLines={3}
                onChangeText={(note) => setWaypointDraft((current) => ({ ...current, note }))}
                placeholder="What do you want to remember here?"
                textarea
                value={waypointDraft.note}
              />

              <Text style={styles.fieldLabel}>Photos</Text>
              <Text style={styles.photoHelpText}>
                Add one or more photos from the camera or your library.
              </Text>
              <WaypointPhotoActionRow
                onAddPhotos={() => void handleChoosePhoto()}
                onTakePhoto={() => void handleTakePhoto()}
              />

              <WaypointPhotoDraftCarousel
                cardWidth={draftPhotoCardWidth}
                onRemovePhoto={handleRemoveDraftPhoto}
                photos={waypointDraft.photos}
              />

              <View style={styles.modalActions}>
                <Pressable
                  onPress={closeWaypointModal}
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
            </Card>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <RecordingPhotoViewerModal
        attachment={selectedPhotoAttachment}
        hasNext={hasNextPhoto}
        hasPrevious={hasPreviousPhoto}
        index={selectedPhotoIndex}
        totalCount={selectedPhotoWaypointAttachments.length}
        onClose={() => setSelectedPhotoAttachmentId(null)}
        onNext={handleShowNextPhoto}
        onPrevious={handleShowPreviousPhoto}
        onRemove={(localId) => void handleRemoveWaypointPhoto(localId)}
      />

      <RecordingStartModal
        canStart={canStartRecording}
        draft={recordingDraft}
        starting={startRecordingBusy}
        visible={startModalVisible}
        onChangeDraftDescription={(description) => setRecordingDraft((current) => ({ ...current, description }))}
        onChangeDraftTitle={(title) => setRecordingDraft((current) => ({ ...current, title }))}
        onClose={() => setStartModalVisible(false)}
        onStart={() => void handleStartRecording()}
      />

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
              disabled={recordingSession.status === "idle" && !permissionsReady}
              onPress={handleRecordingControlPress}
              status={recordingSession.status}
            />
            <Pressable
              onPress={() => setSessionMenuVisible((current) => !current)}
              style={styles.sessionTrigger}
            >
              <Text style={styles.sessionTriggerLabel}>{sessionTriggerLabel}</Text>
              <Text style={styles.sessionTriggerMeta}>
                {recordingSession.status === "idle" && !permissionsReady
                  ? "Trailbook permissions required"
                  : recordingSession.status === "idle"
                  ? "Tap for session details"
                  : `${recordingSession.status} • tap for details`}
              </Text>
            </Pressable>
          </View>
          {missingRequired !== null && !permissionsReady ? (
            <View style={styles.permissionWarningCard}>
              <Text style={styles.permissionWarningTitle}>Trailbook needs permissions</Text>
              <Text style={styles.permissionWarningText}>
                Start recording is disabled until these are allowed: {missingPermissionsText}.
              </Text>
              <Pressable
                hitSlop={10}
                onPress={() => void requestPermissions()}
                style={styles.permissionWarningButton}
              >
                <Text style={styles.permissionWarningButtonText}>Set up permissions</Text>
              </Pressable>
            </View>
          ) : null}
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

        <Modal
          animationType="slide"
          onRequestClose={closeSessionMenu}
          transparent
          visible={sessionMenuVisible}
        >
          <View style={styles.drawerOverlay}>
            <Pressable
              onPress={closeSessionMenu}
              style={styles.drawerBackdrop}
            />
            <Animated.View
              {...sessionSheetPanResponder.panHandlers}
              style={[styles.drawerPanel, { transform: [{ translateY: sessionSheetDragY }] }]}
            >
              <View style={styles.drawerHandle} />
              <View style={styles.drawerHeader}>
                <Text style={styles.drawerTitle}>Current session</Text>
              </View>

              <ScrollView
                contentContainerStyle={styles.drawerContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.metaPanel}>
                  <Text style={styles.metaLine}>Active user: {activeIdentitySession.userEmail}</Text>
                  <Text style={styles.metaLine}>Route: {activeTrip?.title ?? "n/a"}</Text>
                  <Text style={styles.metaLine}>Last point: {lastPoint}</Text>
                  <Text style={styles.metaLine}>Active trips: {String(activeTripCount)}</Text>
                  <Text style={styles.metaLine}>Paused trips: {String(pausedTrips.length)}</Text>
                  <View style={styles.inlineActions}>
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
                          closeSessionMenu();
                          openWaypointModal();
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
            </Animated.View>
          </View>
        </Modal>

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
  photoHelpText: {
    fontSize: 13,
    color: "#52624f",
    marginTop: -2,
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
    zIndex: 30,
    elevation: 30,
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
  permissionWarningCard: {
    borderRadius: 20,
    backgroundColor: "rgba(255, 253, 248, 0.96)",
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2b15c",
    zIndex: 31,
    elevation: 31,
  },
  permissionWarningTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8a5217",
  },
  permissionWarningText: {
    fontSize: 13,
    color: "#5b4a31",
  },
  permissionWarningButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#243224",
    paddingHorizontal: 14,
    paddingVertical: 9,
    zIndex: 32,
    elevation: 32,
  },
  permissionWarningButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fffdf8",
  },
  drawerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20, 28, 20, 0.24)",
  },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  drawerPanel: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: "rgba(248, 244, 234, 0.98)",
    paddingTop: 10,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === "ios" ? 30 : 20,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: "#243224",
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 80,
  },
  drawerHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(82, 98, 79, 0.35)",
    marginBottom: 12,
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
