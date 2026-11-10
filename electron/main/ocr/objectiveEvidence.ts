import type { CargoDatabase } from "../storage/database";
import type { CaptureRecord } from "../../../src/types/ocr";
import type { MissionEvent } from "../../../src/types/tracking";
import { establishCoverage } from "./coverage";
export const normalized = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export const commodityIdentity = (s: string) =>
  normalized(s).replace(/^aluminium$/, "aluminum");
// Match a full location with its unqualified form, never two different explicit qualifiers.
export function locationIdentity(a: string, b: string) {
  const x = normalized(a),
    y = normalized(b),
    base = (s: string) => s.replace(/ (?:on|above) [a-z][a-z0-9]*$/, "");
  return (
    !!x &&
    !!y &&
    (x === y ||
      (base(x) !== x && base(y) === y && base(x) === y) ||
      (base(y) !== y && base(x) === x && base(y) === x))
  );
}
export function corroborateQuantities(
  db: CargoDatabase,
  capture: CaptureRecord,
): CaptureRecord {
  if (
    !capture.result ||
    !capture.observation ||
    capture.observation.view.value !== "Accepted"
  )
    return capture;
  const original = capture.observation;
  if (
    !original.objectives.some(
      (o) => o.quantityEvidence?.code === "NumericConfidence",
    )
  )
    return capture;
  const at = Date.parse(capture.capturedAt);
  const candidates = db
    .pendingMissions()
    .filter(
      (p) =>
        p.missionId &&
        p.acceptedAt &&
        normalized(p.name) === normalized(original.title.value ?? "") &&
        at >= Date.parse(p.acceptedAt) - 2000 &&
        at - Date.parse(p.acceptedAt) <= 600000 &&
        (p.status === "Active" ||
          (!!p.completedAt && at <= Date.parse(p.completedAt))) &&
        !(db.getSetting<string[]>("tracking.archivedMissions") ?? []).includes(
          p.missionId,
        ),
    );
  const proofs = candidates.flatMap((p) => {
    const events = db.db
      .prepare(
        "SELECT payload FROM mission_events WHERE mission_id=? AND kind='Objective'",
      )
      .all(p.missionId!)
      .map((r) => JSON.parse(String(r.payload)) as MissionEvent);
    const used = new Set<string>(),
      ids: string[] = [];
    for (const o of original.objectives) {
      if (
        [o.commodity, o.pickup, o.destination].some(
          (f) => f.state !== "Recognized" || !f.value,
        )
      )
        return [];
      const matches = p.cargoObjectives.filter(
        (r) =>
          commodityIdentity(r.commodity) ===
            commodityIdentity(o.commodity.value!) &&
          r.quantitySCU === o.requiredSCU.value &&
          locationIdentity(r.destination, o.destination.value!) &&
          (!r.pickupLocation ||
            locationIdentity(r.pickupLocation, o.pickup.value!)),
      );
      if (matches.length !== 1 || used.has(matches[0].id)) return [];
      used.add(matches[0].id);
      const e = events.filter(
        (e) =>
          e.quantitySCU === o.requiredSCU.value &&
          e.deliveredSCU === o.deliveredSCU.value &&
          !!e.timestamp &&
          Date.parse(e.timestamp) <= at + 2000 &&
          commodityIdentity(e.commodity ?? "") ===
            commodityIdentity(o.commodity.value!) &&
          locationIdentity(e.destination ?? "", o.destination.value!),
      );
      if (!e.length) return [];
      ids.push(...e.map((e) => e.id));
    }
    return p.cargoObjectives.length === original.objectives.length
      ? [{ missionId: p.missionId!, ids }]
      : [];
  });
  if (proofs.length !== 1) return capture;
  const o = structuredClone(original);
  for (const row of o.objectives)
    if (row.quantityEvidence?.code === "NumericConfidence") {
      row.requiredSCU.state = "Recognized";
      row.deliveredSCU.state = "Recognized";
      row.quantityEvidence = {
        source: "Log objective",
        code: "Validated",
        reason:
          "A separately recorded mission objective agrees on commodity, requirement and full/unqualified destination.",
        evidenceIds: proofs[0].ids,
      };
    }
  o.coverage = establishCoverage(capture.result, o);
  if (o.coverage.state !== "Established") return capture;
  o.warnings = o.warnings.filter(
    (w) => !w.startsWith("A delivery quantity is uncertain"),
  );
  return {
    ...capture,
    observation: o,
    originalRecognition: capture.originalRecognition ?? {
      result: capture.result,
      observation: original,
    },
  };
}
