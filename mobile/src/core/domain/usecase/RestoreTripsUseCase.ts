import type { Result } from '@/core/common/result';
import { ok, err } from '@/core/common/result';
import { authRepository } from '@/core/auth/SecureStoreAuthRepository';
import { rawCaptureRepository } from '@/core/data/repository/RawCaptureRepositoryImpl';
import { flushPendingTripDeletions } from './DeleteTripUseCase';
import { remoteTripDataSource } from '@/core/data/remote/FetchRemoteTripDataSource';
import { remoteWaypointImageDataSource } from '@/core/data/remote/FetchRemoteWaypointImageDataSource';
import * as waypointImageDao from '@/core/data/local/waypointImageDao';
import { saveRestoredPhoto } from '@/core/data/local/photoStorage';
import { dbEvents } from '@/core/db/events';
import { tripGroupRepository } from '@/core/data/repository/TripGroupRepositoryImpl';
import { requireCloudPremium } from '@/core/domain/access/mobileAccessPolicy';
import {
  emptyRestoreSummary,
  type RestoreIssueKind,
  type RestoreSummary,
} from '@/core/domain/restore/restoreSummary';

interface RemoteImageInfo {
  imageId: string;
  getUrl: string;
  objectKey: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordIssue(
  summary: RestoreSummary,
  kind: RestoreIssueKind,
  stableId: string,
  reason: string,
): void {
  summary.issues.push({ kind, reason });
  console.warn('[Trailbook][restore] item failed', { kind, stableId, reason });
}

async function restoreImage(
  waypointId: string,
  image: RemoteImageInfo,
): Promise<Result<void>> {
  try {
    const bytesResult = await remoteWaypointImageDataSource.downloadImage(image.getUrl);
    if (!bytesResult.ok) return err(bytesResult.error);

    const localUri = await saveRestoredPhoto(waypointId, image.imageId, bytesResult.value);
    await waypointImageDao.insert({
      id: image.imageId,
      waypointId,
      source: 'CAMERA',
      localUri,
      capturedAt: null,
      objectKey: image.objectKey,
      uploadState: 'UPLOADED',
    });
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

export async function restoreTrips(): Promise<Result<RestoreSummary>> {
  const access = await requireCloudPremium();
  if (!access.ok) return access;
  if (await authRepository.isDemo()) return err('Demo users cannot restore trips');

  const deletionResult = await flushPendingTripDeletions();
  if (!deletionResult.ok) {
    return err(`Could not synchronize pending trip deletions: ${deletionResult.error}`);
  }

  const listResult = await remoteTripDataSource.fetchTripList();
  if (!listResult.ok) return listResult;

  const summary = emptyRestoreSummary();
  for (const item of listResult.value) {
    let tripWasRestored = false;
    try {
      const bundleResult = await remoteTripDataSource.fetchTrip(item.clientTripId);
      if (!bundleResult.ok) {
        summary.failedTrips += 1;
        recordIssue(summary, 'trip', item.clientTripId, bundleResult.error);
        continue;
      }

      const saveResult = await rawCaptureRepository.replaceTripBundle(bundleResult.value);
      if (!saveResult.ok) {
        summary.failedTrips += 1;
        recordIssue(summary, 'trip', item.clientTripId, saveResult.error);
        continue;
      }

      summary.restoredTrips += 1;
      tripWasRestored = true;
      dbEvents.emit('trips:changed');

      for (const waypoint of bundleResult.value.waypoints) {
        let localImageIds: Set<string>;
        try {
          const localImages = await waypointImageDao.getForWaypoint(waypoint.id);
          localImageIds = new Set(localImages.map((image) => image.id));
        } catch (error) {
          summary.failedPhotoLists += 1;
          recordIssue(summary, 'photo-list', waypoint.id, errorMessage(error));
          continue;
        }

        const imagesResult = await remoteWaypointImageDataSource.getImages(waypoint.id);
        if (!imagesResult.ok) {
          summary.failedPhotoLists += 1;
          recordIssue(summary, 'photo-list', waypoint.id, imagesResult.error);
          continue;
        }

        for (const image of imagesResult.value) {
          if (localImageIds.has(image.imageId)) {
            summary.existingPhotos += 1;
            continue;
          }
          const restoreResult = await restoreImage(waypoint.id, image);
          if (!restoreResult.ok) {
            summary.failedPhotos += 1;
            recordIssue(summary, 'photo', image.imageId, restoreResult.error);
            continue;
          }
          summary.restoredPhotos += 1;
        }
      }
    } catch (error) {
      if (tripWasRestored) {
        summary.failedPhotoLists += 1;
        recordIssue(summary, 'photo-list', item.clientTripId, errorMessage(error));
      } else {
        summary.failedTrips += 1;
        recordIssue(summary, 'trip', item.clientTripId, errorMessage(error));
      }
    }
  }

  try {
    const groupsResult = await tripGroupRepository.restore();
    if (groupsResult.ok) {
      summary.groupsRestored = true;
    } else {
      summary.groupsFailed = true;
      recordIssue(summary, 'groups', 'groups', groupsResult.error);
    }
  } catch (error) {
    summary.groupsFailed = true;
    recordIssue(summary, 'groups', 'groups', errorMessage(error));
  }

  dbEvents.emit('trips:changed');
  return ok(summary);
}
