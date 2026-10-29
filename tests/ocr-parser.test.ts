import { describe, it, expect } from "vitest";
import { extractContract } from "../electron/main/ocr/parser";
import { ocrFixture } from "./fixtures/ocr";
const parse = (multi = false, scale = 1) =>
  extractContract(
    ocrFixture(multi, scale),
    "capture-test",
    "2026-10-26T17:00:00Z",
  );
describe("OCR observations, never contracts", () => {
  it("extracts a single wrapped destination and explicit company, reward and pickup", () => {
    const o = parse();
    expect(o.title.value).toBe("Frontier Supply: Cold Chain");
    expect(o.company.value).toBe("Covalex Shipping");
    expect(o.reward.value).toBe(60000);
    expect(o.objectives).toHaveLength(1);
    expect(o.objectives[0]).toMatchObject({
      commodity: { value: "Pressurized Ice" },
      pickup: { value: "Port Tressler" },
      destination: { value: "Rayari Cantwell Research Outpost" },
      requiredSCU: { value: 4 },
      deliveredSCU: { value: 0 },
    });
  });
  it("keeps four objectives under one observation with two commodities and repeated destinations", () => {
    const o = parse(true);
    expect(o.objectiveCount.value).toBe(4);
    expect(o.objectives.map((r) => r.requiredSCU.value)).toEqual([4, 5, 5, 4]);
    expect(new Set(o.objectives.map((r) => r.commodity.value)).size).toBe(2);
    expect(new Set(o.objectives.map((r) => r.destination.value)).size).toBe(2);
    expect(o.objectives.every((r) => r.pickup.value === "Port Tressler")).toBe(
      true,
    );
    expect(o).not.toHaveProperty("missionId");
    expect(o.acceptanceTimestamp).toBeNull();
  });
  it("extracts the same fields at 1920x1080 and 3840x2160 from relative layout", () => {
    expect(parse(true, 2).objectives.map((o) => o.destination.value)).toEqual(
      parse(true).objectives.map((o) => o.destination.value),
    );
  });
  it("does not double-count description cargo quantities", () => {
    expect(parse(true).objectives).toHaveLength(4);
  });
  it("requires independent action or explicit selection evidence; navigation words alone remain ambiguous", () => {
    const f = ocrFixture();
    f.lines[0].text = "OFFERS";
    expect(extractContract(f, "id", "time").view.state).toBe("Ambiguous");
    f.lines.push({ ...f.lines[0], id: "other", text: "ACCEPTED" });
    expect(extractContract(f, "id", "time").view.state).toBe("Ambiguous");
    f.lines[0].text = "CONTRACTS / ACCEPTED";
    expect(extractContract(f, "id", "time").view.value).toBe("Accepted");
  });
  it("does not invent missing pickup, reward, title or delivered SCU", () => {
    const f = ocrFixture();
    f.lines = f.lines.filter(
      (l) => !/(?:Collect|Reward|Frontier)/.test(l.text),
    );
    f.lines.find((l) => l.text.startsWith("Deliver"))!.text =
      "Deliver 4 SCU of Pressurized Ice to";
    const o = extractContract(f, "id", "time");
    expect(o.reward.state).toBe("Missing");
    expect(o.title.value).toBeNull();
    expect(o.objectives[0].pickup.state).toBe("Missing");
    expect(o.objectives[0].deliveredSCU.value).toBeNull();
  });
  it("refuses malformed or negative quantities and rewards", () => {
    const f = ocrFixture();
    f.lines.find((l) => l.text.startsWith("Reward"))!.text = "Reward -12 aUEC";
    f.lines.find((l) => l.text.startsWith("Deliver"))!.text =
      "Deliver -4 SCU of Quartz to Outpost";
    const o = extractContract(f, "id", "time");
    expect(o.reward.state).toBe("Ambiguous");
    expect(o.objectives).toEqual([]);
    expect(o.warnings.some((w) => w.includes("could not be parsed"))).toBe(
      true,
    );
  });
  it("preserves raw source evidence and supplied engine confidence without inventing percentages", () => {
    const f = ocrFixture();
    f.lines.find((l) => l.text.startsWith("Reward"))!.confidence = 93.2;
    const o = extractContract(f, "id", "time");
    expect(o.reward.confidence).toBe(93.2);
    expect(o.company.confidence).toBeNull();
    expect(o.objectives[0].destination.evidence?.lineIds).toHaveLength(2);
    expect(o.potentiallyIncomplete).toBe(true);
  });
  it("retains independent identical rows with an ambiguity warning rather than silently merging them", () => {
    const f = ocrFixture();
    f.lines.push(
      { ...f.lines[8], id: "repeat-a", box: { ...f.lines[8].box, y: 600 } },
      { ...f.lines[9], id: "repeat-b", box: { ...f.lines[9].box, y: 640 } },
    );
    const o = extractContract(f, "id", "time");
    expect(o.objectives).toHaveLength(2);
    expect(o.warnings.some((w) => w.includes("Identical"))).toBe(true);
  });
  it("does not turn unrelated UI labels or a missing objectives panel into fabricated contracts", () => {
    const f = ocrFixture();
    f.lines = f.lines.filter((l) =>
      /ACCEPTED|DETAILS|Contracted|Reward/.test(l.text),
    );
    const o = extractContract(f, "id", "time");
    expect(o.title.value).toBeNull();
    expect(o.objectives).toEqual([]);
    expect(o.objectiveCount.value).toBeNull();
  });
  it("keeps independent observations distinct even if their extracted cargo matches", () => {
    const a = extractContract(ocrFixture(), "first", "time"),
      b = extractContract(ocrFixture(), "second", "time");
    expect(a.captureId).not.toBe(b.captureId);
    expect(a.objectives).toEqual(b.objectives);
  });
});

describe("wrapped header fields", () => {
  it("preserves a wrapped title as one title", () => {
    const f = ocrFixture();
    f.lines[1].text = "Frontier Supply:";
    f.lines.push({
      ...f.lines[1],
      id: "title-wrap",
      text: "Cold Chain",
      box: { ...f.lines[1].box, y: 205 },
    });
    expect(extractContract(f, "id", "time").title.value).toBe(
      "Frontier Supply: Cold Chain",
    );
  });
  it("extracts a reward whose unit wraps onto the following line", () => {
    const f = ocrFixture();
    f.lines[3].text = "Reward 60,000";
    f.lines.push({
      ...f.lines[3],
      id: "reward-wrap",
      text: "aUEC",
      box: { ...f.lines[3].box, y: 324 },
    });
    expect(extractContract(f, "id", "time").reward.value).toBe(60000);
  });
  it("preserves fractional SCU without rounding", () => {
    const f = ocrFixture();
    f.lines[8].text = "Deliver 0.125/4.125 SCU of Pressurized Ice to";
    const o = extractContract(f, "id", "time");
    expect(o.objectives[0].requiredSCU.value).toBe(4.125);
    expect(o.objectives[0].deliveredSCU.value).toBe(0.125);
  });
});
