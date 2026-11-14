import { it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import { extractContract } from "../electron/main/ocr/parser";
import { ocrFixture } from "./fixtures/ocr";
import type { CaptureRecord } from "../src/types/ocr";
it("editor OCR remains uncommitted after restart until explicit reviewed confirmation", async () => {
  const file = join(
      mkdtempSync(join(tmpdir(), "cargo-editor-")),
      "cargo.sqlite",
    ),
    id = randomUUID(),
    result = ocrFixture(true);
  let s = new TrackingService(file);
  const c: CaptureRecord = {
    id,
    reviewMode: "Editor",
    capturedAt: new Date().toISOString(),
    source: "Manual",
    status: "Processed",
    displayId: null,
    displayLabel: null,
    screenshot: null,
    width: 1920,
    height: 1080,
    bytes: 0,
    attempts: 1,
    error: null,
    result,
    observation: extractContract(result, id, new Date().toISOString()),
  };
  new CaptureRepository(s.database).put(c);
  expect(s.processScan(id)).toBeNull();
  expect(s.domain().contracts).toHaveLength(0);
  await s.close();
  s = new TrackingService(file);
  try {
    expect(s.processScan(id)).toBeNull();
    expect(s.domain().contracts).toHaveLength(0);
    const r = s.prepareOcr({ captureId: id, targetId: "", advanced: true });
    const request = {
      captureId: id,
      targetId: "",
      advanced: true,
      action: "Create",
      draft: r.draft,
      observationHash: r.observationHash,
      acceptedConfirmed: true,
      incompleteConfirmed: true,
      associationConfirmed: false,
      distinctConfirmed: false,
      consolidationConfirmed: false,
      objectiveRemovalConfirmed: false,
      choices: {},
    };
    const saved = s.confirmOcr(request);
    expect(s.domain().contracts).toHaveLength(1);
    expect(s.domain().contracts[0].cargoObjectives).toHaveLength(4);
    expect(s.confirmOcr(request).contractId).toBe(saved.contractId);
    expect(s.domain().contracts).toHaveLength(1);
    expect(new CaptureRepository(s.database).get(id)?.reviewMode).toBe(
      "Editor",
    );
  } finally {
    await s.close();
  }
});
