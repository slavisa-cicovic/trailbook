import Constants from "expo-constants";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { PermissionsAndroid, Platform } from "react-native";

import { isMotionActivityAvailableAsync } from "../motion/motion-activity.service";

export type TrailbookPermissionKey =
  | "foregroundLocation"
  | "backgroundLocation"
  | "motionActivity"
  | "notifications"
  | "camera"
  | "mediaLibrary";

export interface TrailbookPermissionStatus {
  allRequiredGranted: boolean;
  backgroundLocationGranted: boolean;
  backgroundLocationSupported: boolean;
  cameraGranted: boolean;
  foregroundLocationGranted: boolean;
  mediaLibraryGranted: boolean;
  missingRequired: TrailbookPermissionKey[];
  motionActivityGranted: boolean;
  notificationsGranted: boolean;
}

const RUNS_IN_EXPO_GO = Constants.executionEnvironment === "storeClient";

const permissionLabels: Record<TrailbookPermissionKey, string> = {
  backgroundLocation: "Location: Allow all the time",
  camera: "Camera",
  foregroundLocation: "Location: While using the app",
  mediaLibrary: "Photos",
  motionActivity: "Physical activity",
  notifications: "Notifications",
};

function logPermissionSetupStep(step: string, details?: Record<string, unknown>) {
  console.warn("[Trailbook][permission-setup]", details ? { step, ...details } : { step });
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isAndroidPermissionRuntimeRequired(minSdk: number) {
  return Platform.OS === "android" && typeof Platform.Version === "number" && Platform.Version >= minSdk;
}

function buildStatus(input: Omit<TrailbookPermissionStatus, "allRequiredGranted" | "missingRequired">) {
  const missingRequired: TrailbookPermissionKey[] = [];

  if (!input.foregroundLocationGranted) {
    missingRequired.push("foregroundLocation");
  }

  if (!RUNS_IN_EXPO_GO && (!input.backgroundLocationSupported || !input.backgroundLocationGranted)) {
    missingRequired.push("backgroundLocation");
  }

  if (!input.motionActivityGranted) {
    missingRequired.push("motionActivity");
  }

  if (!input.notificationsGranted) {
    missingRequired.push("notifications");
  }

  if (!input.cameraGranted) {
    missingRequired.push("camera");
  }

  return {
    ...input,
    allRequiredGranted: missingRequired.length === 0,
    missingRequired,
  };
}

async function getForegroundLocationPermission() {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

async function requestForegroundLocationPermission() {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    return permission.granted;
  } catch (error) {
    logPermissionSetupStep("foreground-location-failed", { error: String(error) });
    return false;
  }
}

async function getBackgroundLocationPermission(backgroundLocationSupported: boolean) {
  if (!backgroundLocationSupported || RUNS_IN_EXPO_GO) {
    return false;
  }

  try {
    const permission = await Location.getBackgroundPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

async function requestBackgroundLocationPermission(input: {
  backgroundLocationSupported: boolean;
  foregroundLocationGranted: boolean;
}) {
  if (!input.backgroundLocationSupported || !input.foregroundLocationGranted || RUNS_IN_EXPO_GO) {
    return false;
  }

  try {
    const permission = await Location.requestBackgroundPermissionsAsync();

    if (permission.granted) {
      if (Platform.OS === "android") {
        await wait(750);
      }

      return true;
    }
  } catch (error) {
    logPermissionSetupStep("background-location-failed", { error: String(error) });
  }

  const backgroundLocationGranted = await getBackgroundLocationPermission(input.backgroundLocationSupported);

  if (Platform.OS === "android" && backgroundLocationGranted) {
    await wait(750);
  }

  return backgroundLocationGranted;
}

async function getBackgroundLocationSupport() {
  try {
    return await TaskManager.isAvailableAsync();
  } catch {
    return false;
  }
}

async function getMotionActivityPermission() {
  if (!(await isMotionActivityAvailableAsync())) {
    return true;
  }

  if (!isAndroidPermissionRuntimeRequired(29)) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  return permission ? PermissionsAndroid.check(permission) : true;
}

async function requestMotionActivityPermission() {
  if (!(await isMotionActivityAvailableAsync())) {
    return true;
  }

  if (!isAndroidPermissionRuntimeRequired(29)) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;

  if (!permission || (await PermissionsAndroid.check(permission))) {
    return true;
  }

  const status = await PermissionsAndroid.request(permission, {
    title: "Activity recognition",
    message:
      "Trailbook uses motion activity to distinguish walking, cycling, and driving more reliably in auto mode.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  return status === PermissionsAndroid.RESULTS.GRANTED;
}

async function getNotificationPermission() {
  if (!isAndroidPermissionRuntimeRequired(33)) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  return permission ? PermissionsAndroid.check(permission) : true;
}

async function requestNotificationPermission() {
  if (!isAndroidPermissionRuntimeRequired(33)) {
    return true;
  }

  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;

  if (!permission || (await PermissionsAndroid.check(permission))) {
    return true;
  }

  const status = await PermissionsAndroid.request(permission, {
    title: "Recording notification",
    message: "Trailbook needs notifications so Android can keep the recording service visible.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  return status === PermissionsAndroid.RESULTS.GRANTED;
}

async function getCameraPermission() {
  if (Platform.OS !== "android") {
    try {
      const permission = await ImagePicker.getCameraPermissionsAsync();
      return permission.granted;
    } catch {
      return false;
    }
  }

  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
}

async function requestCameraPermission() {
  if (Platform.OS !== "android") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    return permission.granted;
  }

  const permission = PermissionsAndroid.PERMISSIONS.CAMERA;

  if (await PermissionsAndroid.check(permission)) {
    return true;
  }

  const status = await PermissionsAndroid.request(permission, {
    title: "Camera permission needed",
    message: "Trailbook needs camera access to attach waypoint photos.",
    buttonPositive: "Allow",
    buttonNegative: "Deny",
  });

  if (status === PermissionsAndroid.RESULTS.GRANTED) {
    await wait(500);
    return true;
  }

  return false;
}

async function getMediaLibraryPermission() {
  try {
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

async function requestMediaLibraryPermission() {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return permission.granted;
  } catch {
    return false;
  }
}

export function getTrailbookPermissionLabel(permission: TrailbookPermissionKey) {
  return permissionLabels[permission];
}

export function formatMissingTrailbookPermissions(status: TrailbookPermissionStatus | null) {
  if (!status || status.missingRequired.length === 0) {
    return "";
  }

  return status.missingRequired.map(getTrailbookPermissionLabel).join(", ");
}

export async function getTrailbookPermissionStatus(): Promise<TrailbookPermissionStatus> {
  const backgroundLocationSupported = await getBackgroundLocationSupport();
  const foregroundLocationGranted = await getForegroundLocationPermission();
  const [
    backgroundLocationGranted,
    motionActivityGranted,
    notificationsGranted,
    cameraGranted,
    mediaLibraryGranted,
  ] = await Promise.all([
    getBackgroundLocationPermission(backgroundLocationSupported),
    getMotionActivityPermission(),
    getNotificationPermission(),
    getCameraPermission(),
    getMediaLibraryPermission(),
  ]);

  return buildStatus({
    backgroundLocationGranted,
    backgroundLocationSupported,
    cameraGranted,
    foregroundLocationGranted,
    mediaLibraryGranted,
    motionActivityGranted,
    notificationsGranted,
  });
}

export async function requestTrailbookPermissions(): Promise<TrailbookPermissionStatus> {
  logPermissionSetupStep("start");

  const foregroundLocationGranted = await requestForegroundLocationPermission();
  logPermissionSetupStep("foreground-location", { granted: foregroundLocationGranted });

  const backgroundLocationSupported = await getBackgroundLocationSupport();
  logPermissionSetupStep("background-supported", { supported: backgroundLocationSupported });

  const backgroundLocationGranted = await requestBackgroundLocationPermission({
    backgroundLocationSupported,
    foregroundLocationGranted,
  });
  logPermissionSetupStep("background-location", { granted: backgroundLocationGranted });

  if (Platform.OS === "android") {
    await wait(350);
  }

  const motionActivityGranted = await requestMotionActivityPermission();
  logPermissionSetupStep("motion-activity", { granted: motionActivityGranted });

  if (Platform.OS === "android") {
    await wait(250);
  }

  const notificationsGranted = await requestNotificationPermission();
  logPermissionSetupStep("notification", { granted: notificationsGranted });

  if (Platform.OS === "android") {
    await wait(250);
  }

  const cameraGranted = await requestCameraPermission();
  logPermissionSetupStep("camera", { granted: cameraGranted });

  const mediaLibraryGranted = await requestMediaLibraryPermission();
  logPermissionSetupStep("media-library", { granted: mediaLibraryGranted });

  const status = buildStatus({
    backgroundLocationGranted,
    backgroundLocationSupported,
    cameraGranted,
    foregroundLocationGranted,
    mediaLibraryGranted,
    motionActivityGranted,
    notificationsGranted,
  });

  logPermissionSetupStep("done", {
    allRequiredGranted: status.allRequiredGranted,
    missingRequired: status.missingRequired,
  });

  return status;
}
