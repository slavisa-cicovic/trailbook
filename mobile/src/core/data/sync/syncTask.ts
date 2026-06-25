import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { tripRepository } from '@/core/data/repository/TripRepositoryImpl';
import { uploadTrip } from '@/core/domain/usecase/UploadTripUseCase';
import { flushPendingTripDeletions } from '@/core/domain/usecase/DeleteTripUseCase';

export const SYNC_TASK = 'trailbook-sync-task';

// Must be defined at module level before any component mounts
TaskManager.defineTask(SYNC_TASK, async () => {
  try {
    const deletionResult = await flushPendingTripDeletions();
    if (!deletionResult.ok) return BackgroundTask.BackgroundTaskResult.Failed;

    const idsResult = await tripRepository.getAllPendingSyncIds();
    if (!idsResult.ok) return BackgroundTask.BackgroundTaskResult.Failed;

    for (const id of idsResult.value) {
      await uploadTrip(id);
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerSyncTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
    if (!isRegistered) {
      await BackgroundTask.registerTaskAsync(SYNC_TASK, {
        minimumInterval: 15, // minutes; system enforced minimum
      });
    }
  } catch {
    // Background task may not be available in all environments (e.g. simulators)
  }
}
