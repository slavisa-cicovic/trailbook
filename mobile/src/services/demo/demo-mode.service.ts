import { Alert } from "react-native";

import type { AuthenticatedDeviceSession } from "../../domain/identity";
import type { Trip, Waypoint, WaypointAttachment } from "../../domain/trips";

export const DEMO_MONTHLY_TRIP_LIMIT = 5;
export const DEMO_PHOTO_LIMIT_PER_TRIP = 5;

function isSameYearMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

export function isDemoSession(identitySession: AuthenticatedDeviceSession | null | undefined) {
  return identitySession?.mode === "demo";
}

export function countDemoTripsForCurrentMonth(
  trips: Trip[],
  userId: string,
  now: Date = new Date(),
) {
  return trips.filter((trip) => {
    if (trip.userId !== userId) {
      return false;
    }

    const startedAt = new Date(trip.startedAt);

    if (Number.isNaN(startedAt.getTime())) {
      return false;
    }

    return isSameYearMonth(startedAt, now);
  }).length;
}

export function getRemainingDemoTripSlots(
  trips: Trip[],
  userId: string,
  now: Date = new Date(),
) {
  return Math.max(0, DEMO_MONTHLY_TRIP_LIMIT - countDemoTripsForCurrentMonth(trips, userId, now));
}

export function countTripPhotos(
  tripLocalId: string,
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
) {
  const tripWaypointIds = new Set(
    waypoints
      .filter((waypoint) => waypoint.tripLocalId === tripLocalId && waypoint.deletedAt === null)
      .map((waypoint) => waypoint.localId),
  );

  return attachments.filter(
    (attachment) =>
      attachment.deletedAt === null &&
      attachment.type === "photo" &&
      tripWaypointIds.has(attachment.waypointLocalId),
  ).length;
}

export function getRemainingDemoPhotoSlotsForTrip(
  tripLocalId: string,
  waypoints: Waypoint[],
  attachments: WaypointAttachment[],
  pendingDraftPhotoCount = 0,
) {
  const usedPhotoSlots = countTripPhotos(tripLocalId, waypoints, attachments) + pendingDraftPhotoCount;
  return Math.max(0, DEMO_PHOTO_LIMIT_PER_TRIP - usedPhotoSlots);
}

export function getDemoModeMessage() {
  return [
    `Demo mode lets you create up to ${DEMO_MONTHLY_TRIP_LIMIT} trips per calendar month.`,
    `Each trip can include up to ${DEMO_PHOTO_LIMIT_PER_TRIP} photos total.`,
    "Demo trips stay local on this device and cannot sync or be shared.",
  ].join("\n\n");
}

export function showDemoModeInfoDialog() {
  Alert.alert("Demo mode limits", getDemoModeMessage(), [{ text: "OK" }]);
}

export function showEnterDemoModeDialog(onContinue: () => void) {
  Alert.alert("Enter demo mode", getDemoModeMessage(), [
    {
      text: "Cancel",
      style: "cancel",
    },
    {
      text: "Continue",
      onPress: onContinue,
    },
  ]);
}
