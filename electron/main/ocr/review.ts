import { createHash, randomUUID } from "node:crypto";
import type { CargoDatabase } from "../storage/database";
import type { DomainSnapshot } from "../../../src/types/tracking";
import type { Contract, CargoObjective } from "../../../src/types/models";
import type { CaptureRecord } from "../../../src/types/ocr";
import type {
  ReviewedDraft,
  ReviewedObjective,
  PrepareReview,
  ConfirmReview,
  OcrReview,
  EvidenceLink,
  MatchCandidate,
  ReviewConflict,
} from "../../../src/types/review";
import { reviewErrors } from "../../../src/types/review";
export const versionOf = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function observedDraft(c: CaptureRecord): ReviewedDraft {
  const o = c.observation;
  if (!o) throw Error("Reprocess saved OCR before reviewing this observation.");
  return {
    name: o.title.value ?? "",
    company: o.company.value,
    payout: o.reward.value,
    acceptedAt: null,
    objectives: o.objectives.map((r) => ({
      commodity: r.commodity.value ?? "",
      pickupLocation: r.pickup.value ?? "",
      destination: r.destination.value ?? "",
      quantitySCU: r.requiredSCU.value,
      deliveredSCU: r.deliveredSCU.value,
    })),
  };
}
export function contractDraft(c: Contract): ReviewedDraft {
  return {
    name: c.name,
    company: c.company ?? null,
    payout: c.payout,
    acceptedAt: c.acceptedAt,
    objectives: c.cargoObjectives.map((o) => ({
      ...o,
      existingObjectiveId: o.id,
      sourceObjectiveId: o.id,
    })),
  };
}
function id(v: unknown, label: string, optional = false): string | undefined {
  if (optional && (v === undefined || v === "")) return undefined;
  if (typeof v !== "string" || !v || v.length > 256)
    throw Error("Invalid " + label);
  return v;
}
function draft(value: unknown): ReviewedDraft {
  if (!value || typeof value !== "object")
    throw Error("Invalid reviewed fields.");
  const d = value as ReviewedDraft;
  if (
    typeof d.name !== "string" ||
    !(d.company === null || typeof d.company === "string") ||
    !(d.payout === null || typeof d.payout === "number") ||
    !(d.acceptedAt === null || typeof d.acceptedAt === "string") ||
    !Array.isArray(d.objectives) ||
    d.objectives.length > 100
  )
    throw Error("Invalid reviewed field types.");
  return {
    name: d.name.trim(),
    company: d.company?.trim() || null,
    payout: d.payout,
    acceptedAt: d.acceptedAt,
    objectives: d.objectives.map((o) => {
      if (
        !o ||
        typeof o !== "object" ||
        [o.commodity, o.pickupLocation, o.destination].some(
          (v) => typeof v !== "string",
        ) ||
        !(o.quantitySCU === null || typeof o.quantitySCU === "number") ||
        !(o.deliveredSCU === null || typeof o.deliveredSCU === "number")
      )
        throw Error("Invalid reviewed objective.");
      return {
        commodity: o.commodity.trim(),
        pickupLocation: o.pickupLocation.trim(),
        destination: o.destination.trim(),
        quantitySCU: o.quantitySCU,
        deliveredSCU: o.deliveredSCU,
        existingObjectiveId: id(o.existingObjectiveId, "objective", true),
        sourceObjectiveId: id(o.sourceObjectiveId, "source objective", true),
        externalObjectiveId: id(o.externalObjectiveId, "ObjectiveId", true),
        newDistinct: o.newDistinct === true,
      };
    }),
  };
}
function ids(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100)
    throw Error("Invalid objective removal list.");
  return [...new Set(value.map((v) => id(v, "objective")!))];
}
export function evidence(
  db: CargoDatabase,
  contractId?: string,
): EvidenceLink[] {
  const rows = contractId
    ? db.db
        .prepare(
          "SELECT * FROM capture_contract_links WHERE contract_id=? ORDER BY associated_at DESC",
        )
        .all(contractId)
    : db.db.prepare("SELECT * FROM capture_contract_links").all();
  return rows.map((row) => {
    const payload = JSON.parse(String(row.payload)) as EvidenceLink;
    const capture = db.db
      .prepare("SELECT payload FROM ocr_captures WHERE id=?")
      .get(String(row.capture_id));
    const c = capture
      ? (JSON.parse(String(capture.payload)) as CaptureRecord)
      : null;
    const canonical = db.db
      .prepare("SELECT mission_id FROM contracts WHERE id=?")
      .get(String(row.contract_id));
    return {
      ...payload,
      missionId: canonical?.mission_id ? String(canonical.mission_id) : null,
      captureId: String(row.capture_id),
      contractId: String(row.contract_id),
      attached: !!row.attached,
      imageAvailable: !!c?.screenshot,
    };
  });
}
function supported(a: ReviewedObjective, b: CargoObjective) {
  return (
    norm(a.commodity) === norm(b.commodity) &&
    norm(a.destination) === norm(b.destination) &&
    a.quantitySCU === b.quantitySCU &&
    (!b.pickupLocation || norm(a.pickupLocation) === norm(b.pickupLocation))
  );
}
function pending(db: CargoDatabase, c?: Contract) {
  if (!c?.missionId) return [];
  return db.db
    .prepare(
      "SELECT payload FROM mission_events WHERE mission_id=? AND kind='Objective'",
    )
    .all(c.missionId)
    .map((r) => JSON.parse(String(r.payload)))
    .filter((e) => e.objectiveId)
    .map((e) => ({
      id: e.objectiveId as string,
      commodity: e.commodity as string,
      destination: e.destination as string,
      quantitySCU: e.quantitySCU as number,
      deliveredSCU: e.deliveredSCU as number,
    }));
}
export function prepareReview(
  db: CargoDatabase,
  state: DomainSnapshot,
  value: unknown,
): OcrReview {
  if (!value || typeof value !== "object")
    throw Error("Invalid review request.");
  const req = value as PrepareReview,
    captureId = id(req.captureId, "CaptureId")!;
  const row = db.db
    .prepare("SELECT payload FROM ocr_captures WHERE id=?")
    .get(captureId);
  if (!row)
    throw Error(
      "This observation expired or was removed. Existing contract/evidence data is preserved.",
    );
  const capture = JSON.parse(String(row.payload)) as CaptureRecord,
    original = observedDraft(capture);
  const previous = evidence(db).find((l) => l.captureId === captureId);
  const targets = state.contracts.filter(
    (c) => c.dataOrigin !== "Sample" && !c.supersededBy,
  );
  const targetId =
    req.targetId === undefined
      ? previous?.contractId
      : id(req.targetId, "target", true);
  const target = targetId ? targets.find((c) => c.id === targetId) : undefined;
  if (targetId && !target) throw Error("Contract is unavailable.");
  const sourceContract =
    previous && previous.contractId !== targetId
      ? targets.find((c) => c.id === previous.contractId)
      : undefined;
  let reviewed = req.draft
    ? draft(req.draft)
    : previous
      ? contractDraft(targets.find((c) => c.id === previous.contractId)!)
      : structuredClone(original);
  if (!req.draft && target) {
    const used = new Set<string>();
    reviewed = {
      ...reviewed,
      acceptedAt: target.missionId ? target.acceptedAt : reviewed.acceptedAt,
      objectives: reviewed.objectives.map((o) => {
        const matches = target.cargoObjectives.filter(
          (x) => !used.has(x.id) && supported(o, x),
        );
        const match = matches.length === 1 ? matches[0] : undefined;
        if (match) used.add(match.id);
        return {
          ...o,
          existingObjectiveId: match?.id,
          externalObjectiveId: match?.externalObjectiveId?.startsWith(
            "fallback-",
          )
            ? undefined
            : match?.externalObjectiveId,
        };
      }),
    };
  }
  const candidates: MatchCandidate[] = targets
    .flatMap((c) => {
      const reasons: string[] = [],
        overlap = original.objectives.filter((o) =>
          c.cargoObjectives.some((x) => supported(o, x)),
        ).length,
        title = norm(c.name) === norm(original.name);
      const verified =
        previous?.contractId === c.id &&
        !!c.missionId &&
        previous.missionId === c.missionId;
      const trigger =
        c.missionId && capture.trigger?.candidateMissionId === c.missionId;
      if (verified)
        reasons.push("Previously user-confirmed MissionId association.");
      if (title) reasons.push("Same title is supporting evidence only.");
      if (overlap) reasons.push(overlap + " objective rows agree.");
      if (original.payout !== null && original.payout === c.payout)
        reasons.push("Reward agrees.");
      if (trigger)
        reasons.push(
          "Unverified automatic trigger candidate; timing does not prove identity.",
        );
      if (!(verified || title || overlap || trigger || reasons.length))
        return [];
      if (
        c.acceptedAt &&
        Math.abs(Date.parse(capture.capturedAt) - Date.parse(c.acceptedAt)) <
          1800000
      )
        reasons.push(
          "Acceptance/capture timing is supportive, never definitive.",
        );
      return [
        {
          contract: c,
          version: versionOf(c),
          kind: verified
            ? "Verified MissionId"
            : title && overlap
              ? "Strong supporting match"
              : trigger
                ? "Unverified trigger"
                : "Possible match",
          reasons,
        } as MatchCandidate,
      ];
    })
    .sort(
      (a, b) =>
        Number(b.kind === "Verified MissionId") -
        Number(a.kind === "Verified MissionId"),
    );
  const errors = reviewErrors(reviewed),
    conflicts: ReviewConflict[] = [];
  const conflict = (path: string, stored: unknown, incoming: unknown) => {
    if (
      stored !== null &&
      stored !== undefined &&
      stored !== "" &&
      !same(stored, incoming)
    ) {
      const existing = conflicts.find((c) => c.path === path);
      if (existing) {
        if (
          path.endsWith(".deliveredSCU") &&
          Number(stored) > Number(existing.stored)
        )
          existing.stored = stored;
      } else
        conflicts.push({
          path,
          stored,
          reviewed: incoming,
          message:
            "Choose the stored value or the reviewed value. Both remain in the audit.",
        });
    }
  };
  if (target) {
    for (const key of ["name", "company", "payout", "acceptedAt"] as const)
      conflict(key, target[key] ?? null, reviewed[key]);
    const mapped = new Set<string>(),
      external = new Set<string>(),
      events = pending(db, target);
    reviewed.objectives.forEach((o, i) => {
      const prior = target.cargoObjectives.find(
        (x) => x.id === o.existingObjectiveId,
      );
      if (o.existingObjectiveId && !prior)
        errors.push("Objective " + (i + 1) + " maps to an unavailable row.");
      if (o.existingObjectiveId && mapped.has(o.existingObjectiveId))
        errors.push("Do not map two rows to the same existing objective.");
      if (o.existingObjectiveId) mapped.add(o.existingObjectiveId);
      if (
        !prior &&
        target.cargoObjectives.some((x) => supported(o, x)) &&
        !o.newDistinct
      )
        errors.push(
          "Objective " +
            (i + 1) +
            " resembles a stored row: map it or confirm a distinct objective.",
        );
      if (o.externalObjectiveId) {
        if (
          !target.missionId ||
          (!events.some((e) => e.id === o.externalObjectiveId) &&
            !target.cargoObjectives.some(
              (x) => x.externalObjectiveId === o.externalObjectiveId,
            ))
        )
          errors.push(
            "ObjectiveId must come from this MissionId's observed events.",
          );
        if (
          external.has(o.externalObjectiveId) ||
          target.cargoObjectives.some(
            (x) =>
              x.externalObjectiveId === o.externalObjectiveId &&
              x.id !== prior?.id &&
              !ids(req.removeObjectiveIds).includes(x.id),
          )
        )
          errors.push("ObjectiveId is already assigned to another row.");
        external.add(o.externalObjectiveId);
      }
      if (prior)
        for (const key of [
          "commodity",
          "pickupLocation",
          "destination",
          "quantitySCU",
          "deliveredSCU",
        ] as const)
          conflict("objectives." + i + "." + key, prior[key], o[key]);
      const event = events
        .filter((e) => e.id === o.externalObjectiveId)
        .sort((a, b) => b.deliveredSCU - a.deliveredSCU)[0];
      if (
        event &&
        event.deliveredSCU > (prior?.deliveredSCU ?? 0) &&
        event.deliveredSCU !== o.deliveredSCU
      )
        conflict(
          "objectives." + i + ".deliveredSCU",
          event.deliveredSCU,
          o.deliveredSCU,
        );
    });
    for (const remove of ids(req.removeObjectiveIds)) {
      const o = target.cargoObjectives.find((x) => x.id === remove);
      if (!o || mapped.has(remove) || o.deliveredSCU > 0)
        errors.push(
          "Only explicitly removed, undelivered existing objectives can be deleted.",
        );
    }
    if (target.missionId && reviewed.acceptedAt !== target.acceptedAt)
      errors.push(
        "Preserve the known acceptance time of the Game.log contract.",
      );
  }
  if (sourceContract) {
    if (
      sourceContract.missionId ||
      !target?.missionId ||
      sourceContract.source !== "OCR"
    )
      errors.push(
        "This capture is already bound to another contract. Different MissionIds cannot be merged.",
      );
    if (
      sourceContract.status !== "Active" &&
      target?.status !== "Active" &&
      sourceContract.status !== target?.status
    )
      errors.push(
        "Conflicting closed lifecycle states require separate review; no consolidation was applied.",
      );
    const represented = new Set(
        reviewed.objectives.map((o) => o.sourceObjectiveId),
      ),
      removed = new Set(ids(req.removeSourceObjectiveIds));
    if (
      sourceContract.cargoObjectives.some(
        (o) => !represented.has(o.id) && !removed.has(o.id),
      )
    )
      errors.push(
        "Include every OCR contract objective or explicitly confirm its removal before consolidation.",
      );
  }
  const warnings = [...capture.observation!.warnings];
  if (capture.trigger)
    warnings.push(
      "Trigger MissionId is unverified. Never choose an association by recency alone.",
    );
  if (target?.status !== "Active" && target)
    warnings.push(
      "Closed lifecycle and earnings are preserved; the screenshot cannot reactivate this contract.",
    );
  if (state.sampleMode)
    warnings.push(
      "Remove demonstration contracts before saving real OCR contracts.",
    );
  return {
    capture,
    observationHash: versionOf([capture.result, capture.observation]),
    original,
    draft: reviewed,
    candidates,
    targets,
    conflicts,
    errors: [...new Set(errors)],
    warnings,
    target,
    targetVersion: target ? versionOf(target) : undefined,
    previous,
    sourceContract,
    sourceVersion: sourceContract ? versionOf(sourceContract) : undefined,
    pendingObjectives: pending(db, target),
  };
}
export interface ReviewPlan {
  contracts: Contract[];
  runIds: string[];
  contract: Contract;
  link: EvidenceLink;
  submissionHash: string;
  idempotent: boolean;
  moveFrom?: string;
  audit: unknown;
}
export function planReview(
  db: CargoDatabase,
  state: DomainSnapshot,
  value: unknown,
): ReviewPlan {
  if (!value || typeof value !== "object") throw Error("Invalid confirmation.");
  const input = value as ConfirmReview,
    captureId = id(input.captureId, "CaptureId")!;
  if (!["Create", "Update"].includes(input.action))
    throw Error("Choose Create or Update.");
  for (const key of [
    "acceptedConfirmed",
    "incompleteConfirmed",
    "associationConfirmed",
    "distinctConfirmed",
    "consolidationConfirmed",
    "objectiveRemovalConfirmed",
  ] as const)
    if (typeof input[key] !== "boolean")
      throw Error("Missing explicit confirmation: " + key);
  if (
    !input.choices ||
    typeof input.choices !== "object" ||
    Array.isArray(input.choices) ||
    Object.keys(input.choices).length > 600 ||
    Object.values(input.choices).some((v) => !["Keep", "Reviewed"].includes(v))
  )
    throw Error("Invalid conflict choices.");
  const submissionHash = versionOf(input),
    prior = evidence(db).find((l) => l.captureId === captureId);
  const duplicate = db.db
    .prepare(
      "SELECT contract_id FROM ocr_review_audit WHERE capture_id=? AND submission_hash=?",
    )
    .get(captureId, submissionHash);
  if (duplicate || (input.action === "Create" && prior)) {
    const contract = state.contracts.find(
      (c) => c.id === (prior?.contractId ?? String(duplicate?.contract_id)),
    );
    if (!contract) throw Error("Previously reviewed contract is unavailable.");
    return {
      contracts: state.contracts,
      runIds: state.currentRun.contractIds,
      contract,
      link: prior!,
      submissionHash,
      idempotent: true,
      audit: null,
    };
  }
  if (
    state.sampleMode ||
    state.contracts.some((c) => c.dataOrigin === "Sample")
  )
    throw Error("Remove demonstration contracts before saving real OCR data.");
  const review = prepareReview(db, state, input);
  if (review.observationHash !== input.observationHash)
    throw Error("OCR changed since review. Reload before confirming.");
  if (!input.acceptedConfirmed)
    throw Error(
      "Explicitly confirm that this contract was accepted; Offers/Ambiguous cannot activate a contract.",
    );
  if (
    !input.incompleteConfirmed &&
    (review.capture.observation?.potentiallyIncomplete ||
      review.warnings.length)
  )
    throw Error("Confirm review of the potentially incomplete objective list.");
  if (review.errors.length) throw Error(review.errors.join(" "));
  const target = review.target;
  if (input.action === "Update" && (!target || !input.associationConfirmed))
    throw Error(
      "Select and explicitly confirm the existing contract association.",
    );
  if (input.action === "Create" && target)
    throw Error("Create cannot target an existing contract.");
  if (
    input.action === "Create" &&
    review.candidates.length &&
    !input.distinctConfirmed
  )
    throw Error(
      "Confirm this is a separate accepted instance from the matching candidates.",
    );
  if (target && versionOf(target) !== input.targetVersion)
    throw Error(
      "Contract changed since review. Reload to preserve newer edits.",
    );
  if (
    review.sourceContract &&
    versionOf(review.sourceContract) !== input.sourceVersion
  )
    throw Error("The OCR-only contract changed. Reload before consolidation.");
  if (review.sourceContract && !input.consolidationConfirmed)
    throw Error(
      "Explicitly confirm consolidation of the OCR-only record into the selected MissionId.",
    );
  if (
    (ids(input.removeObjectiveIds).length ||
      ids(input.removeSourceObjectiveIds).length) &&
    !input.objectiveRemovalConfirmed
  )
    throw Error("Explicitly confirm objective removal.");
  if (prior?.missionId && target?.missionId !== prior.missionId)
    throw Error("Never merge two different verified MissionIds.");
  for (const c of review.conflicts)
    if (!input.choices[c.path]) throw Error("Resolve conflict: " + c.path);
  const now = new Date().toISOString(),
    contractId = target?.id ?? randomUUID(),
    d = review.draft;
  const choose = (path: string, incoming: unknown) =>
    input.choices[path] === "Keep"
      ? review.conflicts.find((c) => c.path === path)?.stored
      : incoming;
  const name = String(choose("name", d.name)),
    company = choose("company", d.company) as string | null,
    payout = choose("payout", d.payout) as number | null,
    acceptedAt = target?.missionId
      ? target.acceptedAt
      : (choose("acceptedAt", d.acceptedAt) as string | null);
  const chosenDraft: ReviewedDraft = {
    ...d,
    name,
    company,
    payout,
    acceptedAt,
    objectives: d.objectives.map((o, i) => ({
      ...o,
      ...Object.fromEntries(
        [
          "commodity",
          "pickupLocation",
          "destination",
          "quantitySCU",
          "deliveredSCU",
        ].map((key) => [
          key,
          choose("objectives." + i + "." + key, o[key as keyof typeof o]),
        ]),
      ),
    })),
  };
  const chosenErrors = reviewErrors(chosenDraft);
  if (chosenErrors.length) throw Error(chosenErrors.join(" "));
  const provenance = { ...target?.fieldProvenance },
    corrections: string[] = [];
  if (target?.missionId) {
    provenance.missionId ??= { source: "Log", at: now };
    provenance.acceptedAt ??= { source: "Log", at: now };
  }
  function tag(
    path: string,
    selected: unknown,
    recognized: unknown,
    stored?: unknown,
    provenancePath = path,
  ) {
    const manual = !same(selected, recognized);
    if (manual) corrections.push(path);
    if (input.choices[path] === "Keep") return;
    const old =
      provenance[provenancePath]?.source ??
      (target?.missionId ? "Log" : target?.source);
    provenance[provenancePath] = {
      source: manual ? "Manual" : "OCR",
      captureId,
      at: now,
      ...(same(selected, stored) && old
        ? { corroboratedBy: [old, manual ? "Manual" : "OCR"] }
        : {}),
    };
  }
  tag("name", name, review.original.name, target?.name);
  tag("company", company, review.original.company, target?.company);
  tag("payout", payout, review.original.payout, target?.payout);
  if (!target?.missionId)
    tag("acceptedAt", acceptedAt, null, target?.acceptedAt);
  const mapped = new Set<string>(),
    events = review.pendingObjectives;
  const rows: CargoObjective[] = chosenDraft.objectives.map((o, i) => {
    const existing = target?.cargoObjectives.find(
        (x) => x.id === o.existingObjectiveId,
      ),
      rowId = existing?.id ?? randomUUID();
    if (existing) mapped.add(existing.id);
    const delivered = o.deliveredSCU!,
      minimum = Math.max(
        existing?.deliveredSCU ?? 0,
        ...events
          .filter((e) => e.id === o.externalObjectiveId)
          .map((e) => e.deliveredSCU),
      );
    if (delivered < minimum)
      throw Error(
        "Delivered progress cannot regress; keep the known value for objective " +
          (i + 1) +
          ".",
      );
    for (const key of [
      "commodity",
      "pickupLocation",
      "destination",
      "quantitySCU",
      "deliveredSCU",
    ] as const)
      tag(
        "objectives." + i + "." + key,
        o[key],
        review.original.objectives[i]?.[key],
        existing?.[key],
        "objectives." + rowId + "." + key,
      );
    return {
      ...existing,
      id: rowId,
      contractId,
      commodity: o.commodity,
      pickupLocation: o.pickupLocation,
      destination: o.destination,
      quantitySCU: o.quantitySCU!,
      deliveredSCU: delivered,
      externalObjectiveId:
        o.externalObjectiveId ?? existing?.externalObjectiveId,
    };
  });
  for (const o of target?.cargoObjectives ?? [])
    if (!mapped.has(o.id) && !ids(input.removeObjectiveIds).includes(o.id))
      rows.push(o);
  const source = review.sourceContract;
  if (
    source?.confirmedEarnings &&
    target?.confirmedEarnings &&
    source.confirmedEarnings !== target.confirmedEarnings
  )
    throw Error(
      "Conflicting confirmed earnings prevent consolidation. Preserve both records for separate review.",
    );
  if (source)
    for (const o of source.cargoObjectives)
      if (
        o.deliveredSCU > 0 &&
        !chosenDraft.objectives.some(
          (r) =>
            r.sourceObjectiveId === o.id && r.deliveredSCU! >= o.deliveredSCU,
        )
      )
        throw Error("Consolidation cannot discard delivered progress.");
  const contract: Contract = {
    ...target,
    id: contractId,
    name,
    company,
    payout,
    acceptedAt,
    status:
      target?.status === "Active" && source?.status !== "Active" && source
        ? source.status
        : (target?.status ?? "Active"),
    completedAt: target?.completedAt ?? source?.completedAt,
    source: target?.source ?? "OCR",
    sources: [
      ...new Set([
        ...(target?.sources ?? (target ? [target.source] : [])),
        ...(source?.sources ?? (source ? [source.source] : [])),
        "OCR" as const,
        ...(corrections.length ? ["Manual" as const] : []),
      ]),
    ],
    dataOrigin: target?.dataOrigin ?? "OCR",
    confirmedEarnings:
      target?.confirmedEarnings || source?.confirmedEarnings || 0,
    cargoObjectives: rows,
    fieldProvenance: provenance,
  };
  const link: EvidenceLink = {
    rawText: review.capture.result?.text,
    observation: review.capture.observation ?? undefined,
    associationType:
      input.action === "Create" ? "UserConfirmedCreate" : "UserConfirmedUpdate",
    captureId,
    contractId,
    attached: true,
    verified: true,
    associatedAt: now,
    source: review.capture.source,
    capturedAt: review.capture.capturedAt,
    title: review.capture.observation!.title.value,
    warnings: review.warnings,
    original: review.original,
    reviewed: chosenDraft,
    corrections,
    conflicts: review.conflicts,
    choices: input.choices,
    missionId: contract.missionId ?? null,
  };
  const contracts = target
    ? state.contracts.map((c) =>
        c.id === target.id
          ? contract
          : c.id === source?.id
            ? { ...c, supersededBy: contract.id }
            : c,
      )
    : [...state.contracts, contract];
  const runIds = [
    ...new Set([
      ...state.currentRun.contractIds.map((id) =>
        id === source?.id ? contract.id : id,
      ),
      ...(contract.status === "Active" ? [contract.id] : []),
    ]),
  ];
  return {
    contracts,
    runIds,
    contract,
    link,
    submissionHash,
    idempotent: false,
    moveFrom: source?.id,
    audit: {
      confirmation: {
        accepted: input.acceptedConfirmed,
        incomplete: input.incompleteConfirmed,
        association: input.associationConfirmed,
        distinct: input.distinctConfirmed,
        consolidation: input.consolidationConfirmed,
        removal: input.objectiveRemovalConfirmed,
        observationHash: input.observationHash,
      },
      before: target ?? null,
      sourceBefore: source ?? null,
      after: contract,
      observation: review.capture.observation,
      reviewed: chosenDraft,
      conflicts: review.conflicts,
      choices: input.choices,
      corrections,
    },
  };
}
export function persistReview(db: CargoDatabase, plan: ReviewPlan) {
  if (plan.idempotent) return;
  if (plan.moveFrom)
    db.db
      .prepare(
        "UPDATE capture_contract_links SET contract_id=? WHERE contract_id=?",
      )
      .run(plan.contract.id, plan.moveFrom);
  db.db
    .prepare(
      "INSERT INTO capture_contract_links(capture_id,contract_id,attached,associated_at,payload) VALUES(?,?,1,?,?) ON CONFLICT(capture_id) DO UPDATE SET contract_id=excluded.contract_id,attached=1,associated_at=excluded.associated_at,payload=excluded.payload",
    )
    .run(
      plan.link.captureId,
      plan.contract.id,
      plan.link.associatedAt,
      JSON.stringify(plan.link),
    );
  db.db
    .prepare(
      "INSERT INTO ocr_review_audit(id,capture_id,contract_id,at,submission_hash,payload) VALUES(?,?,?,?,?,?)",
    )
    .run(
      randomUUID(),
      plan.link.captureId,
      plan.contract.id,
      plan.link.associatedAt,
      plan.submissionHash,
      JSON.stringify(plan.audit),
    );
}
