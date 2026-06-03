export type DiagnosticEventCategory =
  | "app"
  | "background"
  | "media"
  | "permissions"
  | "recording"
  | "sync";

export type DiagnosticEventSeverity = "debug" | "info" | "warning" | "error";

export interface DiagnosticEvent {
  category: DiagnosticEventCategory;
  createdAt: string;
  localId: string;
  name: string;
  payload: Record<string, unknown> | null;
  recordedAt: string;
  segmentLocalId: string | null;
  severity: DiagnosticEventSeverity;
  tripLocalId: string | null;
}
