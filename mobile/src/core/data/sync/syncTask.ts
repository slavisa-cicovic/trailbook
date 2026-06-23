import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { uploadTrip } from '@/core/domain/usecase/UploadTripUseCase';

export const SYNC_TASK = 'vellora-sync-task';

// Must be defined at module level before any component mounts
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const idsResult = await tripRepository.getAllPendingSyncIds();
    if (!idsResult.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

    for (const id of idsResult.value) {
      await uploadTrip(id);
    }

    return idsResult.value.length > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerSyncTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(SYNC_TASK, {
        minimumInterval: 15 * 60, // iOS minimum: 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // Background fetch may not be available in all environments (e.g. simulators)
  }
}
