import type { OcrResult, OcrLine } from "../../src/types/ocr";
// Representative spatial reconstruction of the user's reported OCR, not an original screenshot export.
// Coordinates and confidence values are synthetic test inputs; production preserves actual engine evidence.
export function observedAluminumFixture(
  width = 3200,
  height = 1800,
): OcrResult {
  const rows: [string, number, number, number, number, number][] = [
    ["CONTRACTS", 0.1, 0.16, 0.14, 0.025, 98],
    ["OFFERS", 0.13, 0.24, 0.09, 0.025, 94],
    ["ACCEPTED", 0.25, 0.24, 0.12, 0.025, 95],
    ["Rookie Rank - Extra Small", 0.49, 0.29, 0.32, 0.026, 96.1],
    ["Cargo Haul", 0.49, 0.325, 0.17, 0.026, 95.4],
    ["HISTORY BEACONS", 0.52, 0.367, 0.22, 0.021, 91],
    ["Contracted By", 0.54, 0.411, 0.15, 0.02, 96],
    ["Reward", 0.83, 0.411, 0.08, 0.02, 97],
    ["Covalex Independent", 0.54, 0.445, 0.22, 0.019, 94.6],
    ["Contractors", 0.54, 0.472, 0.14, 0.019, 95],
    ["a 61,500", 0.83, 0.445, 0.12, 0.021, 93.8],
    ["PRIMARY OBJECTIVES", 0.73, 0.51, 0.21, 0.021, 95],
    ["DETAILS", 0.49, 0.532, 0.1, 0.021, 96],
    ["Collect Aluminum", 0.49, 0.59, 0.2, 0.022, 95],
    ["from Port Tressler.", 0.49, 0.618, 0.22, 0.022, 94],
    ["Deliver 0/5 SCU of Aluminum to", 0.64, 0.578, 0.3, 0.022, 96],
    ["Greycat Stanton IV Production", 0.66, 0.608, 0.3, 0.022, 94],
    ["Complex-A on microTech", 0.66, 0.638, 0.28, 0.022, 94],
    ["Deliver 0/3 SCU of Aluminum to", 0.64, 0.721, 0.3, 0.022, 96],
    ["NB Int. Spaceport on microTech", 0.66, 0.752, 0.3, 0.022, 94],
    ["The description mentions 8 SCU of Aluminum.", 0.49, 0.68, 0.22, 0.02, 90],
    ["ABANDON", 0.82, 0.91, 0.1, 0.02, 98],
  ];
  const lines: OcrLine[] = rows.map(([text, x, y, w, h, confidence], i) => ({
    id: "observed-" + i,
    text,
    box: { x: x * width, y: y * height, width: w * width, height: h * height },
    confidence,
  }));
  return {
    provider: "Representative reported OCR fixture",
    language: "eng",
    text: lines.map((l) => l.text).join("\n"),
    lines,
    width,
    height,
    durationMs: 0,
  };
}
