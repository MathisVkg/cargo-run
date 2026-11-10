import { locationIdentity, commodityIdentity } from "./ocr/objectiveEvidence";
import type { CargoDatabase } from "./storage/database";
import type { Contract } from "../../src/types/models";
import type { ContractObservation } from "../../src/types/ocr";
import type { MissionIdentityEvidence } from "../../src/types/association";
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
type Proof = {
  source: "ObjectiveIds" | "Objective details" | "Acceptance context";
  ids: string[];
  reason: string;
};
function exactRows(a: Contract, b: Contract, ids = false) {
  const used = new Set<string>();
  return (
    a.cargoObjectives.length > 0 &&
    a.cargoObjectives.length === b.cargoObjectives.length &&
    a.cargoObjectives.every((o) => {
      const matches = b.cargoObjectives.filter(
        (r) =>
          commodityIdentity(o.commodity) === commodityIdentity(r.commodity) &&
          locationIdentity(o.destination, r.destination) &&
          o.quantitySCU === r.quantitySCU &&
          (!o.pickupLocation ||
            !r.pickupLocation ||
            locationIdentity(o.pickupLocation, r.pickupLocation)) &&
          (!ids ||
            (!!o.externalObjectiveId &&
              !o.externalObjectiveId.startsWith("fallback-") &&
              o.externalObjectiveId === r.externalObjectiveId)),
      );
      if (matches.length !== 1 || used.has(matches[0].id)) return false;
      used.add(matches[0].id);
      return true;
    })
  );
}
function markerPair(rows: MissionIdentityEvidence[], missionId: string) {
  const markers = rows.filter(
    (r) =>
      r.missionId === missionId &&
      r.kind === "Marker" &&
      /^(?:pickup|dropoff)_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_\d+$/i.test(
        r.objectiveId,
      ) &&
      r.template?.startsWith("HaulCargo_AToB_"),
  );
  const pickup = markers.filter((r) => r.objectiveId.startsWith("pickup_")),
    delivery = markers.filter((r) => r.objectiveId.startsWith("dropoff_"));
  return pickup.length === 1 &&
    delivery.length === 1 &&
    pickup[0].objectiveId.slice(7) === delivery[0].objectiveId.slice(8) &&
    pickup[0].template === delivery[0].template &&
    pickup[0].definitionId === delivery[0].definitionId
    ? [pickup[0], delivery[0]]
    : null;
}
const commodityKey = (s: string) =>
  norm(s)
    .replaceAll(" ", "")
    .replace(/^aluminium$/, "aluminum");
