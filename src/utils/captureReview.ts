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
