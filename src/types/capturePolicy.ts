export type CaptureMode = "Automatic" | "Window" | "Display";
export interface CapturePolicy {
  source: CaptureMode;
  allowDisplayFallback: boolean;
  autoEnabled: boolean;
  delaySeconds: number;
  maxAttempts: number;
  autoSource: CaptureMode;
  cleanupEnabled: boolean;
  unlinkedDays: 1 | 7 | 14 | 30;
}
export interface CaptureTrigger {
  requestId: string;
  candidateMissionId: string;
  eventAt: string;
  eventType: "Accepted";
  delaySeconds: number;
  attempt: number;
  association: "Unverified";
  expectedTitle?: string;
}
export interface AutoRequest {
  id: string;
  missionId: string;
  eventAt: string;
  receivedAt: string;
  dueAt: string;
  deadline: string;
  attempts: number;
  expectedTitle?: string;
  status:
    "Pending" | "Running" | "Completed" | "Failed" | "Skipped" | "Expired";
  message: string;
  captureId: string | null;
}
export interface CaptureStorage {
  bytes: number;
  count: number;
  lastCleanupAt: string | null;
  deleted: number;
  errors: string[];
}
export const defaultCapturePolicy: CapturePolicy = {
  source: "Display",
  allowDisplayFallback: false,
  autoEnabled: false,
  delaySeconds: 3,
  maxAttempts: 3,
  autoSource: "Window",
  cleanupEnabled: true,
  unlinkedDays: 7,
};
export function validatePolicy(value: unknown): CapturePolicy {
  if (!value || typeof value !== "object")
    throw Error("Invalid capture policy.");
  const p = value as CapturePolicy;
  if (
    !["Automatic", "Window", "Display"].includes(p.source) ||
    !["Automatic", "Window", "Display"].includes(p.autoSource) ||
    typeof p.allowDisplayFallback !== "boolean" ||
    typeof p.autoEnabled !== "boolean" ||
    !Number.isInteger(p.delaySeconds) ||
    p.delaySeconds < 1 ||
    p.delaySeconds > 10 ||
    !Number.isInteger(p.maxAttempts) ||
    p.maxAttempts < 1 ||
    p.maxAttempts > 5 ||
    typeof p.cleanupEnabled !== "boolean" ||
    ![1, 7, 14, 30].includes(p.unlinkedDays)
  )
    throw Error(
      "Use a delay of 1–10 seconds, 1–5 attempts and a supported retention period.",
    );
  return {
    source: p.source,
    allowDisplayFallback: p.allowDisplayFallback,
    autoEnabled: p.autoEnabled,
    delaySeconds: p.delaySeconds,
    maxAttempts: p.maxAttempts,
    autoSource: p.autoSource,
    cleanupEnabled: p.cleanupEnabled,
    unlinkedDays: p.unlinkedDays,
  };
}