function templateCommodity(
  pair: MissionIdentityEvidence[] | null,
  c: Contract,
) {
  return (
    !!pair &&
    c.cargoObjectives.length === 1 &&
    !!c.cargoObjectives[0].commodity &&
    pair[0]
      .template!.split("_")
      .some(
        (t) => commodityKey(t) === commodityKey(c.cargoObjectives[0].commodity),
      )
  );
}
function alive(p: Contract, at: number) {
  const start = p.acceptedAt ? Date.parse(p.acceptedAt) : NaN;
  if (!Number.isFinite(start) || at < start - 2000) return false;
  if (
    p.status !== "Active" &&
    (!p.completedAt ||
      !Number.isFinite(Date.parse(p.completedAt)) ||
      Date.parse(p.completedAt) < at)
  )
    return false;
  return true;
}
export function reconcileAcceptedMissions(
  db: CargoDatabase,
  contracts: Contract[],
): Contract[] {
  const pending = db.pendingMissions(),
    archived = new Set(
      db.getSetting<string[]>("tracking.archivedMissions") ?? [],
    );
  const rows = db.db
    .prepare("SELECT id,payload FROM mission_identity_evidence")
    .all()
    .map((r) => JSON.parse(String(r.payload)) as MissionIdentityEvidence);
  const candidates = contracts.filter(
    (c) =>
      c.status === "Active" &&
      !c.supersededBy &&
      !c.missionId &&
      (c.source === "OCR" || c.sources?.includes("OCR")),
  );
  const matrix = new Map<string, { p: Contract; proof: Proof }[]>(),
    diagnostics = new Map<string, string>();
  const captures = new Map<
    string,
    { at: number; observation: ContractObservation }[]
  >();
  for (const c of candidates) {
    const saved = db.db
      .prepare(
        "SELECT payload FROM capture_contract_links WHERE contract_id=? AND attached=1",
      )
      .all(c.id)
      .map((r) => JSON.parse(String(r.payload)))
      .filter(
        (r) =>
          r.observation?.view.value === "Accepted" &&
          r.observation?.title.value &&
          norm(r.observation.title.value) === norm(c.name) &&
          Number.isFinite(Date.parse(r.capturedAt)),
      )
      .map((r) => ({
        at: Date.parse(r.capturedAt),
        observation: r.observation as ContractObservation,
      }));
    captures.set(c.id, saved);
    const matches: { p: Contract; proof: Proof }[] = [];
    for (const p of pending) {
      if (
        !p.missionId ||
        archived.has(p.missionId) ||
        contracts.some((c) => c.missionId === p.missionId) ||
        norm(p.name) !== norm(c.name)
      )
        continue;
      const accepted = db.db
        .prepare(
          "SELECT id FROM mission_events WHERE mission_id=? AND kind='Accepted'",
        )
        .get(p.missionId);
      if (!accepted) continue;
      for (const capture of saved) {
        if (
          !alive(p, capture.at) ||
          capture.at - Date.parse(p.acceptedAt!) > 600000
        ) {
          diagnostics.set(
            c.id,
            "Accepted OCR was outside the supported acceptance window or mission lifetime.",
          );
          continue;
        }
        const evidenceIds = [
          String(accepted.id),
          ...db.db
            .prepare(
              "SELECT id FROM mission_events WHERE mission_id=? AND kind='Objective' LIMIT 100",
            )
            .all(p.missionId)
            .map((r) => String(r.id)),
        ];
        let proof: Proof | null = null;
        if (exactRows(c, p, true))
          proof = {
            source: "ObjectiveIds",
            ids: evidenceIds,
            reason:
              "Unique one-to-one objective identifiers and cargo details agree.",
          };
        else if (
          capture.at - Date.parse(p.acceptedAt!) <= 600000 &&
          exactRows(c, p)
        )
          proof = {
            source: "Objective details",
            ids: evidenceIds,
            reason:
              "Unique complete objective details and normalized acceptance title agree.",
          };
        else {
          const pair = markerPair(rows, p.missionId),
            o = capture.observation;
          const age = capture.at - Date.parse(p.acceptedAt!);
          if (
            age <= 120000 &&
            templateCommodity(pair, c) &&
            o.coverage?.state === "Established" &&
            o.objectives.length === 1 &&
            o.objectives[0].commodity.state === "Recognized" &&
            norm(o.objectives[0].commodity.value ?? "") ===
              norm(c.cargoObjectives[0].commodity) &&
            o.objectives[0].requiredSCU.state === "Recognized" &&
            o.objectives[0].requiredSCU.value ===
              c.cargoObjectives[0].quantitySCU &&
            o.objectives[0].pickup.state === "Recognized" &&
            norm(o.objectives[0].pickup.value ?? "") ===
              norm(c.cargoObjectives[0].pickupLocation) &&
            o.objectives[0].destination.state === "Recognized" &&
            norm(o.objectives[0].destination.value ?? "") ===
              norm(c.cargoObjectives[0].destination)
          ) {
            proof = {
              source: "Acceptance context",
              ids: [...evidenceIds, ...pair!.map((r) => r.id)],
              reason:
                "Accepted capture within two minutes; paired pickup/dropoff markers and exact template commodity corroborate one mission.",
            };
          }
        }
        if (!proof) {
          const pair = markerPair(rows, p.missionId);
          diagnostics.set(
            c.id,
            !pair
              ? "No complete, consistent pickup/dropoff marker pair or matching objective identifiers/details were recorded."
              : !templateCommodity(pair, c)
                ? "The marker template does not corroborate this contract's single commodity."
                : capture.at - Date.parse(p.acceptedAt!) > 120000
                  ? "Accepted capture is outside the two-minute marker-context window; no matching objective identifiers/details verify it."
                  : "Accepted OCR coverage or objective fields are incomplete or disagree with the saved contract.",
          );
          continue;
        }
        const competing = pending.some(
          (other) =>
            other.missionId !== p.missionId &&
            !archived.has(other.missionId!) &&
            norm(other.name) === norm(c.name) &&
            alive(other, capture.at) &&
            // Known incompatible quantities/destinations contradict a context match.
            (proof!.source !== "Acceptance context" ||
              !other.cargoObjectives.length ||
              exactRows(c, other)) &&
            // Unknown historical titles cannot own this bounded acceptance context.
            // Complete matching objective evidence remains a competitor regardless of age.
            (!!other.cargoObjectives.length ||
              (other.acceptedAt &&
                capture.at - Date.parse(other.acceptedAt) <= 600000)) &&
            (proof!.source === "ObjectiveIds"
              ? exactRows(c, other, true)
              : proof!.source === "Objective details"
                ? !other.cargoObjectives.length || exactRows(c, other)
                : !markerPair(rows, other.missionId!) ||
                  templateCommodity(markerPair(rows, other.missionId!), c)),
        );
        if (competing) {
          diagnostics.set(
            c.id,
            "Multiple same-title missions remain plausible; title/timing are not sufficient.",
          );
          continue;
        }
        matches.push({ p, proof });
        break;
      }
    }
    matrix.set(c.id, matches);
  }
  let next = contracts;
  for (const c of candidates) {
    const choices = matrix.get(c.id) ?? [],
      selected = choices.length === 1 ? choices[0] : null;
    const competingContract =
      selected &&
      contracts.some(
        (other) =>
          other.id !== c.id &&
          other.status === "Active" &&
          !other.supersededBy &&
          !other.missionId &&
          (matrix
            .get(other.id)
            ?.some((m) => m.p.missionId === selected.p.missionId) ||
            (norm(other.name) === norm(c.name) && exactRows(c, other))),
      );
    if (
      !selected ||
      competingContract ||
      next.some((other) => other.missionId === selected.p.missionId)
    ) {
      if (
        !pending.some((p) => norm(p.name) === norm(c.name)) ||
        !captures.get(c.id)?.length
      )
        continue;
      const diagnostic = {
        decision: "Pending" as const,
        reason:
          choices.length > 1 || competingContract
            ? "More than one contract or mission can own this evidence."
            : (diagnostics.get(c.id) ??
              "Acceptance identity lacks unique corroborating evidence."),
        candidateMissionIds: pending
          .filter((p) => norm(p.name) === norm(c.name))
          .map((p) => p.missionId!)
          .slice(0, 20),
      };
      next = next.map((x) =>
        x.id === c.id ? { ...x, associationDiagnostics: diagnostic } : x,
      );
      continue;
    }
    const at = new Date().toISOString(),
      m = selected.p.missionId!;
    next = next.map((x) =>
      x.id === c.id
        ? {
            ...x,
            missionId: m,
            acceptedAt: x.acceptedAt ?? selected.p.acceptedAt,
            missionAssociation: {
              source: selected.proof.source,
              at,
              eventId: selected.proof.ids[0],
              evidenceIds: selected.proof.ids,
            },
            associationDiagnostics: {
              decision: "Verified" as const,
              reason: selected.proof.reason,
              candidateMissionIds: [m],
            },
            sources: [
              ...new Set([...(x.sources ?? [x.source]), "Log" as const]),
            ],
          }
        : x,
    );
    for (const link of db.db
      .prepare(
        "SELECT capture_id,payload FROM capture_contract_links WHERE contract_id=?",
      )
      .all(c.id))
      db.db
        .prepare(
          "UPDATE capture_contract_links SET payload=? WHERE capture_id=?",
        )
        .run(
          JSON.stringify({ ...JSON.parse(String(link.payload)), missionId: m }),
          link.capture_id as string,
        );
  }
  return next;
}
