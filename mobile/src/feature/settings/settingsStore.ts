import { create } from 'zustand';
import { deleteLocalTrips } from '@/core/domain/usecase/DeleteLocalTripsUseCase';
import { restoreTrips } from '@/core/domain/usecase/RestoreTripsUseCase';
import { useAuthStore } from '@/feature/auth/authStore';
import { useRecordingStore } from '@/feature/recording/recordingStore';
import { useTripsStore } from '@/feature/trips/tripsStore';

interface SettingsUiState {
  isWorking: boolean;
  statusMessage: string | null;
  showDeleteConfirm: boolean;
}

interface SettingsActions {
  onDeleteLocalClick(): void;
  onDismissDeleteConfirm(): void;
  onConfirmDeleteLocal(): Promise<void>;
  onRestoreFromBackend(): Promise<void>;
  onLogout(): Promise<void>;
  onStatusMessageShown(): void;
}

export const useSettingsStore = create<SettingsUiState & SettingsActions>((set) => ({
  isWorking: false,
  statusMessage: null,
  showDeleteConfirm: false,

  onDeleteLocalClick() {
    set({ showDeleteConfirm: true });
  },

  onDismissDeleteConfirm() {
    set({ showDeleteConfirm: false });
  },

  async onConfirmDeleteLocal() {
    set({ showDeleteConfirm: false, isWorking: true, statusMessage: null });
    const isRecording = useRecordingStore.getState().isRecording;
    const result = await deleteLocalTrips(isRecording);
    if (result.ok) {
      useTripsStore.getState().load();
      set({ isWorking: false, statusMessage: 'All local trips deleted' });
    } else {
      set({ isWorking: false, statusMessage: result.error });
    }
  },

  async onRestoreFromBackend() {
    set({ isWorking: true, statusMessage: null });
    const result = await restoreTrips();
    if (result.ok) {
      useTripsStore.getState().load();
      set({ isWorking: false, statusMessage: 'Restore complete' });
    } else {
      set({ isWorking: false, statusMessage: result.error });
    }
  },

  async onLogout() {
    set({ isWorking: true });
    await useAuthStore.getState().logout();
    set({ isWorking: false });
    // Navigation handled automatically by AuthGate in _layout.tsx
  },

  onStatusMessageShown() {
    set({ statusMessage: null });
  },
}));
