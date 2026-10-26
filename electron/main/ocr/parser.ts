import type {
  OcrResult,
  OcrLine,
  Field,
  Evidence,
  ContractObservation,
  ScanObjective,
} from "../../../src/types/ocr";
const clean = (s: string) => s.replace(/[ \t\u00a0]+/g, " ").trim();
const label = (s: string) => clean(s).replace(/[:|]/g, "").toUpperCase();
const blocked =
  /^(?:OFFERS|ACCEPTED|CONTRACTS?|REWARD|CONTRACTED BY|PRIMARY OBJECTIVES|DETAILS|ABANDON|TRACK|UNTRACK|GENERAL|PERSONAL|AVAILABLE|DELIVER|COLLECT)(?:\s|$)/i;
const missing = <T>(): Field<T> => ({
  value: null,
  state: "Missing",
  confidence: null,
  method: "Missing",
  evidence: null,
});
function field<T>(
  value: T | null,
  lines: OcrLine[],
  region: string,
  method: "Explicit" | "Structured" = "Structured",
  ambiguous = false,
): Field<T> {
  if (value === null && !ambiguous) return missing<T>();
  const boxes = lines.map((l) => l.box),
    x = Math.min(...boxes.map((b) => b.x)),
    y = Math.min(...boxes.map((b) => b.y));
  const evidence: Evidence = {
    region,
    box: boxes.length
      ? {
          x,
          y,
          width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
          height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
        }
      : null,
    lineIds: lines.map((l) => l.id),
    text: lines.map((l) => l.text).join("\n"),
  };
  return {
    value,
    state: ambiguous ? "Ambiguous" : "Recognized",
    confidence: lines.length === 1 ? lines[0].confidence : null,
    method,
    evidence,
  };
}
const number = (s: string): number | null => {
  if (!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(s.replace(/ /g, ""))) return null;
  const n = Number(s.replace(/[, ]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function extractContract(
  result: OcrResult,
  captureId: string,
  capturedAt: string,
): ContractObservation {
  let lines = result.lines
    .filter((l) => clean(l.text))
    .map((l) => ({ ...l, text: clean(l.text) }));
  if (!lines.length && result.text.trim())
    lines = result.text
      .split(/\r?\n/)
      .filter((s) => s.trim())
      .map((text, i) => ({
        id: "text-" + i,
        text: clean(text),
        box: { x: 0, y: i * 20, width: result.width, height: 18 },
        confidence: null,
      }));
  const positioned = result.lines.length > 0;
  const warnings: string[] = [
    "Only visible objectives were read. The objectives panel may scroll; this capture is potentially incomplete.",
  ];
  if (!positioned)
    warnings.push(
      "Text positions are unavailable; layout extraction is conservative.",
    );
  const sorted = [...lines].sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
  );
  const primary = sorted.find((l) =>
    label(l.text).includes("PRIMARY OBJECTIVES"),
  );
  const details = sorted.find((l) => label(l.text) === "DETAILS");
  const sameColumn = (
    line: OcrLine,
    anchor: OcrLine,
    other: OcrLine | undefined,
  ) => {
    if (!positioned) return true;
    let min = anchor.box.x - result.width * 0.025,
      max = result.width;
    if (other && Math.abs(other.box.x - anchor.box.x) > result.width * 0.07) {
      if (other.box.x < anchor.box.x) min = (anchor.box.x + other.box.x) / 2;
      else max = (anchor.box.x + other.box.x) / 2;
    }
    return line.box.x >= min && line.box.x < max;
  };
  const objectiveLines = primary
    ? sorted.filter(
        (l) =>
          l.id !== primary.id &&
          l.box.y >= primary.box.y + primary.box.height * 0.5 &&
          sameColumn(l, primary, details) &&
          (!details ||
            details.box.y <= primary.box.y ||
            Math.abs(details.box.x - primary.box.x) > result.width * 0.25 ||
            l.box.y < details.box.y),
      )
    : [];
  if (!primary)
    warnings.push(
      "PRIMARY OBJECTIVES was not recognized; description quantities were not converted into objectives.",
    );
  const detailLines = details
    ? sorted.filter(
        (l) =>
          l.id !== details.id &&
          l.box.y > details.box.y &&
          sameColumn(l, details, primary) &&
          (!primary ||
            primary.box.y <= details.box.y ||
            Math.abs(primary.box.x - details.box.x) > result.width * 0.25 ||
            l.box.y < primary.box.y),
      )
    : [];
  const nav = sorted.filter(
    (l) => l.box.y < result.height * 0.35 || !positioned,
  );
  let view = missing<"Offers" | "Accepted">();
  const selected = nav.find(
    (l) =>
      /\b(?:SELECTED|CONTRACTS\s*[/>-])\s*:?\s*(OFFERS|ACCEPTED)\b/i.test(
        l.text,
      ) || /^\[(OFFERS|ACCEPTED)\]$/i.test(l.text),
  );
  if (selected)
    view = field(
      /ACCEPTED/i.test(selected.text) ? "Accepted" : "Offers",
      [selected],
      "Navigation",
      "Explicit",
    );
  else {
    const offers = nav.find((l) => label(l.text) === "OFFERS"),
      accepted = nav.find((l) => label(l.text) === "ACCEPTED");
    if (offers && accepted) {
      view = field<"Offers" | "Accepted">(
        null,
        [offers, accepted],
        "Navigation",
        "Explicit",
        true,
      );
      warnings.push(
        "Both OFFERS and ACCEPTED are visible; OCR text alone cannot prove the selected tab.",
      );
    } else if (accepted)
      view = field("Accepted", [accepted], "Navigation", "Explicit");
    else if (offers) view = field("Offers", [offers], "Navigation", "Explicit");
  }
  function anchoredValue(
    pattern: RegExp,
  ): { value: string; lines: OcrLine[] } | null {
    const anchor = sorted.find((l) => pattern.test(l.text));
    if (!anchor) return null;
    const inline = clean(
      anchor.text.replace(pattern, "").replace(/^[:-]\s*/, ""),
    );
    const values = inline ? [inline] : [],
      evidence = [anchor];
    const following = sorted.filter(
      (l) =>
        l.box.y > anchor.box.y &&
        (!positioned || Math.abs(l.box.x - anchor.box.x) < result.width * 0.16),
    );
    let previous = anchor;
    for (const line of following) {
      if (
        evidence.length >= 4 ||
        blocked.test(line.text) ||
        line.box.y - previous.box.y >
          Math.max(line.box.height, previous.box.height) * 2.1
      )
        break;
      values.push(line.text);
      evidence.push(line);
      previous = line;
    }
    return values.length ? { value: values.join(" "), lines: evidence } : null;
  }

  const companyText = anchoredValue(/^Contracted\s+By\b/i),
    rewardText = anchoredValue(/^Reward\b/i);
  let company = companyText
    ? field(companyText.value, companyText.lines, "Contract header", "Explicit")
    : missing<string>();
  if (company.value && /a?UEC|\bSCU\b/i.test(company.value))
    company = { ...company, value: null, state: "Ambiguous" };
  let reward = missing<number>();
  if (rewardText) {
    const match = /(-?\d[\d, ]*(?:\.\d{1,2})?)\s*a?UEC\b/i.exec(
      rewardText.value,
    );
    const n = match ? number(match[1]) : null;
    reward = field(n, rewardText.lines, "Reward", "Explicit", n === null);
  }
  const explicitTitle = anchoredValue(/^(?:Contract\s+Title|Title)\s*:/i);
  let title = explicitTitle
    ? field(
        explicitTitle.value,
        explicitTitle.lines,
        "Contract header",
        "Explicit",
      )
    : missing<string>();
  if (!title.value) {
    const anchors = sorted.filter((l) =>
      /^Contracted\s+By|^Reward\b/i.test(l.text),
    );
    const anchor = anchors[0];
    const candidates = anchor
      ? sorted.filter(
          (l) =>
            l.box.y < anchor.box.y &&
            anchor.box.y - l.box.y < result.height * 0.17 &&
            (!positioned ||
              Math.abs(l.box.x - anchor.box.x) < result.width * 0.19) &&
            !blocked.test(l.text) &&
            !/\ba?UEC\b|\bSCU\b/i.test(l.text),
        )
      : [];
    const candidate = candidates.at(-1);
    if (candidate) {
      const group = [candidate];
      for (let i = candidates.length - 2; i >= 0 && group.length < 3; i--) {
        const previous = candidates[i],
          next = group[0];
        if (
          next.box.y - previous.box.y >
            Math.max(next.box.height, previous.box.height) * 1.8 ||
          Math.max(next.box.height, previous.box.height) /
            Math.max(1, Math.min(next.box.height, previous.box.height)) >
            1.75
        )
          break;
        group.unshift(previous);
      }
      title = field(
        group.map((l) => l.text).join(" "),
        group,
        "Contract header",
        "Structured",
      );
    }
  }
  if (title.value && blocked.test(title.value)) title = missing<string>();
  const pickups: {
    commodity: string | null;
    location: string;
    lines: OcrLine[];
  }[] = [];
  function paragraphs(source: OcrLine[]): { text: string; lines: OcrLine[] }[] {
    const groups: { text: string; lines: OcrLine[] }[] = [];
    for (const line of source) {
      const text = line.text.replace(/^[•·▪-]\s*/, "");
      if (/^(?:Deliver|Collect|Pick\s*up)\b/i.test(text))
        groups.push({ text, lines: [line] });
      else if (
        groups.length &&
        !/^(?:PRIMARY OBJECTIVES|DETAILS|Reward|Contracted By)/i.test(text)
      ) {
        const last = groups.at(-1)!;
        if (last.lines.length < 6) {
          last.text += " " + text;
          last.lines.push(line);
        }
      }
    }
    return groups;
  }
  for (const p of [...paragraphs(detailLines), ...paragraphs(objectiveLines)]) {
    const m =
      /^(?:Collect|Pick\s*up)\s+(?:(?:\d+(?:\.\d+)?\/)?\d+(?:\.\d+)?\s+SCU\s+of\s+(.+?)\s+)?(?:from|at)\s+(.+?)(?:[.;]|$)/i.exec(
        p.text,
      );
    if (m)
      pickups.push({
        commodity: m[1] ? clean(m[1]) : null,
        location: clean(m[2]),
        lines: p.lines,
      });
  }
  const objectives: ScanObjective[] = [];
  const seenEvidence = new Set<string>();
  for (const p of paragraphs(objectiveLines)) {
    if (!/^Deliver\b/i.test(p.text)) continue;
    const m =
      /^Deliver\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s+SCU\s+of\s+(.+?)\s+to\s+(.+?)(?:[.;]|$)/i.exec(
        p.text,
      );
    if (!m) {
      warnings.push(
        "A delivery row was recognized but could not be parsed: " +
          p.text.slice(0, 200),
      );
      continue;
    }
    const key = p.lines.map((l) => l.id).join("|");
    if (seenEvidence.has(key)) continue;
    seenEvidence.add(key);
    const required = number(m[2] ?? m[1]),
      delivered = m[2] ? number(m[1]) : null;
    const commodity = clean(m[3]),
      destination = clean(m[4]);
    const matching = pickups.filter(
      (p) => p.commodity?.toLowerCase() === commodity.toLowerCase(),
    );
    const choices = matching.length
      ? matching
      : pickups.filter((p) => p.commodity === null);
    const unique = [...new Set(choices.map((p) => p.location))];
    const pickup =
      unique.length === 1
        ? field(unique[0], choices[0].lines, "Details / Collect", "Structured")
        : unique.length > 1
          ? field<string>(
              null,
              choices.flatMap((p) => p.lines),
              "Details / Collect",
              "Structured",
              true,
            )
          : missing<string>();
    const invalid =
      required === null ||
      (delivered !== null && required !== null && delivered > required);
    if (invalid)
      warnings.push(
        "A delivery quantity failed validation; review its evidence.",
      );
    objectives.push({
      commodity: field(commodity, p.lines, "Primary Objectives"),
      destination: field(destination || null, p.lines, "Primary Objectives"),
      requiredSCU: field(
        required,
        p.lines,
        "Primary Objectives",
        "Structured",
        invalid,
      ),
      deliveredSCU: field(
        delivered,
        p.lines,
        "Primary Objectives",
        "Structured",
        invalid,
      ),
      pickup,
    });
  }
  const rowKeys = new Set<string>();
  for (const row of objectives) {
    const key = JSON.stringify([
      row.commodity.value,
      row.destination.value,
      row.requiredSCU.value,
      row.deliveredSCU.value,
    ]);
    if (rowKeys.has(key)) {
      warnings.push(
        "Identical visible delivery rows were retained separately; confirm whether they are distinct objectives.",
      );
      row.requiredSCU.state = "Ambiguous";
    }
    rowKeys.add(key);
  }
  if (!title.value)
    warnings.push(
      "Contract title is missing; unrelated labels were not used as a title.",
    );
  if (!objectives.length)
    warnings.push("No validated visible delivery objectives were extracted.");
  return {
    captureId,
    capturedAt,
    acceptanceTimestamp: null,
    title,
    company,
    reward,
    view,
    objectives,
    objectiveCount: primary
      ? {
          ...field(objectives.length, [primary], "Visible Primary Objectives"),
          confidence: null,
        }
      : missing<number>(),
    warnings: [...new Set(warnings)],
    potentiallyIncomplete: true,
  };
}
