import type { Contract } from "../../../src/types/models";
import type { CaptureRecord } from "../../../src/types/ocr";
import type {
  ReviewedDraft,
  MatchingDiagnostic,
} from "../../../src/types/review";
export const matchText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function similarObjective(
  o: ReviewedDraft["objectives"][number],
  r: Contract["cargoObjectives"][number],
) {
  return (
    matchText(o.commodity) === matchText(r.commodity) &&
    matchText(o.destination) === matchText(r.destination) &&
    (!r.pickupLocation ||
      !o.pickupLocation ||
      matchText(o.pickupLocation) === matchText(r.pickupLocation))
  );
}
export function matchingCandidates(
  all: Contract[],
  stored: Contract[],
  original: ReviewedDraft,
  capture: CaptureRecord,
  boundId?: string,
) {
  const candidates: Contract[] = [],
    diagnostics: MatchingDiagnostic[] = [];
  for (const t of all) {
    const title = matchText(t.name) === matchText(original.name),
      overlap = original.objectives.filter((o) =>
        t.cargoObjectives.some(
          (r) => similarObjective(o, r) && o.quantitySCU === r.quantitySCU,
        ),
      ).length,
      similar = original.objectives.filter((o) =>
        t.cargoObjectives.some((r) => similarObjective(o, r)),
      ).length;
    const bound = t.id === boundId;
    if (!title && !overlap && !bound) continue;
    const pending = !stored.some((c) => c.id === t.id);
    let reason: string,
      include = false;
    if (t.supersededBy) reason = "Superseded identity excluded.";
    else if (t.status !== "Active")
      reason = "Closed history excluded from routine candidates.";
    else if (bound) {
      reason = "Existing capture association retained.";
      include = true;
    } else if (pending && !t.cargoObjectives.length)
      reason =
        "Pending title-only mission has no objective evidence; retained for Advanced, not a competing identity.";
    else if (title && !t.cargoObjectives.length) {
      reason =
        "Stored active contract without cargo needs an explicit identity choice.";
      include = true;
    } else if (overlap || (title && similar)) {
      reason = "Objective evidence supports a competing active instance.";
      include = true;
    } else
      reason = "Identical title with different cargo is not an identity match.";
    if (include) candidates.push(t);
    const delta = t.acceptedAt
      ? Date.parse(capture.capturedAt) - Date.parse(t.acceptedAt)
      : NaN;
    if (diagnostics.length < 50)
      diagnostics.push({
        captureId: capture.id,
        candidateId: t.id,
        missionId: t.missionId ?? null,
        origin: pending ? "Pending Game.log" : "Stored contract",
        status: t.status,
        titleMatches: title,
        objectiveOverlap: overlap,
        objectiveCount: t.cargoObjectives.length,
        timeDeltaSeconds: Number.isFinite(delta)
          ? Math.round(delta / 1000)
          : null,
        decision: include ? "Included" : "Excluded",
        reason,
      });
  }
  return { candidates, diagnostics };
}
