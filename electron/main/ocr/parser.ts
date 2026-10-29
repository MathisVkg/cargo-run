import { establishCoverage } from "./coverage";
import type {
  OcrResult,
  OcrLine,
  Field,
  Evidence,
  ContractObservation,
  ScanObjective,
  Rect,
} from "../../../src/types/ocr";
const clean = (s: string) => s.replace(/[ \t\u00a0]+/g, " ").trim();
const normalized = (s: string) => clean(s).toUpperCase();
const navWords =
  /\b(?:HISTORY|BEACONS|OFFERS|ACCEPTED|CONTRACTS|GENERAL|PERSONAL|AVAILABLE|JOURNAL|COMMS|VEHICLES|SEARCH|TRACKING|MOBIGLAS)\b/gi;
const navigation = (s: string) => {
  const remainder = s.replace(navWords, "").replace(/[\d\s|/\\:()[\].>-]/g, "");
  return remainder.length === 0 && /[A-Za-z]/.test(s);
};
const heading = (s: string) =>
  /^(?:PRIMARY\s+OBJECTIVES|DETAILS)\s*:?\s*$/i.test(s);
// Checkbox/currency glyphs vary by font and OCR. Strip a checkbox prefix only
// immediately before a recognized objective verb; never alter evidence text.
const objectiveText = (s: string) =>
  s.replace(/^[^A-Za-z0-9]*\s*(?=(?:Deliver|Collect|Pick\s*up)\b)/i, "");
const excludedTitle = (s: string) =>
  navigation(s) ||
  heading(s) ||
  /^(?:ACCEPT\s+OFFER|REWARD|CONTRACTED\s+BY|ABANDON|UNTRACK|TRACK|DELIVER|COLLECT|PICK\s*UP|TITLE\s*:|CONTRACT\s+TITLE\s*:)\b/i.test(
    s,
  ) ||
  /\b(?:SCU|a?UEC)\b/i.test(s) ||
  /^[\d,.\s]+$/.test(s);
