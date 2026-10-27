export interface ShortcutContext {
  inspectedAt: string;
  foregroundProcess: string | null;
  foregroundPid: number | null;
  appElevated: boolean | null;
  foregroundElevated: boolean | null;
  gameElevated: boolean | null;
  gameVisible: boolean;
}
export type ShortcutStage =
  | "BackendInvocation"
  | "Registration"
  | "Invocation"
  | "RepeatSuppressed"
  | "CaptureRequested"
  | "CaptureSaved"
  | "CaptureError"
  | "Recording"
  | "Environment";
export interface ShortcutDiagnostic {
  id: string;
  at: string;
  stage: ShortcutStage;
  accelerator: string;
  source: "Shortcut" | "Manual" | "Automatic" | null;
  captureId: string | null;
  message: string;
  context: ShortcutContext | null;
}
export interface ShortcutDiagnostics {
  totalInvocations: number;
  lastInvocationAt: string | null;
  context: ShortcutContext | null;
  events: ShortcutDiagnostic[];
}
