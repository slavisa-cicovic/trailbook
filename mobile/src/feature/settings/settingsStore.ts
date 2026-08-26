import { create } from 'zustand';
import { deleteAccount } from '@/core/domain/usecase/DeleteAccountUseCase';
import { deleteLocalTrips } from '@/core/domain/usecase/DeleteLocalTripsUseCase';
import { exportDatabase } from '@/core/domain/usecase/ExportDatabaseUseCase';
import { restoreTrips } from '@/core/domain/usecase/RestoreTripsUseCase';
import { useAuthStore } from '@/feature/auth/authStore';
import { useRecordingStore } from '@/feature/recording/recordingStore';
import { useTripsStore } from '@/feature/trips/tripsStore';
import { accessErrorMessage } from '@/core/domain/access/mobileAccessPolicy';
import { restoreSummaryMessage } from '@/core/domain/restore/restoreSummary';

interface SettingsUiState {
  isWorking: boolean;
  statusMessage: string | null;
  showDeleteAccountConfirm: boolean;
  showDeleteConfirm: boolean;
}

interface SettingsActions {
  onDeleteAccountClick(): void;
  onDeleteLocalClick(): void;
  onDismissDeleteAccountConfirm(): void;
  onDismissDeleteConfirm(): void;
  onConfirmDeleteAccount(): Promise<void>;
  onConfirmDeleteLocal(): Promise<void>;
  onExportDatabase(): Promise<void>;
  onRestoreFromBackend(): Promise<void>;
  onLogout(): Promise<void>;
  onStatusMessageShown(): void;
}

export const useSettingsStore = create<SettingsUiState & SettingsActions>((set) => ({
  isWorking: false,
  statusMessage: null,
  showDeleteAccountConfirm: false,
  showDeleteConfirm: false,

  onDeleteAccountClick() {
    set({ showDeleteAccountConfirm: true });
  },

  onDeleteLocalClick() {
    set({ showDeleteConfirm: true });
  },

  onDismissDeleteAccountConfirm() {
    set({ showDeleteAccountConfirm: false });
  },

  onDismissDeleteConfirm() {
    set({ showDeleteConfirm: false });
  },

  async onConfirmDeleteAccount() {
    const auth = useAuthStore.getState();
    if (!auth.userId || auth.status !== 'authenticated') {
      set({
        showDeleteAccountConfirm: false,
        statusMessage: 'Sign in again before deleting your account.',
      });
      return;
    }

    set({ showDeleteAccountConfirm: false, isWorking: true, statusMessage: null });
    const result = await deleteAccount(
      auth.userId,
      useRecordingStore.getState().isRecording,
    );
    if (!result.ok) {
      set({ isWorking: false, statusMessage: result.error });
      return;
    }

    await useAuthStore.getState().logout();
    set({ isWorking: false });
  },

  async onConfirmDeleteLocal() {
    set({ showDeleteConfirm: false, isWorking: true, statusMessage: null });
    const isRecording = useRecordingStore.getState().isRecording;
    const result = await deleteLocalTrips(isRecording);
    if (result.ok) {
      useTripsStore.getState().load();
      set({ isWorking: false, statusMessage: 'Your local trips deleted' });
    } else {
      set({ isWorking: false, statusMessage: accessErrorMessage(result.error) });
    }
  },

  async onExportDatabase() {
    set({ isWorking: true, statusMessage: null });
    const result = await exportDatabase();
    set({
      isWorking: false,
      statusMessage: result.ok ? null : result.error,
    });
  },

  async onRestoreFromBackend() {
    set({ isWorking: true, statusMessage: null });
    const result = await restoreTrips();
    if (result.ok) {
      useTripsStore.getState().load();
      set({ isWorking: false, statusMessage: restoreSummaryMessage(result.value) });
    } else {
      set({
        isWorking: false,
        statusMessage: accessErrorMessage(result.error),
      });
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
