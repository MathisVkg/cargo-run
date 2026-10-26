export type CaptureStatus = "Captured" | "Processing" | "Processed" | "Failed";
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OcrLine {
  id: string;
  text: string;
  box: Rect;
  confidence: number | null;
}
export interface OcrResult {
  provider: string;
  language: string;
  text: string;
  lines: OcrLine[];
  width: number;
  height: number;
  durationMs: number;
}
export interface Evidence {
  region: string;
  box: Rect | null;
  lineIds: string[];
  text: string;
}
export interface Field<T> {
  value: T | null;
  state: "Recognized" | "Ambiguous" | "Missing";
  confidence: number | null;
  method: "Explicit" | "Structured" | "Missing";
  evidence: Evidence | null;
}
export interface ScanObjective {
  commodity: Field<string>;
  pickup: Field<string>;
  destination: Field<string>;
  requiredSCU: Field<number>;
  deliveredSCU: Field<number>;
}
export interface ContractObservation {
  parserVersion?: string;
  title: Field<string>;
  company: Field<string>;
  reward: Field<number>;
  view: Field<"Offers" | "Accepted">;
  objectives: ScanObjective[];
  objectiveCount: Field<number>;
  warnings: string[];
  potentiallyIncomplete: boolean;
  captureId: string;
  capturedAt: string;
  acceptanceTimestamp: null;
}
export interface CaptureRecord {
  id: string;
  capturedAt: string;
  source: "Shortcut" | "Manual";
  status: CaptureStatus;
  displayId: string | null;
  displayLabel: string | null;
  screenshot: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  attempts: number;
  error: string | null;
  result: OcrResult | null;
  observation: ContractObservation | null;
}
export interface CaptureSettings {
  enabled: boolean;
  accelerator: string;
  sounds: boolean;
  displayId: string;
}
export interface CaptureDisplay {
  id: string;
  label: string;
  width: number;
  height: number;
  primary: boolean;
}
import type { ShortcutDiagnostics } from "./shortcut";
export interface OcrSnapshot {
  inputPrototype?: import("./inputPrototype").InputPrototypeSnapshot;
  recording: boolean;
  shortcutInvocations: number;
  shortcutDiagnostics: ShortcutDiagnostics;
  revision: number;
  settings: CaptureSettings;
  registered: boolean;
  shortcutError: string | null;
  engine: { name: string; available: boolean; error: string | null };
  captureAvailable: boolean;
  captureError: string | null;
  storagePath: string;
  displays: CaptureDisplay[];
  captures: CaptureRecord[];
  queued: number;
  processing: boolean;
  lastCapture: { at: string; success: boolean; message: string } | null;
  limit: number;
}
