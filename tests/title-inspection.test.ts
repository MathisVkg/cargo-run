import { describe, it, expect } from "vitest";
import { readFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { extractContract } from "../electron/main/ocr/parser";
import { TrackingService } from "../electron/main/trackingService";
import { CaptureRepository } from "../electron/main/ocr/repository";
import type { OcrResult, CaptureRecord } from "../src/types/ocr";
const fixture = (id: string): OcrResult =>
  JSON.parse(
    readFileSync(join(__dirname, "fixtures/mobiglas", id + ".json"), "utf8"),
  ).result;
describe("Limited current OCR title inspection", () => {
  it.each([
    [
      "de84af0a-5ad9-4458-a490-288293bdf989",
      "Rookie Rank - Extra Small Cargo Haul",
    ],
    [
      "88825398-27e5-4561-9516-c717ae7e750b",
      "Rookie Rank - Direct Small Cargo Haul",
    ],
    ["9ccc7ea4-c6f6-49bc-8bfc-701980e610da", "Junior Rank - Small Cargo Haul"],
  ])("extracts the complete repository title %s", (id, expected) => {
    const input = fixture(id),
      before = structuredClone(input),
      result = extractContract(input, "inspection", "2026-11-01T12:00:00Z");
    expect(result.title.value).toBe(expected);
    expect(result.title.value).not.toMatch(/®|\[|\]/);
    expect(result.title.evidence?.lineIds.length).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });
  it("preserves an old malformed ledger title, run snapshot and saved OCR observation across restart without reprocessing", () => {
    const file = join(
        mkdtempSync(join(tmpdir(), "cargo-title-inspection-")),
        "test.sqlite",
      ),
      id = randomUUID(),
      name = "Rookie Rank - Extra smal® GET]";
    let service = new TrackingService(file);
    service.saveContract({
      draft: {
        name,
        payout: 5000,
        objectives: [
          {
            commodity: "Food",
            pickupLocation: "Port Tressler",
            destination: "Area18",
            quantitySCU: 5,
          },
        ],
      },
    });
    const domain = service.domain();
    domain.contracts[0].source = "OCR";
    domain.contracts[0].dataOrigin = "OCR";
    service.database.saveDomain(domain);
    const result = fixture("de84af0a-5ad9-4458-a490-288293bdf989"),
      old = extractContract(result, id, "2026-11-01T12:00:00Z");
    old.parserVersion = "0.3.0";
    old.title.value = name;
    const capture: CaptureRecord = {
      id,
      capturedAt: new Date().toISOString(),
      source: "Manual",
      status: "Processed",
      displayId: "fixture",
      displayLabel: "Saved OCR inspection",
      screenshot: null,
      width: result.width,
      height: result.height,
      bytes: 0,
      attempts: 1,
      error: null,
      result,
      observation: old,
    };
    new CaptureRepository(service.database).put(capture);
    service.finishRun();
    const originalPayload = service.database.db
      .prepare("SELECT payload FROM ocr_captures WHERE id=?")
      .get(id)!.payload;
    const before = JSON.parse(JSON.stringify(service.domain()));
    expect(
      extractContract(result, "separate-inspection", "2026-11-01").title.value,
    ).toBe("Rookie Rank - Extra Small Cargo Haul");
    service.database.close();
    service = new TrackingService(file);
    expect(service.snapshot().contracts[0].name).toBe(name);
    expect(service.snapshot().runs[0].contractSnapshots[0].name).toBe(name);
    expect(JSON.parse(JSON.stringify(service.domain().contracts))).toEqual(
      before.contracts,
    );
    expect(
      service.database.db
        .prepare("SELECT payload FROM ocr_captures WHERE id=?")
        .get(id)!.payload,
    ).toBe(originalPayload);
    expect(
      new CaptureRepository(service.database).get(id)?.observation
        ?.parserVersion,
    ).toBe("0.3.0");
    service.database.close();
  });
});
