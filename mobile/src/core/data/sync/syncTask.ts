import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

export const SYNC_TASK = 'trailbook-sync-task';

// Must be defined at module level before any component mounts
TaskManager.defineTask(SYNC_TASK, async () => {
  return BackgroundTask.BackgroundTaskResult.Success;
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

export async function unregisterSyncTask(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(SYNC_TASK);
    if (isRegistered) {
      await BackgroundTask.unregisterTaskAsync(SYNC_TASK);
    }
  } catch {
    // Background task may not be available in all environments (e.g. simulators)
  }
}
