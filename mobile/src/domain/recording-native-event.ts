export type RecordingNativeEventType =
  | "native_service_started"
  | "native_service_stopped"
  | "native_location_callback"
  | "native_location_batch"
  | "native_watchdog_tick"
  | "native_watchdog_stale"
  | "native_location_restart_requested"
  | "native_location_restart_succeeded"
  | "native_location_restart_failed"
  | "provider_disabled"
  | "permission_missing"
  | "battery_optimization_not_ignored"
  | "background_task_error"
  | "background_tracking_started"
  | "background_tracking_stopped"
  | "background_tracking_restart_requested"
  | "background_tracking_restart_succeeded"
  | "background_tracking_restart_failed";

export interface RecordingNativeEvent {
  createdAt: string;
  eventType: RecordingNativeEventType;
  localId: string;
  payload: Record<string, unknown> | null;
  recordedAt: string;
  tripLocalId: string | null;
}
