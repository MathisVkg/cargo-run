import type { ContractObservation, OcrResult } from "../../../src/types/ocr";
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function establishCoverage(result: OcrResult, o: ContractObservation) {
  const fields = o.objectives.flatMap((r) => [
    r.commodity,
    r.pickup,
    r.destination,
    r.requiredSCU,
    r.deliveredSCU,
  ]);
  const invalid =
    !o.objectives.length ||
    fields.some(
      (f) => f.value === null || f.state !== "Recognized" || !f.evidence?.box,
    );
  const clipping =
    /\b(?:SCROLL|MORE OBJECTIVES|CONTINUED)\b/i.test(result.text) ||
    o.warnings.some((w) =>
      /partial|clipped|truncat|could not be parsed|provisional/i.test(w),
    );
  const primary = o.objectiveCount.evidence?.box,
    action = o.view.evidence?.box;
  const collectors = new Set(
    o.objectives.map((r) => r.pickup.evidence?.lineIds.join("|")),
  );
  const paired =
    !invalid &&
    !!primary &&
    !!action &&
    o.view.evidence?.region === "Contract action buttons" &&
    collectors.size === o.objectives.length &&
    o.objectives.every((r) => {
      const p = r.pickup.evidence!.box!,
        d = r.destination.evidence!.box!;
      return (
        p.y > primary.y &&
        p.x / result.width > 0.55 &&
        p.y + p.height < action.y - result.height * 0.025 &&
        d.y + d.height < action.y - result.height * 0.005
      );
    });
  const totals = new Map<string, Set<number>>();
  for (const line of result.lines.filter(
    (l) => primary && l.box.x < primary.x - result.width * 0.1,
  )) {
    const m = /(\d+(?:\.\d+)?)\s*SCU\s+of\s+(.+?)(?:\s+from\b|[.;]|$)/i.exec(
      line.text,
    );
    if (m) {
      const key = norm(m[2]);
      if (!totals.has(key)) totals.set(key, new Set());
      totals.get(key)!.add(Number(m[1]));
    }
  }
  const commodities = [
    ...new Set(o.objectives.map((r) => r.commodity.value ?? "")),
  ];
  const independent =
    commodities.length > 0 &&
    commodities.every((c) => {
      const counts = totals.get(norm(c));
      return (
        counts?.size === 1 &&
        [...counts][0] ===
          o.objectives
            .filter((r) => r.commodity.value === c)
            .reduce((n, r) => n + (r.requiredSCU.value ?? 0), 0)
      );
    });
  const established =
    !invalid && !clipping && !!primary && (paired || independent);
  return {
    state: established ? ("Established" as const) : ("Partial" as const),
    reason: established
      ? independent
        ? "Description quantities cover every visible commodity."
        : "Objectives start at the panel heading and all delivery/collection pairs end before the action bar."
      : "Objective coverage is not established; unseen objectives are preserved.",
  };
}
