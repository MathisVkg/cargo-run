import type { CargoDatabase } from "../storage/database";
import type { DomainSnapshot } from "../../../src/types/tracking";
import type { CaptureRecord } from "../../../src/types/ocr";
import type { Contract } from "../../../src/types/models";
import type {
  ConfirmReview,
  ResolveScan,
  ScanIssue,
  ScanOutcome,
  ReviewedDraft,
} from "../../../src/types/review";
import { observedDraft, prepareReview, versionOf, evidence } from "./review";
const norm = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function rowMatch(
  o: ReviewedDraft["objectives"][number],
  r: Contract["cargoObjectives"][number],
) {
  return (
    norm(o.commodity) === norm(r.commodity) &&
    norm(o.destination) === norm(r.destination) &&
    o.quantitySCU === r.quantitySCU &&
    (!r.pickupLocation ||
      !o.pickupLocation ||
      norm(o.pickupLocation) === norm(r.pickupLocation))
  );
}
export function inspectScan(
  db: CargoDatabase,
  state: DomainSnapshot,
  c: CaptureRecord,
  options: ResolveScan = { captureId: c.id },
): ScanIssue {
  const original = observedDraft(c),
    prior = evidence(db).find((l) => l.captureId === c.id);
  const all = [
    ...state.contracts,
    ...db
      .pendingMissions()
      .filter((p) => !state.contracts.some((c) => c.missionId === p.missionId)),
  ].filter((c) => !c.supersededBy && c.dataOrigin !== "Sample");
  const candidates = all.filter(
    (t) =>
      t.status === "Active" &&
      (prior?.contractId === t.id ||
        norm(t.name) === norm(original.name) ||
        original.objectives.some((o) =>
          t.cargoObjectives.some((r) => rowMatch(o, r)),
        )),
  );
  const strong = candidates.filter(
    (t) =>
      !!t.missionId &&
      norm(t.name) === norm(original.name) &&
      original.objectives.length > 0 &&
      original.objectives.every(
        (o) => t.cargoObjectives.filter((r) => rowMatch(o, r)).length === 1,
      ),
  );
  const bound = prior ? all.find((t) => t.id === prior.contractId) : undefined;
  const selected =
    options.targetId !== undefined
      ? candidates.find((t) => t.id === options.targetId)
      : (bound ??
        (strong.length === 1 && candidates.length === 1
          ? strong[0]
          : undefined));
  if (options.targetId && !selected)
    throw Error(
      "This active candidate is no longer available. Reload the issue.",
    );
  const d = structuredClone(options.draft ?? original);
  if (bound && selected?.id !== bound.id)
    d.objectives = d.objectives.map((o) => {
      const rows = bound.cargoObjectives.filter((r) => rowMatch(o, r));
      return {
        ...o,
        sourceObjectiveId: rows.length === 1 ? rows[0].id : undefined,
      };
    });
  const used = new Set<string>();
  const ambiguousRows: number[] = [];
  if (selected) {
    d.acceptedAt = selected.missionId ? selected.acceptedAt : d.acceptedAt;
    // Only visible rows are edited. Missing or unseen stored rows stay in the target.
    d.objectives = d.objectives.map((o) => {
      const matches = selected.cargoObjectives.filter(
        (r) => !used.has(r.id) && rowMatch(o, r),
      );
      const similar = selected.cargoObjectives.filter(
        (r) =>
          !used.has(r.id) &&
          norm(o.commodity) === norm(r.commodity) &&
          norm(o.destination) === norm(r.destination),
      );
      const known = o.existingObjectiveId
        ? selected.cargoObjectives.find((r) => r.id === o.existingObjectiveId)
        : matches.length === 1
          ? matches[0]
          : matches.length === 0 && similar.length === 1
            ? similar[0]
            : undefined;
      if (!known && similar.length)
        ambiguousRows.push(d.objectives.indexOf(o) + 1);
      if (known) used.add(known.id);
      return {
        ...o,
        existingObjectiveId: known?.id,
        externalObjectiveId: known?.externalObjectiveId?.startsWith("fallback-")
          ? undefined
          : known?.externalObjectiveId,
        deliveredSCU: known
          ? Math.max(known.deliveredSCU, o.deliveredSCU ?? 0)
          : o.deliveredSCU,
      };
    });
  }
  const review = prepareReview(db, state, {
    captureId: c.id,
    targetId: selected?.id ?? "",
    draft: d,
  });
  if (ambiguousRows.length)
    review.errors.push(
      "Existing objectives are ambiguous for visible row " +
        ambiguousRows.join(", ") +
        ". Use Advanced to choose their identity; no duplicate rows were appended.",
    );
  // Routine choices exclude closed history and unrelated reward-only candidates.
  review.candidates = review.candidates.filter((r) =>
    candidates.some((c) => c.id === r.contract.id),
  );
  review.targets = candidates;
  let message: string,
    status: ScanOutcome["status"] = "Pending corrections";
  const coverageEstablished =
    c.observation!.coverage?.state === "Established" ||
    (!!selected?.missionId &&
      state.contracts.some((c) => c.id === selected.id) &&
      selected.cargoObjectives.length > 0 &&
      d.objectives.length > 0 &&
      d.objectives.every((o) => !!o.existingObjectiveId));
  if (state.sampleMode)
    message = "Remove demonstration data before importing real cargo.";
  else if (
    c.validation === "Cancelled" ||
    c.validation === "Duplicate" ||
    c.validation === "Rejected" ||
    c.status === "Failed"
  ) {
    status = "Failed";
    message = c.error ?? "This capture is not a usable contract.";
  } else if (
    c.observation!.view.value === "Offers" &&
    !options.acceptedConfirmed
  )
    message =
      "This is an offer. Accept it in-game, or confirm acceptance if this is an older screenshot.";
  else if (
    c.observation!.view.value !== "Accepted" &&
    !options.acceptedConfirmed
  )
    message = "Confirm that this contract was accepted in-game.";
  else if (
    !options.draft &&
    [c.observation!.title, c.observation!.company, c.observation!.reward].some(
      (f) => f.state === "Ambiguous",
    )
  )
    message = "Confirm the ambiguous recognized field.";
  else if (review.errors.length) message = review.errors[0];
  else if (!coverageEstablished && !options.coverageConfirmed)
    message =
      c.observation!.coverage?.reason ??
      "Confirm the complete objective list; unseen objectives will be preserved.";
  else if (
    ((!selected && candidates.length) ||
      (options.targetId === undefined &&
        bound &&
        !bound.missionId &&
        candidates.some((c) => !!c.missionId))) &&
    !options.separate
  ) {
    status = "Ambiguous match";
    message =
      "Choose the active contract this screenshot belongs to, or create a separate accepted contract.";
  } else if (
    !selected &&
    !options.separate &&
    all.some(
      (t) =>
        t.status !== "Active" &&
        !!t.missionId &&
        norm(t.name) === norm(original.name) &&
        original.objectives.some((o) =>
          t.cargoObjectives.some((r) => rowMatch(o, r)),
        ) &&
        t.acceptedAt &&
        Math.abs(Date.parse(c.capturedAt) - Date.parse(t.acceptedAt)) < 1800000,
    )
  )
    message =
      "A recent matching mission is already closed. Use Advanced recovery to review its history.";
  else if (selected && selected.status !== "Active")
    message =
      "This contract is closed. It can only be changed through explicit advanced recovery.";
  else if (
    review.sourceContract &&
    Object.values(review.sourceContract.fieldProvenance ?? {}).some(
      (p) => p.source === "Manual",
    )
  )
    message =
      "Saved manual corrections are protected. Use Edit details / Advanced to confirm consolidation.";
  else if (review.conflicts.some((x) => !options.choices?.[x.path]))
    message =
      "Stored values differ. Choose which values to keep; manual corrections are protected.";
  else {
    status = selected ? "Updated" : "Imported";
    message = "Dashboard and Manifest updated.";
  }
  return {
    review,
    coverageEstablished,
    outcome: {
      status,
      message,
      contractId: selected?.id,
      candidateIds: candidates.map((c) => c.id),
      processedHash: versionOf([c.result, c.observation]),
    },
  };
}
export function scanConfirmation(
  issue: ScanIssue,
  options: ResolveScan,
): ConfirmReview {
  const r = issue.review;
  return {
    captureId: r.capture.id,
    targetId: r.target?.id ?? "",
    draft: r.draft,
    action: r.target ? "Update" : "Create",
    observationHash: r.observationHash,
    targetVersion: r.targetVersion,
    sourceVersion: r.sourceVersion,
    acceptedConfirmed:
      r.capture.observation?.view.value === "Accepted" ||
      options.acceptedConfirmed === true,
    incompleteConfirmed:
      issue.coverageEstablished || options.coverageConfirmed === true,
    associationConfirmed: !!r.target,
    distinctConfirmed: options.separate === true,
    consolidationConfirmed:
      !!r.sourceContract && options.targetId !== undefined,
    objectiveRemovalConfirmed: false,
    choices: options.choices ?? {},
  };
}
