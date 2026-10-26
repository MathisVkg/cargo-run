import type { OcrResult } from "../../src/types/ocr";
export function ocrFixture(multi = false, scale = 1): OcrResult {
  const entries: [string, number, number][] = [
    ["ACCEPTED", 160, 80],
    ["Frontier Supply: Cold Chain", 650, 170],
    ["Contracted By Covalex Shipping", 650, 240],
    ["Reward 60,000 aUEC", 650, 290],
    ["DETAILS", 650, 380],
    ["Collect 9 SCU of Pressurized Ice from Port Tressler.", 650, 430],
    ["Collect 9 SCU of Processed Food from Port Tressler.", 650, 480],
    ["PRIMARY OBJECTIVES", 1300, 380],
    ["Deliver 0/4 SCU of Pressurized Ice to", 1300, 430],
    ["Rayari Cantwell Research Outpost", 1300, 463],
  ];
  if (multi)
    entries.push(
      [
        "Deliver 0/5 SCU of Pressurized Ice to Rayari McGrath Research Outpost",
        1300,
        520,
      ],
      [
        "Deliver 0/5 SCU of Processed Food to Rayari Cantwell Research Outpost",
        1300,
        580,
      ],
      [
        "Deliver 0/4 SCU of Processed Food to Rayari McGrath Research Outpost",
        1300,
        640,
      ],
    );
  return {
    provider: "Synthetic positioned fixture",
    language: "eng",
    text: entries.map((e) => e[0]).join("\n"),
    width: 1920 * scale,
    height: 1080 * scale,
    durationMs: 0,
    lines: entries.map(([text, x, y], i) => ({
      id: "f-" + i,
      text,
      box: {
        x: x * scale,
        y: y * scale,
        width: 500 * scale,
        height: 26 * scale,
      },
      confidence: null,
    })),
  };
}