const missing = <T>(): Field<T> => ({
  value: null,
  state: "Missing",
  confidence: null,
  method: "Missing",
  evidence: null,
});
function bounds(lines: OcrLine[]): Rect | null {
  if (!lines.length) return null;
  const x = Math.min(...lines.map((l) => l.box.x)),
    y = Math.min(...lines.map((l) => l.box.y));
  return {
    x,
    y,
    width: Math.max(...lines.map((l) => l.box.x + l.box.width)) - x,
    height: Math.max(...lines.map((l) => l.box.y + l.box.height)) - y,
  };
}
function field<T>(
  value: T | null,
  lines: OcrLine[],
  region: string,
  method: "Explicit" | "Structured" = "Structured",
  ambiguous = false,
): Field<T> {
  if (value === null && !ambiguous) return missing<T>();
  const evidence: Evidence = {
    region,
    box: bounds(lines),
    lineIds: [...new Set(lines.map((l) => l.id))],
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
function numeric(text: string): number | null {
  const s = text.replace(/ /g, "");
  if (!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const location = (s: string) =>
  clean(s)
    .replace(/[.;:]\s*$/, "")
    .trim();
type Block = { text: string; lines: OcrLine[] };
export function extractContract(
  result: OcrResult,
  captureId: string,
  capturedAt: string,
): ContractObservation {
  const positioned = result.lines.length > 0,
    W = Math.max(1, result.width),
    H = Math.max(1, result.height);
  const lines = (
    positioned
      ? result.lines
      : result.text
          .split(/\r?\n/)
          .filter(Boolean)
          .map((text, i) => ({
            id: "text-" + i,
            text,
            box: { x: 0, y: i * 20, width: W, height: 18 },
            confidence: null,
          }))
  )
    .filter((l) => clean(l.text))
    .map((l) => ({ ...l, text: clean(l.text) }));
  const sorted = [...lines].sort(
    (a, b) => a.box.y - b.box.y || a.box.x - b.box.x,
  );
  const warnings = [
    "Only visible objectives were read. The objectives panel may scroll; this capture is potentially incomplete.",
  ];
  if (!positioned)
    warnings.push(
      "Text positions are unavailable; layout extraction is conservative.",
    );
  const nx = (l: OcrLine) => l.box.x / W,
    ny = (l: OcrLine) => l.box.y / H,
    bottom = (l: OcrLine) => (l.box.y + l.box.height) / H;
  function panel(name: "PRIMARY OBJECTIVES" | "DETAILS"): OcrLine | undefined {
    const direct = sorted.find(
      (l) => normalized(l.text).replace(/:$/, "") === name,
    );
    if (direct) return direct;
    if (name !== "PRIMARY OBJECTIVES") return undefined;
    const first = sorted.find((l) => /^PRIMARY[:]?$/i.test(l.text)),
      second =
        first &&
        sorted.find(
          (l) =>
            /^OBJECTIVES[:]?$/i.test(l.text) &&
            Math.abs(ny(l) - ny(first)) < 0.065 &&
            Math.abs(nx(l) - nx(first)) < 0.22,
        );
    return first && second
      ? {
          id: first.id + "+" + second.id,
          text: "PRIMARY OBJECTIVES",
          box: bounds([first, second])!,
          confidence: null,
        }
      : undefined;
  }
  const primary = panel("PRIMARY OBJECTIVES"),
    details = panel("DETAILS");
  function inPanel(line: OcrLine, anchor: OcrLine, other?: OcrLine) {
    if (
      line.id === anchor.id ||
      heading(line.text) ||
      /^(?:PRIMARY|OBJECTIVES)[:]?$/i.test(line.text)
    )
      return false;
    if (ny(line) < bottom(anchor) - 0.006) return false;
    if (!positioned)
      return !other || ny(other) < ny(anchor) || ny(line) < ny(other);
    let left = Math.max(0, nx(anchor) - 0.12),
      right = 1;
    if (other && Math.abs(nx(other) - nx(anchor)) > 0.08) {
      const split = (nx(other) + nx(anchor)) / 2;
      if (nx(other) < nx(anchor)) left = split;
      else right = split;
    } else if (other && ny(other) > ny(anchor) && ny(line) >= ny(other) - 0.005)
      return false;
    return nx(line) >= left - 0.015 && nx(line) < right;
  }
  let objectiveLines = primary
    ? sorted.filter((l) => inPanel(l, primary, details))
    : [];
  const detailLines = details
    ? sorted.filter((l) => inPanel(l, details, primary))
    : [];
  let provisional = false;
  if (!primary) {
    warnings.push(
      "PRIMARY OBJECTIVES was not recognized; description quantities were not converted into objectives.",
    );
    if (positioned && details) {
      const separated = sorted.filter(
        (l) => nx(l) > nx(details) + 0.16 && ny(l) >= ny(details),
      );
      if (separated.some((l) => /^Deliver\b/i.test(l.text))) {
        objectiveLines = separated;
        provisional = true;
        warnings.push(
          "Delivery rows in a separate pane were retained as provisional because the objectives heading is missing.",
        );
      }
    }
  }
  const navLines = sorted.filter((l) => navigation(l.text));
  let view = missing<"Offers" | "Accepted">();
  const explicit = sorted.filter((l) =>
    /^(?:SELECTED\s*:?\s*|CONTRACTS\s*[/>-]\s*|\[)(?:OFFERS|ACCEPTED)\]?$/i.test(
      l.text,
    ),
  );
  const explicitViews = [
    ...new Set(
      explicit.map((l) =>
        /\bACCEPTED\b/i.test(l.text)
          ? ("Accepted" as const)
          : ("Offers" as const),
      ),
    ),
  ];
  const offers = navLines.filter((l) => /\bOFFERS\b/i.test(l.text)),
    accepted = navLines.filter((l) => /\bACCEPTED\b/i.test(l.text));
  const actions = sorted.filter(
    (l) =>
      (!positioned || (ny(l) > 0.5 && nx(l) > 0.2)) &&
      /^(?:ACCEPT\s+OFFER|ABANDON|(?:UN)?TRACK)(?:\s*\|\s*(?:ABANDON|(?:UN)?TRACK))*$/i.test(
        l.text,
      ),
  );
  const offerActions = actions.filter((l) => /ACCEPT\s+OFFER/i.test(l.text));
  const acceptedActions = actions.filter((l) =>
    /\b(?:ABANDON|(?:UN)?TRACK)\b/i.test(l.text),
  );
  const actionView =
    offerActions.length && !acceptedActions.length
      ? "Offers"
      : acceptedActions.length && !offerActions.length
        ? "Accepted"
        : null;
  const contradiction =
    (offerActions.length && acceptedActions.length) ||
    explicitViews.length > 1 ||
    (actionView &&
      explicitViews.length === 1 &&
      explicitViews[0] !== actionView);
  if (contradiction) {
    view = field<"Offers" | "Accepted">(
      null,
      [...actions, ...explicit],
      "Action buttons and selected tab",
      "Structured",
      true,
    );
    warnings.push(
      "Contradictory contract action/tab indicators; acceptance must be explicitly confirmed.",
    );
  } else if (actionView)
    view = field(actionView, actions, "Contract action buttons", "Structured");
  else if (explicitViews.length === 1)
    view = field(explicitViews[0], explicit, "Navigation", "Explicit");
  else if (offers.length && accepted.length) {
    view = field<"Offers" | "Accepted">(
      null,
      [...offers, ...accepted],
      "Navigation",
      "Explicit",
      true,
    );
    warnings.push(
      "Both OFFERS and ACCEPTED are visible; OCR text alone cannot prove the selected tab.",
    );
  } else if (accepted.length || offers.length)
    view = field<"Offers" | "Accepted">(
      null,
      [...offers, ...accepted],
      "Navigation without action evidence",
      "Structured",
      true,
    );
  const metadataLabel = (s: string) =>
    /^(?:Contracted\s+By|Reward|Contract\s+Title|Title)\b/i.test(s);
  function metadata(
    pattern: RegExp,
    role: "reward" | "company" | "title",
  ): Block | null {
    const anchor = sorted.find((l) => pattern.test(l.text));
    if (!anchor) return null;
    const inline = clean(
      anchor.text.replace(pattern, "").replace(/^[:-]\s*/, ""),
    )
      .split(/\b(?:Reward|Contracted\s+By)\b/i)[0]
      .trim();
    const eligible = (l: OcrLine) =>
      !navigation(l.text) &&
      !heading(l.text) &&
      !metadataLabel(l.text) &&
      !/^Deliver|^Collect|^Pick\s*up/i.test(objectiveText(l.text)) &&
      (role !== "company" ||
        (!/\bSCU\b|\ba?UEC\b/i.test(l.text) &&
          !/^a?\s*-?\d[\d,\s.]*$/i.test(l.text)));
    const nearby = sorted.filter(
      (l) =>
        l.id !== anchor.id &&
        eligible(l) &&
        (!positioned ||
          ((Math.abs(nx(l) - nx(anchor)) < 0.17 ||
            (nx(l) > nx(anchor) && Math.abs(ny(l) - ny(anchor)) < 0.018)) &&
            ny(l) >= ny(anchor) - 0.008 &&
            ny(l) - bottom(anchor) < 0.1)),
    );
    const sameRow = positioned
      ? nearby
          .filter(
            (l) =>
              Math.abs(
                l.box.y +
                  l.box.height / 2 -
                  (anchor.box.y + anchor.box.height / 2),
              ) /
                H <
                0.018 && l.box.x >= anchor.box.x + anchor.box.width - W * 0.025,
          )
          .sort((a, b) => a.box.x - b.box.x)[0]
      : undefined;
    const below = nearby
      .filter((l) => l.box.y > anchor.box.y)
      .sort(
        (a, b) =>
          Math.abs(nx(a) - nx(anchor)) * 0.4 +
          (ny(a) - ny(anchor)) -
          (Math.abs(nx(b) - nx(anchor)) * 0.4 + (ny(b) - ny(anchor))),
      )[0];
    if (!inline && !sameRow && !below) return null;
    const first = inline ? anchor : (sameRow ?? below)!,
      values = [inline || first.text],
      evidence = inline ? [anchor] : [anchor, first];
    let previous = first;
    for (const line of sorted.filter(
      (l) => l.box.y > first.box.y && l.id !== anchor.id,
    )) {
      if (evidence.length >= 4) break;
      if (positioned && Math.abs(nx(line) - nx(first)) > 0.075) continue;
      const gap = (line.box.y - previous.box.y) / H;
      if (gap > (Math.max(line.box.height, previous.box.height) / H) * 2.3)
        break;
      if (
        metadataLabel(line.text) ||
        navigation(line.text) ||
        heading(line.text) ||
        /^Deliver|^Collect/i.test(line.text)
      )
        break;
      if (
        role === "reward" &&
        !/^(?:a?UEC|\d[\d,\s.]*|a\s+\d[\d,\s.]*)$/i.test(line.text)
      )
        break;
      values.push(line.text);
      evidence.push(line);
      previous = line;
    }
    return {
      text: values.join(" "),
      lines: [...new Map(evidence.map((l) => [l.id, l])).values()],
    };
  }
  const companyText = metadata(/^Contracted\s+By\b/i, "company"),
    rewardText = metadata(/^Reward\b/i, "reward");
  let company = companyText
    ? field(
        companyText.text,
        companyText.lines,
        "Contract metadata",
        "Explicit",
      )
    : missing<string>();
  if (company.value && /\b(?:SCU|a?UEC)\b/.test(company.value))
    company = { ...company, value: null, state: "Ambiguous" };
  let reward = missing<number>();
  if (rewardText) {
    const token =
      /^(?:[^\d-]{1,4}\s*|a?UEC\s*)?(-?\d[\d, ]*(?:\.\d+)?)\s*(?:a?UEC)?\s*[.;]?$/i.exec(
        rewardText.text,
      );
    const value = token ? numeric(token[1]) : null;
    reward = field(
      value,
      rewardText.lines,
      "Reward",
      "Explicit",
      value === null,
    );
  }
  const explicitTitle = metadata(/^(?:Contract\s+Title|Title)\s*:/i, "title");
  let title =
    explicitTitle && !excludedTitle(explicitTitle.text)
      ? field(
          explicitTitle.text,
          explicitTitle.lines,
          "Contract title",
          "Explicit",
        )
      : missing<string>();
  if (
    !title.value &&
    positioned &&
    details &&
    primary &&
    sorted.some((l) => /^Contracted\s+By/i.test(l.text) && nx(l) >= nx(primary))
  ) {
    // The live Mobiglas header places the title over Details, left of metadata.
    const titleLines = sorted.filter(
      (l) =>
        nx(l) >= nx(details) - 0.025 &&
        nx(l) < nx(primary) - 0.045 &&
        ny(l) < ny(details) - 0.025 &&
        ny(l) > ny(details) - 0.19 &&
        l.box.height / H >= 0.012 &&
        !excludedTitle(l.text) &&
        !/^(?:Contract Availability|Contract Deadline|N\/A|\d+h\b)/i.test(
          l.text,
        ),
    );
    const large = titleLines.filter(
      (l) =>
        l.box.height >= Math.max(...titleLines.map((r) => r.box.height)) * 0.65,
    );
    if (
      large.length &&
      large.length <= 3 &&
      large.every((l, i) => !i || (l.box.y - large[i - 1].box.y) / H < 0.06)
    ) {
      title = field(
        large.map((l) => l.text).join(" "),
        large,
        "Contract title header",
      );
    }
  }
  if (!title.value) {
    const anchors = sorted.filter((l) =>
        /^Contracted\s+By|^Reward\b/i.test(l.text),
      ),
      top = anchors.length ? Math.min(...anchors.map(ny)) : null;
    const left = anchors.length
      ? Math.max(
          0,
          Math.min(...anchors.map(nx)) -
            (anchors.some((l) => /^Contracted/i.test(l.text)) ? 0.15 : 0.35),
        )
      : 0;
    const right = anchors.length
      ? Math.min(
          1,
          Math.max(...anchors.map((l) => (l.box.x + l.box.width) / W)) + 0.12,
        )
      : 1;
    const candidates =
      top === null
        ? []
        : sorted.filter(
            (l) =>
              ny(l) < top - 0.002 &&
              top - ny(l) < 0.3 &&
              (!positioned || (nx(l) >= left && nx(l) < right)) &&
              !excludedTitle(l.text),
          );
    const last = candidates.at(-1);
    if (last) {
      const group = [last];
      for (let i = candidates.length - 2; i >= 0 && group.length < 3; i--) {
        const previous = candidates[i],
          next = group[0];
        if (
          Math.abs(nx(previous) - nx(next)) > 0.08 ||
          next.box.y - previous.box.y >
            Math.max(next.box.height, previous.box.height) * 2.3
        )
          break;
        group.unshift(previous);
      }
      title = field(
        group.map((l) => l.text).join(" "),
        group,
        "Contract title",
      );
    }
  }
  function paragraphs(source: OcrLine[]): Block[] {
    const groups: Block[] = [];
    for (const line of source) {
      if (
        navigation(line.text) ||
        metadataLabel(line.text) ||
        heading(line.text) ||
        /^(?:ABANDON|TRACK|UNTRACK)\b/i.test(line.text)
      )
        continue;
      const text = objectiveText(line.text)
        .replace(/^\s*(?:[•·▪✓]|\[[ xX✓]?\]|\d+[.)])\s*/, "")
        .replace(/^[-–]\s*/, "")
        .trim();
      if (/^(?:Deliver|Collect|Pick\s*up)\b/i.test(text)) {
        const pieces = text
          .split(/(?=\b(?:Deliver|Collect)\s+)/i)
          .filter(Boolean);
        for (const piece of pieces)
          groups.push({ text: piece.trim(), lines: [line] });
      } else if (groups.length) {
        const last = groups.at(-1)!,
          previous = last.lines.at(-1)!;
        if (
          /[.;]$/.test(last.text) &&
          !/(?:\bInt|\bSt|\bCo|\bLtd|\bDr)\.$/i.test(last.text)
        )
          continue;
        if (
          last.lines.length < 8 &&
          (!positioned ||
            (Math.abs(nx(line) - nx(previous)) < 0.18 &&
              (line.box.y - previous.box.y) / H < 0.065))
        ) {
          last.text += " " + text;
          last.lines.push(line);
        }
      }
    }
    return groups;
  }
  const pickups: {
    commodity: string | null;
    location: string;
    block: Block;
    primary: boolean;
  }[] = [];
  for (const [source, isPrimary] of [
    [detailLines, false],
    [objectiveLines, true],
  ] as const)
    for (const p of paragraphs(source)) {
      const body = p.text.replace(/^(?:Collect|Pick\s*up)\s+/i, "");
      if (body === p.text) continue;
      const stripped = body.replace(
        /^(?:\d+(?:\.\d+)?\/)?\d+(?:\.\d+)?\s*SCU\s+(?:of\s+)?/i,
        "",
      );
      const m = /^(?:(.*?)\s+)?(?:from|at)\s+(.+)$/i.exec(stripped);
      if (m && location(m[2]))
        pickups.push({
          commodity: m[1] ? clean(m[1]) : null,
          location: location(m[2]),
          block: p,
          primary: isPrimary,
        });
    }
  const objectives: ScanObjective[] = [],
    used = new Set<string>();
  for (const p of paragraphs(objectiveLines)) {
    if (!/^Deliver\b/i.test(p.text)) continue;
    const m =
      /^Deliver\s+(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\s*SCU\s+(?:of\s+)?(.+)$/i.exec(
        p.text,
      );
    if (!m) {
      warnings.push(
        "A delivery row was recognized but could not be parsed: " +
          p.text.slice(0, 200),
      );
      continue;
    }
    const body = m[3],
      split = /\s+to(?:\s+|$)/i.exec(body),
      commodity = clean(split ? body.slice(0, split.index) : body),
      destination = split
        ? location(body.slice(split.index + split[0].length))
        : null;
    const evidenceKey = p.lines.map((l) => l.id).join("|") + "|" + p.text;
    if (used.has(evidenceKey)) continue;
    used.add(evidenceKey);
    const required = numeric(m[2] ?? m[1]),
      delivered = m[2] ? numeric(m[1]) : null;
    const invalid =
      required === null ||
      (delivered !== null && required !== null && delivered > required);
    const matches = pickups.filter(
        (p) => p.commodity?.toLowerCase() === commodity.toLowerCase(),
      ),
      choices = matches.length
        ? matches
        : pickups.filter((p) => p.commodity === null);
    let associated = choices;
    const nextDelivery = paragraphs(objectiveLines).find(
      (row) =>
        /^Deliver\b/i.test(row.text) && row.lines[0].box.y > p.lines[0].box.y,
    );
    const following = choices.filter(
      (c) =>
        c.primary &&
        c.block.lines[0].box.y > p.lines.at(-1)!.box.y &&
        (!nextDelivery || c.block.lines[0].box.y < nextDelivery.lines[0].box.y),
    );
    const preceding = choices
      .filter((c) => c.primary && c.block.lines[0].box.y <= p.lines[0].box.y)
      .sort((a, b) => b.block.lines[0].box.y - a.block.lines[0].box.y);
    if (following.length) associated = following;
    else if (
      new Set(choices.map((c) => c.location)).size > 1 &&
      preceding.length
    )
      associated = preceding.filter(
        (c) =>
          Math.abs(c.block.lines[0].box.y - preceding[0].block.lines[0].box.y) /
            H <
          0.01,
      );
    const locations = [...new Set(associated.map((c) => c.location))];
    const pickup =
      locations.length === 1
        ? field(locations[0], associated[0].block.lines, "Collect / Details")
        : locations.length > 1
          ? field<string>(
              null,
              associated.flatMap((c) => c.block.lines),
              "Collect / Details",
              "Structured",
              true,
            )
          : missing<string>();
    const clippedDestination =
      !!destination && /\b(?:on|to|at|from)$/i.test(destination);
    if (clippedDestination)
      warnings.push(
        "A partial destination appears clipped; its visible text was retained for review.",
      );
    if (!destination)
      warnings.push(
        "A partial delivery objective was retained; its destination is missing.",
      );
    if (invalid)
      warnings.push(
        "A delivery quantity failed validation; review its evidence.",
      );
    objectives.push({
      commodity: field(commodity || null, p.lines, "Primary Objectives"),
      destination: field(
        destination || null,
        p.lines,
        "Primary Objectives",
        "Structured",
        (provisional || clippedDestination) && !!destination,
      ),
      requiredSCU: field(
        required,
        p.lines,
        "Primary Objectives",
        "Structured",
        invalid || provisional,
      ),
      deliveredSCU: field(
        delivered,
        p.lines,
        "Primary Objectives",
        "Structured",
        invalid || provisional,
      ),
      pickup,
    });
  }
  const keys = new Set<string>();
  for (const row of objectives) {
    const key = JSON.stringify([
      row.commodity.value,
      row.destination.value,
      row.requiredSCU.value,
      row.deliveredSCU.value,
    ]);
    if (keys.has(key)) {
      warnings.push(
        "Identical visible delivery rows were retained separately; confirm whether they are distinct objectives.",
      );
      row.requiredSCU.state = "Ambiguous";
    }
    keys.add(key);
  }
  if (!title.value)
    warnings.push(
      "Contract title is missing; unrelated labels were not used as a title.",
    );
  if (!objectives.length)
    warnings.push("No validated visible delivery objectives were extracted.");
  const observation: ContractObservation = {
    parserVersion: "0.4.1",
    captureId,
    capturedAt,
    acceptanceTimestamp: null,
    title,
    company,
    reward,
    view,
    objectives,
    objectiveCount:
      primary || provisional
        ? {
            ...field(
              objectives.length,
              primary ? [primary] : [],
              "Visible Primary Objectives",
              "Structured",
              provisional,
            ),
            confidence: null,
          }
        : missing<number>(),
    warnings: [...new Set(warnings)],
    potentiallyIncomplete: true,
  };
  observation.coverage = establishCoverage(result, observation);
  observation.potentiallyIncomplete =
    observation.coverage.state !== "Established";
  if (!observation.potentiallyIncomplete)
    observation.warnings = observation.warnings.filter(
      (w) => !w.startsWith("Only visible objectives were read."),
    );
  return observation;
}
