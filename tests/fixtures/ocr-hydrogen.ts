import type { OcrResult } from "../../src/types/ocr";
// Spatial regression reconstructed from the user's Task 03B report.
// This is reported content, not an export from an original screenshot.
export function reportedHydrogenFixture(): OcrResult {
  const rows: [string, number, number][] = [
    ["OFFERS", 0.13, 0.24],
    ["ACCEPTED", 0.25, 0.24],
    ["Junior Rank - Direct Small Cargo Haul", 0.49, 0.29],
    ["Contracted By", 0.54, 0.411],
    ["Covalex Independent Contractors", 0.54, 0.445],
    ["Reward", 0.83, 0.411],
    ["a 60,750", 0.83, 0.445],
    ["DETAILS", 0.49, 0.532],
    ["Collect 31 SCU of Hydrogen from", 0.49, 0.59],
    ["microTech Logistics Depot S4LD13.", 0.49, 0.62],
    ["PRIMARY OBJECTIVES", 0.73, 0.51],
    ["Deliver 0/31 SCU of Hydrogen to", 0.66, 0.578],
    ["Rayari Deltana Research Outpost", 0.66, 0.61],
    ["TRACK", 0.62, 0.91],
    ["ABANDON", 0.82, 0.91],
  ];
  const lines = rows.map(([text, x, y], i) => ({
    id: "reported-c-" + i,
    text,
    box: { x: x * 3840, y: y * 2160, width: 1000, height: 44 },
    confidence: null,
  }));
  return {
    provider: "Reported contract C spatial reconstruction",
    language: "eng",
    width: 3840,
    height: 2160,
    durationMs: 0,
    text: lines.map((l) => l.text).join("\n"),
    lines,
  };
}
