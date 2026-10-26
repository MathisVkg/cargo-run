import { describe, it, expect } from "vitest";
import { observedAluminumFixture } from "./fixtures/ocr-observed";
import { ocrFixture } from "./fixtures/ocr";
import { extractContract } from "../electron/main/ocr/parser";
const parse = (f = observedAluminumFixture()) =>
  extractContract(f, "observed-capture", "2026-10-26T18:00:00Z");
describe("reported real-game OCR regression", () => {
  it("extracts title/company and imperfect anchored currency without navigation contamination", () => {
    const o = parse();
    expect(o.title.value).toBe("Rookie Rank - Extra Small Cargo Haul");
    expect(o.company.value).toBe("Covalex Independent Contractors");
    expect(o.reward.value).toBe(61500);
    expect(o.title.value).not.toMatch(/HISTORY|BEACONS|OFFERS|ACCEPTED/);
    expect(o.view).toMatchObject({ value: null, state: "Ambiguous" });
  });
  it("retains two wrapped Aluminum deliveries, full punctuation and commodity-specific pickups", () => {
    const o = parse();
    expect(o.objectives).toHaveLength(2);
    expect(o.objectiveCount.value).toBe(2);
    expect(o.objectives.map((r) => r.destination.value)).toEqual([
      "Greycat Stanton IV Production Complex-A on microTech",
      "NB Int. Spaceport on microTech",
    ]);
    expect(o.objectives.map((r) => r.pickup.value)).toEqual([
      "Port Tressler",
      "Port Tressler",
    ]);
    expect(
      o.objectives.reduce((n, r) => n + (r.requiredSCU.value ?? 0), 0),
    ).toBe(8);
    expect(
      o.objectives.reduce((n, r) => n + (r.deliveredSCU.value ?? 0), 0),
    ).toBe(0);
  });
  it("is resolution independent at 1080p, normalized OCR size and 4K", () => {
    for (const [w, h] of [
      [1920, 1080],
      [3200, 1800],
      [3840, 2160],
    ]) {
      const o = parse(observedAluminumFixture(w, h));
      expect(o.reward.value).toBe(61500);
      expect(o.objectives.map((r) => r.requiredSCU.value)).toEqual([5, 3]);
    }
  });
  it("preserves the original source coordinates/confidences and field evidence", () => {
    const f = observedAluminumFixture(),
      before = structuredClone(f),
      o = parse(f);
    expect(f).toEqual(before);
    expect(o.reward.evidence?.lineIds).toContain("observed-10");
    expect(o.objectives[1].destination.evidence?.text).toContain(
      "NB Int. Spaceport",
    );
    expect(o.objectives[0].destination.evidence?.box).not.toBeNull();
    expect(f.lines[10].confidence).toBe(93.8);
  });
  it("keeps valid and partial objectives when a neighboring row is truncated", () => {
    const f = observedAluminumFixture();
    f.lines = f.lines.filter((l) => l.id !== "observed-19");
    const o = parse(f);
    expect(o.objectives).toHaveLength(2);
    expect(o.objectives[0].requiredSCU.value).toBe(5);
    expect(o.objectives[1].requiredSCU.value).toBe(3);
    expect(o.objectives[1].destination.value).toBeNull();
    expect(o.warnings.some((w) => w.includes("partial"))).toBe(true);
  });
  it("recognizes a split Primary/Objectives heading with an indented checkbox gutter", () => {
    const f = observedAluminumFixture();
    const anchor = f.lines.find((l) => l.text === "PRIMARY OBJECTIVES")!;
    anchor.text = "PRIMARY";
    f.lines.push({
      ...anchor,
      id: "split-heading",
      text: "OBJECTIVES",
      box: { ...anchor.box, x: anchor.box.x + 170 },
    });
    expect(parse(f).objectives).toHaveLength(2);
  });
  it("never takes a navigation-only line as title even when the title is missing", () => {
    const f = observedAluminumFixture();
    f.lines = f.lines.filter(
      (l) => !["observed-3", "observed-4"].includes(l.id),
    );
    expect(parse(f).title.value).toBeNull();
  });
  it("does not parse a currency-like number from unrelated navigation or descriptions as reward", () => {
    const f = observedAluminumFixture();
    f.lines = f.lines.filter(
      (l) => !["observed-7", "observed-10"].includes(l.id),
    );
    expect(parse(f).reward.value).toBeNull();
  });
  it("preserves the earlier 18 SCU / four-objective contract", () => {
    const o = parse(ocrFixture(true));
    expect(o.objectives).toHaveLength(4);
    expect(
      o.objectives.reduce((n, r) => n + (r.requiredSCU.value ?? 0), 0),
    ).toBe(18);
    expect(new Set(o.objectives.map((r) => r.commodity.value)).size).toBe(2);
  });
});
