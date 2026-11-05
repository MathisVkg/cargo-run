import { inventoryActions, canUndoInventory } from "../../src/types/progress";
import { randomUUID, createHash } from "node:crypto";
import type { CargoDatabase } from "./storage/database";
import type { Contract, CargoObjective } from "../../src/types/models";
import {
  cargoValues,
  progressStamp,
  loaded,
  type CargoActivity,
  type ProgressRequest,
} from "../../src/types/progress";
const round = (n: number) => Math.round(n * 1e6) / 1e6;
export function recordedOnboard(cs: Contract[], shipId: string) {
  return cs
    .filter((c) => !c.supersededBy)
    .flatMap((c) => c.cargoObjectives)
    .filter((o) => o.loadedShipId === shipId)
    .reduce((n, o) => n + loaded(o), 0);
}
export function activity(
  db: CargoDatabase,
  contractId: string,
): CargoActivity[] {
  return db.db
    .prepare(
      "SELECT payload FROM cargo_progress_activity WHERE contract_id=? ORDER BY rowid DESC LIMIT 50",
    )
    .all(contractId)
    .map((r) => JSON.parse(String(r.payload)));
}
export function saveActivity(
  db: CargoDatabase,
  c: Contract,
  previous: CargoObjective,
  next: CargoObjective,
  action: string,
  source: "Manual" | "Log",
  id: string = randomUUID(),
  undoOf?: string,
) {
  const a: CargoActivity = {
    id,
    contractId: c.id,
    objectiveId: next.id,
    action,
    source,
    at: new Date().toISOString(),
    previous: cargoValues(previous),
    next: cargoValues(next),
    loadedDelta: round(loaded(next) - loaded(previous)),
    deliveredDelta: round(next.deliveredSCU - previous.deliveredSCU),
    quantityDelta:
      action === "Deliver" || source === "Log"
        ? round(next.deliveredSCU - previous.deliveredSCU)
        : round(loaded(next) - loaded(previous)),
    ...(undoOf ? { undoOf } : {}),
  };
  db.db
    .prepare(
      "INSERT INTO cargo_progress_activity(id,contract_id,objective_id,at,payload) VALUES(?,?,?,?,?)",
    )
    .run(id, c.id, next.id, a.at, JSON.stringify(a));
  return a;
}
export function applyProgress(
  db: CargoDatabase,
  contracts: Contract[],
  selectedShipId: string,
  capacity: number,
  input: unknown,
): Contract[] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Invalid cargo progress request.");
  const r = input as ProgressRequest;
  if (
    Object.keys(r).some(
      (k) => !["requestId", "shipId", "changes"].includes(k),
    ) ||
    typeof r.requestId !== "string" ||
    !/^[a-f0-9-]{36}$/i.test(r.requestId) ||
    typeof r.shipId !== "string" ||
    r.shipId !== selectedShipId ||
    !Array.isArray(r.changes) ||
    !r.changes.length ||
    r.changes.length > 100
  )
    throw Error("Invalid or stale cargo progress request.");
  const hash = createHash("sha256").update(JSON.stringify(r)).digest("hex"),
    prior = db.db
      .prepare("SELECT hash FROM cargo_progress_requests WHERE id=?")
      .get(r.requestId);
  if (prior) {
    if (prior.hash !== hash)
      throw Error("Operation ID was reused with different quantities.");
    return contracts;
  }
  const next = structuredClone(contracts),
    seen = new Set<string>();
  for (const change of r.changes) {
    if (
      !change ||
      Object.keys(change).some(
        (k) =>
          !["objectiveId", "action", "quantity", "expected", "undoId"].includes(
            k,
          ),
      ) ||
      typeof change.objectiveId !== "string" ||
      seen.has(change.objectiveId) ||
      !["Load", "Deliver", "Unload", "SetLoaded", "Undo"].includes(
        change.action,
      ) ||
      typeof change.quantity !== "number" ||
      !Number.isFinite(change.quantity) ||
      change.quantity < 0 ||
      change.quantity > 1e12 ||
      change.quantity !== round(change.quantity) ||
      typeof change.expected !== "string" ||
      change.expected.length > 2000 ||
      (change.undoId !== undefined && typeof change.undoId !== "string")
    )
      throw Error(
        "Invalid cargo allocation. Use non-negative quantities with at most six decimal places.",
      );
    seen.add(change.objectiveId);
    const c = next.find(
        (c) =>
          !c.supersededBy &&
          c.cargoObjectives.some((o) => o.id === change.objectiveId),
      ),
      o = c?.cargoObjectives.find((o) => o.id === change.objectiveId);
    if (!c || !o) throw Error("Cargo objective no longer exists.");
    if (progressStamp(o) !== change.expected)
      throw Error(
        "Cargo progress changed. Review the current quantities before retrying.",
      );
    if (loaded(o) > 0 && o.loadedShipId !== selectedShipId)
      throw Error("Select the ship holding this cargo before updating it.");
    const before = structuredClone(o),
      onboardBefore = recordedOnboard(next, selectedShipId);
    if (change.action === "Undo") {
      const last = db.db
        .prepare(
          "SELECT payload FROM cargo_progress_activity WHERE objective_id=? ORDER BY rowid DESC LIMIT 1",
        )
        .get(o.id);
      const a = last
        ? (JSON.parse(String(last.payload)) as CargoActivity)
        : null;
      if (
        !a ||
        a.id !== change.undoId ||
        a.source !== "Manual" ||
        a.action === "Undo" ||
        JSON.stringify(a.next) !== progressStamp(o)
      )
        throw Error(
          "Only the latest unchanged manual operation can be undone.",
        );
      if (a.previous.loaded > 0 && a.previous.shipId !== selectedShipId)
        throw Error("Select the original ship before undoing this operation.");
      if (!canUndoInventory(c.status, cargoValues(o), a.previous))
        throw Error(
          "Closed cargo cannot restore onboard quantities or change delivery totals through undo.",
        );
      o.loadedSCU = a.previous.loaded;
      o.deliveredSCU = a.previous.delivered;
      o.loadedShipId = a.previous.shipId;
      o.loadEvidence = a.previous.evidence;
    } else {
      if (
        c.status !== "Active" &&
        !inventoryActions(c.status).includes(change.action)
      )
        throw Error(
          "Closed cargo can only be unloaded or corrected downwards.",
        );
      if (change.action === "Load") {
        if (change.quantity <= 0)
          throw Error("Enter a quantity greater than zero.");
        o.loadedSCU = round(loaded(o) + change.quantity);
        o.loadedShipId = selectedShipId;
      }
      if (change.action === "Deliver") {
        if (change.quantity <= 0 || change.quantity > loaded(o))
          throw Error("Delivery cannot exceed recorded onboard cargo.");
        o.loadedSCU = round(loaded(o) - change.quantity);
        o.deliveredSCU = round(o.deliveredSCU + change.quantity);
      }
      if (change.action === "Unload") {
        if (change.quantity <= 0 || change.quantity > loaded(o))
          throw Error("Unload cannot exceed recorded onboard cargo.");
        o.loadedSCU = round(loaded(o) - change.quantity);
      }
      if (change.action === "SetLoaded") {
        if (c.status !== "Active" && change.quantity > loaded(o))
          throw Error("Closed cargo can only be corrected downwards.");
        o.loadedSCU = change.quantity;
        if (change.quantity > 0) o.loadedShipId = selectedShipId;
      }
      o.loadEvidence = "Manual";
    }
    if (
      loaded(o) < 0 ||
      o.deliveredSCU < 0 ||
      loaded(o) + o.deliveredSCU > o.quantitySCU + 1e-8
    )
      throw Error("Loaded plus delivered cannot exceed the required quantity.");
    if (!loaded(o)) o.loadedShipId = null;
    if (
      recordedOnboard(next, selectedShipId) > capacity + 1e-8 &&
      recordedOnboard(next, selectedShipId) > onboardBefore + 1e-8
    )
      throw Error(
        "Selected ship capacity exceeded. Unload or deliver cargo first; quantities were not changed.",
      );
    c.fieldProvenance = {
      ...c.fieldProvenance,
      ["objectives." + o.id + ".loadedSCU"]: {
        source: "Manual",
        at: new Date().toISOString(),
      },
      ...(o.deliveredSCU !== before.deliveredSCU
        ? {
            ["objectives." + o.id + ".deliveredSCU"]: {
              source: "Manual" as const,
              at: new Date().toISOString(),
            },
          }
        : {}),
    };
    saveActivity(
      db,
      c,
      before,
      o,
      change.action,
      "Manual",
      randomUUID(),
      change.undoId,
    );
  }
  db.db
    .prepare("INSERT INTO cargo_progress_requests(id,hash) VALUES(?,?)")
    .run(r.requestId, hash);
  return next;
}
/** Retain physical inventory; verified cumulative delivery consumes only recorded onboard amounts. */
export function reconcileLogProgress(
  db: CargoDatabase,
  before: Contract[],
  after: Contract[],
  eventId: string,
  conflict: (message: string) => void = () => {},
) {
  for (const c of after) {
    const prior = before.find((p) => p.id === c.id);
    for (const o of c.cargoObjectives) {
      const old = prior?.cargoObjectives.find((p) => p.id === o.id);
      if (!old) {
        o.loadedSCU = 0;
        o.loadedShipId = null;
        o.loadEvidence = "Unknown";
        if (o.deliveredSCU > 0)
          saveActivity(
            db,
            c,
            { ...o, deliveredSCU: 0 },
            o,
            "Reconcile delivery",
            "Log",
            "log-progress-" + eventId + "-" + o.id,
          );
        continue;
      }
      if (
        loaded(old) > 0 &&
        (o.commodity !== old.commodity || o.destination !== old.destination)
      ) {
        Object.assign(o, old);
        conflict(
          "Supported notification conflicts with the recorded cargo identity. Existing inventory was preserved; review event evidence.",
        );
        continue;
      }
      const delta = Math.max(0, o.deliveredSCU - old.deliveredSCU);
      o.loadedSCU = round(Math.max(0, loaded(old) - delta));
      o.loadedShipId = o.loadedSCU ? old.loadedShipId : null;
      o.loadEvidence =
        delta > loaded(old) ? "Unknown" : (old.loadEvidence ?? "Unknown");
      if (o.loadedSCU + o.deliveredSCU > o.quantitySCU) {
        Object.assign(o, old);
        conflict(
          "Reported requirement conflicts with recorded inventory. Existing cargo was preserved; review event evidence.",
        );
        continue;
      }
      if (delta > 0)
        saveActivity(
          db,
          c,
          old,
          o,
          "Reconcile delivery",
          "Log",
          "log-progress-" + eventId + "-" + o.id,
        );
    }
  }
}
