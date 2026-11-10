import type { CaptureRecord } from "../types/ocr";
export const failedAutomaticAttempt = (c: CaptureRecord) =>
  !!c.trigger &&
  (c.status === "Failed" ||
    ["Rejected", "Cancelled", "Duplicate"].includes(c.validation ?? ""));
export function reviewCaptures(captures: CaptureRecord[]): CaptureRecord[] {
  const seen = new Set<string>();
  return [...captures].reverse().filter((c) => {
    if (!failedAutomaticAttempt(c)) return true;
    if (seen.has(c.trigger!.requestId)) return false;
    seen.add(c.trigger!.requestId);
    return true;
  });
}

export type ScanStatus =
  | "Imported"
  | "Updated"
  | "Needs review"
  | "Processing"
  | "Failed";
export function scanPresentation(c: CaptureRecord): {
  status: ScanStatus;
  message: string;
} {
  if (
    ["Captured", "Processing"].includes(c.status) ||
    ["Queued", "Processing"].includes(c.recovery?.status ?? "")
  )
    return {
      status: "Processing",
      message: "Recognizing the saved screenshot locally…",
    };
  if (
    c.importResult?.status === "Imported" ||
    c.importResult?.status === "Updated"
  )
    return {
      status: c.importResult.status,
      message:
        c.importResult.status === "Imported"
          ? "Contract imported. Dashboard and Manifest are up to date."
          : "Contract updated. Dashboard and Manifest are up to date.",
    };
  if (c.status === "Failed" || c.importResult?.status === "Failed")
    return {
      status: "Failed",
      message:
        c.error ?? "Recognition could not finish. Retry the saved screenshot.",
    };
  const uncertain =
    c.observation?.objectives.findIndex(
      (o) =>
        o.requiredSCU.state === "Ambiguous" ||
        o.deliveredSCU.state === "Ambiguous",
    ) ?? -1;
  if (uncertain >= 0)
    return {
      status: "Needs review",
      message:
        "Check the cargo quantity for objective " + (uncertain + 1) + ".",
    };
  return {
    status: "Needs review",
    message: c.importResult?.message ?? "Check the missing contract details.",
  };
}
