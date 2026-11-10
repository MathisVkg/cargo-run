import { locationIdentity, commodityIdentity } from "./ocr/objectiveEvidence";
import { createHash } from "node:crypto";
import type { CargoDatabase } from "./storage/database";
import type { Contract } from "../../src/types/models";
import type { MissionEvent, LogSource } from "../../src/types/tracking";
import type {
  LifecycleIssue,
  LifecycleActivity,
} from "../../src/types/lifecycle";
import { applyMissionEvent } from "./log/reconcile";
const version = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const terminal = (e: MissionEvent) =>
  e.kind === "Completed" || e.kind === "Abandoned";
export function retainLifecycleEvidence(
  db: CargoDatabase,
  id: string,
  kind: string,
  raw: string,
  source: LogSource,
  event?: MissionEvent,
  extra?: unknown,
) {
  const result = db.db
    .prepare(
      "INSERT OR IGNORE INTO lifecycle_evidence(id,mission_id,kind,payload) VALUES(?,?,?,?)",
    )
    .run(
      version([id, raw]),
      event?.missionId ?? null,
      kind,
      JSON.stringify({ event, extra, raw: raw.slice(0, 16384), source }),
    );
  db.db.exec(
    "DELETE FROM lifecycle_evidence WHERE id NOT IN (SELECT id FROM lifecycle_evidence ORDER BY rowid DESC LIMIT 200)",
  );
  return Number(result.changes) > 0;
}
export function retainReward(
  db: CargoDatabase,
  reward: {
    id: string;
    timestamp: string | null;
    receivedAt: string;
    amount: number;
  },
  raw: string,
  source: LogSource,
) {
  const result = db.db
    .prepare(
      "INSERT OR IGNORE INTO unattributed_rewards(id,payload) VALUES(?,?)",
    )
    .run(
      reward.id,
      JSON.stringify({
        ...reward,
        raw: raw.slice(0, 16384),
        source,
        attribution: "Unverified",
      }),
    );
  retainLifecycleEvidence(
    db,
    reward.id,
    "Reward",
    raw,
    source,
    undefined,
    reward,
  );
  return Number(result.changes) > 0;
}
export function terminalEvents(db: CargoDatabase): MissionEvent[] {
  return db.db
    .prepare(
      "SELECT payload FROM (SELECT rowid,payload FROM mission_events WHERE kind IN ('Completed','Abandoned') ORDER BY rowid DESC LIMIT 200) ORDER BY rowid",
    )
    .all()
    .map((r) => JSON.parse(String(r.payload)));
}
function objectiveAgreement(c: Contract, p: Contract, ids = false) {
  if (
    !c.cargoObjectives.length ||
    c.cargoObjectives.length !== p.cargoObjectives.length
  )
    return false;
  const matched = new Set<string>();
  return c.cargoObjectives.every((o) => {
    const rows = p.cargoObjectives.filter(
      (r) =>
        commodityIdentity(r.commodity) === commodityIdentity(o.commodity) &&
        locationIdentity(r.destination, o.destination) &&
        r.quantitySCU === o.quantitySCU &&
        (!r.pickupLocation ||
          !o.pickupLocation ||
          locationIdentity(r.pickupLocation, o.pickupLocation)) &&
        (!ids ||
          (!!o.externalObjectiveId &&
            !o.externalObjectiveId.startsWith("fallback-") &&
            o.externalObjectiveId === r.externalObjectiveId)),
    );
    if (rows.length !== 1 || matched.has(rows[0].id)) return false;
    matched.add(rows[0].id);
    return true;
  });
}
export function lifecycleCandidates(
  db: CargoDatabase,
  cs: Contract[],
  e: MissionEvent,
) {
  const p = db.pendingMissions().find((p) => p.missionId === e.missionId);
  return cs
    .filter(
      (c) =>
        c.status === "Active" &&
        !c.supersededBy &&
        !c.missionId &&
        c.dataOrigin !== "Sample" &&
        ((e.title && norm(c.name) === norm(e.title)) ||
          (p && norm(c.name) === norm(p.name)) ||
          (p && objectiveAgreement(c, p))),
    )
    .map((c) => ({
      contract: c,
      reason:
        p && objectiveAgreement(c, p, true)
          ? "Objective identifiers agree; mission allocation needs confirmation"
          : p && objectiveAgreement(c, p)
            ? "Matching cargo details; mission identity needs your confirmation"
            : "Title agrees, but cargo/mission identity is unverified",
    }));
}
export function lifecycleIssues(
  db: CargoDatabase,
  cs: Contract[],
): LifecycleIssue[] {
  const dismissed = new Set(
      db.getSetting<string[]>("lifecycle.dismissed") ?? [],
    ),
    archived = new Set(
      db.getSetting<string[]>("tracking.archivedMissions") ?? [],
    ),
    seen = new Set<string>(),
    issues: LifecycleIssue[] = [];
  for (const e of terminalEvents(db)) {
    if (
      !terminal(e) ||
      seen.has(e.missionId) ||
      dismissed.has(e.missionId) ||
      archived.has(e.missionId) ||
      cs.some((c) => c.missionId === e.missionId)
    )
      continue;
    seen.add(e.missionId);
    const candidates = lifecycleCandidates(db, cs, e).slice(0, 10);
    if (!candidates.length) continue;
    issues.push({
      missionId: e.missionId,
      eventId: e.id,
      kind: e.kind as "Completed" | "Abandoned",
      eventAt: e.timestamp,
      title:
        e.title ??
        db.pendingMissions().find((p) => p.missionId === e.missionId)?.name ??
        "Mission lifecycle event",
      candidates: candidates.map(({ contract: c, reason }) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        required: c.cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0),
        onboard: c.cargoObjectives.reduce((n, o) => n + (o.loadedSCU ?? 0), 0),
        reason,
        automaticReason:
          c.associationDiagnostics?.decision === "Pending"
            ? c.associationDiagnostics.reason
            : "No verified MissionId relationship or uniquely matching complete objective identifiers were established.",
        identityEvidence: (() => {
          const rows = db.db
            .prepare(
              "SELECT payload FROM mission_identity_evidence WHERE mission_id=?",
            )
            .all(e.missionId)
            .map(
              (r) =>
                JSON.parse(
                  String(r.payload),
                ) as import("../../src/types/association").MissionIdentityEvidence,
            );
          const markers = rows.filter((r) => r.kind === "Marker");
          const states = rows.filter((r) => r.kind === "ObjectiveState");
          return (
            markers.length +
            " marker(s), " +
            states.length +
            " objective state event(s)" +
            (markers[0]?.template ? "; template " + markers[0].template : "") +
            ". These identify the log mission; they do not independently identify an OCR contract."
          );
        })(),
      })),
      version: version([e, candidates.map((c) => c.contract)]),
    });
    if (issues.length >= 20) break;
  }
  return issues;
}
export function lifecycleHistory(
  db: CargoDatabase,
  id: string,
): LifecycleActivity[] {
  return db.db
    .prepare(
      "SELECT payload FROM lifecycle_activity WHERE contract_id=? ORDER BY rowid DESC LIMIT 50",
    )
    .all(id)
    .map((r) => JSON.parse(String(r.payload)));
}
export function recordLifecycleTransition(
  db: CargoDatabase,
  before: Contract[],
  after: Contract[],
  e: MissionEvent,
) {
  if (!terminal(e)) return;
  for (const c of after) {
    const old = before.find((p) => p.id === c.id);
    if (
      !old ||
      c.missionId !== e.missionId ||
      !c.lifecycle ||
      c.lifecycle.eventId !== e.id ||
      (old.status === c.status &&
        !!old.lifecycle &&
        !(old.lifecycle.eventAt === null && e.timestamp))
    )
      continue;
    const existing = db.db
      .prepare("SELECT payload FROM lifecycle_activity WHERE id=?")
      .get(e.id + ":" + c.id);
    const original = existing
      ? (JSON.parse(String(existing.payload)) as LifecycleActivity)
      : null;
    const a: LifecycleActivity = {
      id: e.id + ":" + c.id,
      contractId: c.id,
      missionId: e.missionId,
      action: e.kind,
      at: e.timestamp,
      receivedAt: original?.receivedAt ?? e.receivedAt,
      eventId: e.id,
      previousStatus: original?.previousStatus ?? old.status,
      newStatus: c.status,
    };
    db.db
      .prepare(
        "INSERT INTO lifecycle_activity(id,contract_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(a.id, c.id, JSON.stringify(a));
  }
}
function associate(
  db: CargoDatabase,
  cs: Contract[],
  id: string,
  e: MissionEvent,
  source: "ObjectiveIds" | "User confirmed",
) {
  const c = cs.find((c) => c.id === id)!;
  const next = {
    ...c,
    missionId: e.missionId,
    sources: [...new Set([...(c.sources ?? [c.source]), "Log" as const])],
    missionAssociation: { source, at: new Date().toISOString(), eventId: e.id },
    associationDiagnostics: {
      decision: "Verified" as const,
      reason:
        source === "User confirmed"
          ? "Explicitly confirmed by the user."
          : "Unique objective identifiers and cargo evidence agree.",
      candidateMissionIds: [e.missionId],
    },
  };
  const linked = cs.map((c) => (c.id === id ? next : c)),
    after = applyMissionEvent(linked, e).contracts;
  recordLifecycleTransition(db, linked, after, e);
  db.resolve(e.id);
  for (const row of db.db
    .prepare(
      "SELECT capture_id,payload FROM capture_contract_links WHERE contract_id=?",
    )
    .all(id)) {
    const p = JSON.parse(String(row.payload));
    db.db
      .prepare("UPDATE capture_contract_links SET payload=? WHERE capture_id=?")
      .run(
        JSON.stringify({ ...p, missionId: e.missionId }),
        row.capture_id as string,
      );
  }
  return after;
}
export function reconcileTerminalIdentities(
  db: CargoDatabase,
  cs: Contract[],
  allowed: (event: MissionEvent) => boolean = () => true,
): Contract[] {
  let next = cs;
  for (const e of terminalEvents(db)) {
    if (!allowed(e)) continue;
    if (
      (db.getSetting<string[]>("tracking.archivedMissions") ?? []).includes(
        e.missionId,
      )
    )
      continue;
    const bound = next.find(
      (c) => c.missionId === e.missionId && !c.supersededBy,
    );
    if (bound) {
      const after = applyMissionEvent(next, e).contracts;
      recordLifecycleTransition(db, next, after, e);
      next = after;
      db.resolve(e.id);
      continue;
    }
    if (next.some((c) => c.missionId === e.missionId)) continue;
    const p = db.pendingMissions().find((p) => p.missionId === e.missionId);
    if (!p) continue;
    const matches = lifecycleCandidates(db, next, e).filter((c) =>
      objectiveAgreement(c.contract, p, true),
    );
    if (matches.length !== 1) continue;
    const c = matches[0].contract;
    if (
      db
        .pendingMissions()
        .filter(
          (other) =>
            other.missionId !== e.missionId &&
            objectiveAgreement(c, other, true),
        ).length ||
      cs.some(
        (other) =>
          other.id !== c.id &&
          other.missionId &&
          other.missionId !== e.missionId &&
          objectiveAgreement(c, other, true),
      )
    )
      continue;
    next = associate(db, next, c.id, e, "ObjectiveIds");
  }
  return next;
}
export function resolveLifecycle(
  db: CargoDatabase,
  cs: Contract[],
  input: unknown,
): Contract[] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid lifecycle resolution.");
  const r = input as {
    missionId: string;
    contractId?: string;
    version: string;
    confirmed?: boolean;
    dismiss?: boolean;
  };
  if (
    Object.keys(r).some(
      (k) =>
        ![
          "missionId",
          "contractId",
          "version",
          "confirmed",
          "dismiss",
        ].includes(k),
    ) ||
    typeof r.missionId !== "string" ||
    typeof r.version !== "string" ||
    (r.dismiss !== undefined && typeof r.dismiss !== "boolean") ||
    (r.confirmed !== undefined && typeof r.confirmed !== "boolean")
  )
    throw Error("Invalid lifecycle resolution.");
  const issue = lifecycleIssues(db, cs).find(
    (i) => i.missionId === r.missionId,
  );
  if (!issue || issue.version !== r.version)
    throw Error(
      "Mission or contract evidence changed. Review this issue again.",
    );
  if (r.dismiss) {
    if (r.contractId !== undefined) throw Error("Invalid dismissal.");
    db.setSetting(
      "lifecycle.dismissed",
      [
        ...new Set([
          ...(db.getSetting<string[]>("lifecycle.dismissed") ?? []),
          r.missionId,
        ]),
      ].slice(-200),
    );
    return cs;
  }
  if (
    r.confirmed !== true ||
    typeof r.contractId !== "string" ||
    !issue.candidates.some((c) => c.id === r.contractId)
  )
    throw Error(
      "Confirm the in-game mission identity before applying its lifecycle.",
    );
  const event = terminalEvents(db).find((e) => e.id === issue.eventId)!;
  return associate(db, cs, r.contractId, event, "User confirmed");
}
