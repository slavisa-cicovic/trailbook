import type { AuthenticatedDeviceSession } from "../../domain/identity";
import { setTripGroupMembers } from "../../state/trip-group-members-store";
import { setTripGroups } from "../../state/trip-groups-store";
import { setTrips } from "../../state/trips-store";
import { setWaypointAttachments } from "../../state/waypoint-attachments-store";
import {
  drainSyncOutbox,
  enqueueTripGroupsSync,
  enqueueTripSync,
  type SyncWorkerDrainResult,
} from "./sync-worker.service";

export async function applySyncDrainResultToStores(result: SyncWorkerDrainResult): Promise<void> {
  if (result.trips) {
    await setTrips(result.trips);
  }

  if (result.waypointAttachments) {
    await setWaypointAttachments(result.waypointAttachments);
  }

  if (result.tripGroups) {
    await setTripGroups(result.tripGroups);
  }

  if (result.tripGroupMembers) {
    await setTripGroupMembers(result.tripGroupMembers);
  }
}

function assertDrainSucceeded(result: SyncWorkerDrainResult): void {
  if (result.failed > 0) {
    throw new Error("One or more queued sync operations failed.");
  }
}

export async function enqueueAndDrainTripSync(input: {
  enqueueTripGroupsForUserId?: string | null;
  identitySession: AuthenticatedDeviceSession;
  tripLocalId: string;
}): Promise<SyncWorkerDrainResult> {
  await enqueueTripSync(input.tripLocalId);

  if (input.enqueueTripGroupsForUserId) {
    await enqueueTripGroupsSync(input.enqueueTripGroupsForUserId);
  }

  const result = await drainSyncOutbox(input.identitySession);
  await applySyncDrainResultToStores(result);
  assertDrainSucceeded(result);

  return result;
}

export async function enqueueAndDrainTripGroupsSync(input: {
  identitySession: AuthenticatedDeviceSession;
  userId: string;
}): Promise<SyncWorkerDrainResult> {
  await enqueueTripGroupsSync(input.userId);

  const result = await drainSyncOutbox(input.identitySession);
  await applySyncDrainResultToStores(result);
  assertDrainSucceeded(result);

  return result;
}
