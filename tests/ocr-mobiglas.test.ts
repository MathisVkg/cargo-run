import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import type { OcrResult } from "../src/types/ocr";
import { extractContract } from "../electron/main/ocr/parser";
const ids = [
  "32f3f1ae-895c-4a8c-9e34-7f81d4425ac9",
  "3544f29a-9fd0-49da-b48f-fc619d2c7172",
  "7ab80543-0dd6-4384-9a59-d91586033683",
  "9ccc7ea4-c6f6-49bc-8bfc-701980e610da",
  "c68b9c33-4995-4bdc-af68-e259fa1e048e",
];
function fixture(index: number): OcrResult {
  return JSON.parse(
    readFileSync(
      join(__dirname, "fixtures/mobiglas", ids[index] + ".json"),
      "utf8",
    ),
  ).result;
}
const parse = (r: OcrResult) =>
  extractContract(r, "game-fixture", "2026-10-26");
describe("actual 3840x2160 Mobiglas screenshot OCR", () => {
  for (let i = 0; i < ids.length; i++)
    it("extracts genuine image " + ids[i], () => {
      const r = fixture(i),
        before = structuredClone(r),
        o = parse(r);
      expect(o.title.value).toMatch(/^(Rookie|Junior) Rank -/);
      expect(o.title.value).not.toMatch(/HISTORY|BEACONS|OFFERS|ACCEPTED/);
      expect(o.company.value).toBe("Covalex Independent Contractors");
      expect(o.reward.value).toBe(i === 1 ? 50250 : i === 3 ? 65250 : 48500);
      expect(o.objectives).toHaveLength(i === 1 ? 1 : i === 3 ? 4 : 2);
      expect(
        o.objectives.every((row) => row.pickup.value === "Port Tressler"),
      ).toBe(true);
      expect(o.objectives.every((row) => row.deliveredSCU.value === 0)).toBe(
        true,
      );
      expect(r).toEqual(before);
      expect(
        o.title.evidence?.lineIds.every((id) =>
          r.lines.some((l) => l.id === id),
        ),
      ).toBe(true);
      expect(o.reward.evidence?.box).not.toBeNull();
    });
  it("retains the actual 65,250 screenshot's 25 SCU, two commodities and four full destinations", () => {
    const o = parse(fixture(3));
    expect(o.objectives.map((r) => r.requiredSCU.value)).toEqual([7, 6, 7, 5]);
    expect(
      o.objectives.reduce((n, r) => n + (r.requiredSCU.value ?? 0), 0),
    ).toBe(25);
    expect(new Set(o.objectives.map((r) => r.commodity.value)).size).toBe(2);
    expect(o.objectives.map((r) => r.destination.value)).toEqual([
      "Rayari Cantwell Research Outpost on Clio",
      "Rayari McGrath Research Outpost on Clio",
      "Rayari Cantwell Research Outpost on Clio",
      "Rayari McGrath Research Outpost on Clio",
    ]);
    expect(o.view.state).toBe("Ambiguous");
  });
  it("preserves NB Int. punctuation and marks visibly clipped destination text ambiguous", () => {
    expect(parse(fixture(1)).objectives[0].destination.value).toBe(
      "NB Int. Spaceport on microTech",
    );
    const o = parse(fixture(0));
    expect(o.objectives[1].destination.value).toBe(
      "Covalex Distribution Center S4DCO0S on",
    );
    expect(o.objectives[1].destination.state).toBe("Ambiguous");
    expect(o.warnings.some((w) => w.includes("clipped"))).toBe(true);
  });
  it("maps the real layout to normalized 3200px OCR coordinates without altering extraction", () => {
    const r = fixture(3);
    r.width = 3200;
    r.height = 1800;
    r.lines = r.lines.map((l) => ({
      ...l,
      box: {
        x: (l.box.x * 5) / 6,
        y: (l.box.y * 5) / 6,
        width: (l.box.width * 5) / 6,
        height: (l.box.height * 5) / 6,
      },
    }));
    expect(parse(r).objectives.map((r) => r.requiredSCU.value)).toEqual([
      7, 6, 7, 5,
    ]);
    expect(parse(r).reward.value).toBe(65250);
  });
  it("retains the reported 65,250 / 18 SCU variant separately from actual screenshot evidence", () => {
    const r = fixture(3),
      quantities = [4, 5, 5, 4];
    let i = 0;
    r.lines = r.lines.map((l) =>
      /Deliver 0\/\d+ SCU/.test(l.text)
        ? {
            ...l,
            text: l.text.replace(/0\/\d+/, "0/" + quantities[i++]),
            confidence: null,
          }
        : l,
    );
    // Modified quantities are a reported-data regression, not genuine engine output.
    const o = parse(r);
    expect(o.reward.value).toBe(65250);
    expect(o.objectives).toHaveLength(4);
    expect(
      o.objectives.reduce((n, r) => n + (r.requiredSCU.value ?? 0), 0),
    ).toBe(18);
  });
  it("retains the reported 61,500 / 8 SCU case using actual header and panel coordinates", () => {
    const r = fixture(3);
    let delivery = 0,
      collect = 0;
    r.lines = r.lines.flatMap((l) => {
      let text = l.text;
      if (/Junior Rank - Small Cargo Haul/.test(text))
        text = "Rookie Rank - Extra Small Cargo Haul";
      else if (/a 65,250/.test(text)) text = "a 61,500";
      else if (/Deliver 0\//.test(text)) {
        delivery++;
        if (delivery > 2) return [];
        text =
          delivery === 1
            ? "<> Deliver 0/5 SCU of Aluminum to Greycat Stanton IV"
            : "<> Deliver 0/3 SCU of Aluminum to NB Int. Spaceport";
      } else if (/Collect .* from Port Tressler/.test(text)) {
        collect++;
        if (collect > 2) return [];
        text = "¢ Collect Aluminum from Port Tressler.";
      } else if (/Research Outpost on Clio/.test(text)) {
        if (delivery > 2) return [];
        text =
          delivery === 1
            ? "Production Complex-A on microTech."
            : "on microTech.";
      }
      return [
        { ...l, text, confidence: text === l.text ? l.confidence : null },
      ];
    });
    const o = parse(r);
    expect(o.reward.value).toBe(61500);
    expect(o.title.value).toBe("Rookie Rank - Extra Small Cargo Haul");
    expect(o.objectives.map((r) => r.requiredSCU.value)).toEqual([5, 3]);
    expect(o.objectives.map((r) => r.destination.value)).toEqual([
      "Greycat Stanton IV Production Complex-A on microTech",
      "NB Int. Spaceport on microTech",
    ]);
    expect(o.objectives.every((r) => r.pickup.value === "Port Tressler")).toBe(
      true,
    );
  });
  it("pairs a delivery with its following Collect row when the same commodity has different pickups", () => {
    const r = fixture(2);
    let i = 0;
    r.lines = r.lines.map((l) =>
      l.text.includes("Collect Stims")
        ? {
            ...l,
            text:
              "¢ Collect Stims from " +
              (++i === 1 ? "Port Tressler." : "Everus Harbor."),
          }
        : l,
    );
    expect(parse(r).objectives.map((r) => r.pickup.value)).toEqual([
      "Port Tressler",
      "Everus Harbor",
    ]);
  });
});
