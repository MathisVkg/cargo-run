import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractContract } from "../electron/main/ocr/parser";
import type { OcrResult } from "../src/types/ocr";
const real = (): OcrResult =>
  JSON.parse(
    readFileSync(
      join(__dirname, "fixtures/mobiglas/agricultural-15-real.json"),
      "utf8",
    ),
  ).result;
const parse = (r: OcrResult) =>
  extractContract(r, "quantity", "2026-11-05T19:50:00Z");
function change(text: string) {
  const r = real();
  r.lines.find((l) => /Deliver/.test(l.text))!.text = text;
  r.text = r.lines.map((l) => l.text).join("\n");
  return r;
}
describe("Validated cargo progress quantities", () => {
  it("reads the actual 3840x2160 15 SCU screenshot with wrapped destination/pickup and preserved evidence", () => {
    const r = real(),
      before = structuredClone(r),
      o = parse(r);
    expect(o.objectives).toHaveLength(1);
    expect(o.objectives[0]).toMatchObject({
      commodity: { value: "Agricultural Supplies" },
      requiredSCU: { value: 15, state: "Recognized" },
      deliveredSCU: { value: 0 },
      pickup: { value: "NB Int. Spaceport" },
      destination: { value: "Port Tressler above microTech" },
    });
    expect(o.coverage?.state).toBe("Established");
    expect(r).toEqual(before);
  });
  it.each([
    "[x] Deliver 0/15 SCU of Agricultural Supplies to Port",
    "☐ Deliver 0 / □15 SCU of Agricultural Supplies to Port",
    "<> Deliver 0⁄15 SCU of Agricultural Supplies to Port",
  ])("separates checkbox/glyph evidence: %s", (text) => {
    expect(parse(change(text)).objectives[0].requiredSCU).toMatchObject({
      value: 15,
      state: "Recognized",
    });
  });
  it.each([715, 240, 1500, 12000])(
    "preserves legitimate %i SCU without a ship capacity or maximum heuristic",
    (q) => {
      expect(
        parse(
          change("Deliver 2/" + q + " SCU of Agricultural Supplies to Port"),
        ).objectives[0],
      ).toMatchObject({
        requiredSCU: { value: q, state: "Recognized" },
        deliveredSCU: { value: 2 },
      });
    },
  );
  it("supports thousands separators", () => {
    expect(
      parse(change("Deliver 25/1,500 SCU of Agricultural Supplies to Port"))
        .objectives[0].requiredSCU.value,
    ).toBe(1500);
  });
  it("flags a lost slash rather than treating fused progress as a trustworthy requirement", () => {
    expect(
      parse(change("Deliver 715 SCU of Agricultural Supplies to Port"))
        .objectives[0].requiredSCU.state,
    ).toBe("Ambiguous");
    expect(
      parse(
        change("Deliver 0 715 SCU of Agricultural Supplies to Port"),
      ).warnings.join(" "),
    ).toMatch(/could not be parsed/);
  });
  it("uses numeric word confidence instead of the average confidence of a whole line", () => {
    const r = change("Deliver 0/715 SCU of Agricultural Supplies to Port"),
      l = r.lines.find((l) => /Deliver/.test(l.text))!;
    l.confidence = 98;
    l.words = [{ text: "0/715", box: l.box, confidence: 35 }];
    const o = parse(r);
    expect(o.objectives[0].requiredSCU.state).toBe("Ambiguous");
    expect(o.coverage?.state).toBe("Partial");
  });
  it("rejects delivered greater than required", () => {
    expect(
      parse(change("Deliver 16/15 SCU of Agricultural Supplies to Port"))
        .objectives[0].requiredSCU.state,
    ).toBe("Ambiguous");
  });

  it("flags contradictory explicit collection counts without silently choosing either number", () => {
    const r = change("Deliver 0/715 SCU of Agricultural Supplies to Port");
    r.lines.find((l) => /Collect/.test(l.text))!.text =
      "Collect 15 SCU of Agricultural Supplies from NB Int.";
    const o = parse(r);
    expect(o.objectives[0].requiredSCU).toMatchObject({
      value: 715,
      state: "Ambiguous",
    });
    expect(o.warnings.join(" ")).toMatch(/collection quantities disagree/);
  });
  it("retains large explicit collection quantities and delivered/required fractions", () => {
    const r = change("Deliver 25/1,500 SCU of Agricultural Supplies to Port");
    r.lines.find((l) => /Collect/.test(l.text))!.text =
      "Collect 1,500 SCU of Agricultural Supplies from NB Int.";
    expect(parse(r).objectives[0]).toMatchObject({
      pickup: { value: "NB Int. Spaceport" },
      requiredSCU: { value: 1500, state: "Recognized" },
      deliveredSCU: { value: 25 },
    });
  });

  it("uses the spatial collection pair rather than comparing each paired quantity to the whole commodity sum", () => {
    const r = real(),
      first = r.lines.find((l) => /Collect/.test(l.text))!;
    first.text = first.text.replace(
      "Collect Agricultural",
      "Collect 15 SCU of Agricultural",
    );
    r.lines.push(
      {
        id: "delivery-two",
        text: "Deliver 0/5 SCU of Agricultural Supplies to Another Port.",
        box: { x: 2500, y: 1050, width: 900, height: 30 },
        confidence: 98,
      },
      {
        id: "collect-two",
        text: "Collect 5 SCU of Agricultural Supplies from NB Int. Spaceport.",
        box: { x: 2500, y: 1120, width: 900, height: 30 },
        confidence: 98,
      },
    );
    const o = parse(r);
    expect(
      o.objectives.map((r) => [r.requiredSCU.value, r.requiredSCU.state]),
    ).toEqual([
      [15, "Recognized"],
      [5, "Recognized"],
    ]);
  });
  it.each([3, 9, 10, 12, 15, 25, 31, 125, 715])(
    "accepts corroborated %i SCU without a digit-count rule",
    (required) => {
      const r = change(
          "Deliver 0/" + required + " SCU of Agricultural Supplies to Port",
        ),
        l = r.lines.find((l) => /Deliver/.test(l.text))!;
      l.words = [{ text: "0/" + required, box: l.box, confidence: 69 }];
      l.quantityCheck = { text: "0/" + required, box: l.box, confidence: 95 };
      const row = parse(r).objectives[0];
      expect(row.requiredSCU).toMatchObject({
        value: required,
        state: "Recognized",
      });
      expect(row.deliveredSCU.value).toBe(0);
      expect(row.quantityEvidence?.source).toBe("Region OCR");
    },
  );
  it("retains 715 versus 15 disagreement and does not treat a cloned string as independent proof", () => {
    const r = change("Deliver 0/715 SCU of Agricultural Supplies to Port"),
      l = r.lines.find((l) => /Deliver/.test(l.text))!;
    l.words = [{ text: "0/715", box: l.box, confidence: 69 }];
    // A separately recognized crop disagrees: neither value may import automatically.
    l.quantityCheck = { text: "0/15", box: l.box, confidence: 96 };
    expect(parse(r).objectives[0].requiredSCU.state).toBe("Ambiguous");
    delete l.quantityCheck;
    r.text = l.text;
    expect(parse(r).objectives[0].requiredSCU.state).toBe("Ambiguous");
  });

  it("keeps inconsistent word/line evidence ambiguous even when a regional pass agrees with the line", () => {
    const r = change("Deliver 0/15 SCU of Agricultural Supplies to Port"),
      l = r.lines.find((l) => /Deliver/.test(l.text))!;
    l.words = [{ text: "0/715", box: l.box, confidence: 69 }];
    l.quantityCheck = { text: "0/15", box: l.box, confidence: 95 };
    expect(parse(r).objectives[0].requiredSCU.state).toBe("Ambiguous");
  });
  it("does not accept a second uncertain reading as independent confirmation", () => {
    const r = change("Deliver 0/12 SCU of Agricultural Supplies to Port"),
      l = r.lines.find((l) => /Deliver/.test(l.text))!;
    l.words = [{ text: "0/12", box: l.box, confidence: 69 }];
    l.quantityCheck = { text: "0/12", box: l.box, confidence: 60 };
    expect(parse(r).objectives[0].requiredSCU.state).toBe("Ambiguous");
  });
});
