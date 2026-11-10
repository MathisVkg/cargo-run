import { randomUUID, createHash } from "node:crypto";
import type { CargoDatabase } from "./storage/database";
import type { Contract } from "../../src/types/models";
import {
  checklist,
  checklistStamp,
  type ChecklistRequest,
} from "../../src/types/workflow";
export function applyChecklist(
  db: CargoDatabase,
  contracts: Contract[],
  input: unknown,
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid checklist request.");
  const r = input as ChecklistRequest;
  if (
    Object.keys(r).some((k) => !["requestId", "changes"].includes(k)) ||
    typeof r.requestId !== "string" ||
    !/^[-a-f0-9]{36}$/i.test(r.requestId) ||
    !Array.isArray(r.changes) ||
    !r.changes.length ||
    r.changes.length > 1000
  )
    throw Error("Invalid checklist request.");
  const hash = createHash("sha256").update(JSON.stringify(r)).digest("hex");
  const previous = db.db
    .prepare("SELECT hash FROM checklist_requests WHERE id=?")
    .get(r.requestId);
  if (previous) {
    if (previous.hash !== hash) throw Error("Checklist operation ID reused.");
    return contracts;
  }
  const next = structuredClone(contracts),
    seen = new Set<string>();
  for (const change of r.changes) {
    if (
      !change ||
      Object.keys(change).some(
        (k) => !["objectiveId", "kind", "done", "expected"].includes(k),
      ) ||
      typeof change.objectiveId !== "string" ||
      seen.has(change.objectiveId) ||
      !["pickup", "delivery"].includes(change.kind) ||
      typeof change.done !== "boolean" ||
      typeof change.expected !== "string" ||
      change.expected.length > 2000
    )
      throw Error("Invalid checklist change.");
    seen.add(change.objectiveId);
    const c = next.find(
        (c) =>
          !c.supersededBy &&
          c.status === "Active" &&
          c.cargoObjectives.some((o) => o.id === change.objectiveId),
      ),
      o = c?.cargoObjectives.find((o) => o.id === change.objectiveId);
    if (!c || !o) throw Error("Active objective no longer exists.");
    if (checklistStamp(o) !== change.expected)
      throw Error("Checklist changed. Review the current entry and retry.");
    const before = checklist(o),
      after = { ...before };
    if (change.kind === "pickup") {
      after.pickedUp = change.done;
      after.pickupRevision = randomUUID();
    } else {
      after.delivered = change.done;
      after.deliveryRevision = randomUUID();
      after.deliverySource = "Player";
    }
    o.checklist = after;
    db.db
      .prepare(
        "INSERT INTO objective_checklist_activity(id,contract_id,objective_id,payload) VALUES(?,?,?,?)",
      )
      .run(
        randomUUID(),
        c.id,
        o.id,
        JSON.stringify({
          at: new Date().toISOString(),
          kind: change.kind,
          before,
          after,
          source: "Player",
        }),
      );
  }
  db.db
    .prepare("INSERT INTO checklist_requests(id,hash) VALUES(?,?)")
    .run(r.requestId, hash);
  return next;
}
