import { describe, it, expect } from "vitest";
import { scanPresentation } from "../src/utils/captureReview";
import type { CaptureRecord } from "../src/types/ocr";
const base = {
  status: "Processed",
  importResult: {
    status: "Imported",
    message: "Dashboard and Manifest updated.",
  },
  recovery: {
    status: "Unchanged",
    message:
      "Confirm uncertain objective quantities; automatic import was withheld.",
  },
} as CaptureRecord;
describe("Current scan presentation", () => {
  it("never displays a stale recognition rejection as the current imported result", () => {
    expect(scanPresentation(base)).toEqual({
      status: "Imported",
      message: "Contract imported. Dashboard and Manifest are up to date.",
    });
  });
  it("uses current processing state ahead of a prior successful import", () => {
    expect(scanPresentation({ ...base, status: "Processing" }).status).toBe(
      "Processing",
    );
  });
  it("labels unresolved outcomes Needs review while retaining their diagnostic reason", () => {
    expect(
      scanPresentation({
        ...base,
        importResult: {
          ...base.importResult!,
          status: "Ambiguous match",
          message: "Choose the active contract.",
        },
      }),
    ).toEqual({
      status: "Needs review",
      message: "Choose the active contract.",
    });
  });
  it("describes current failed recognition separately from review", () => {
    expect(
      scanPresentation({
        ...base,
        status: "Failed",
        importResult: undefined,
        error: "Image missing",
      }),
    ).toEqual({ status: "Failed", message: "Image missing" });
  });
});
