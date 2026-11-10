import type { CargoDatabase } from "./storage/database";
import type { MissionEvent, LogSource } from "../../src/types/tracking";
export interface AutomationState {
  automaticCompletion: boolean;
  since: string | null;
  afterRow: number;
  eligibleIds: string[];
}
export function workflow(db: CargoDatabase): AutomationState {
  const raw = db.getSetting<Partial<AutomationState>>("workflow.automation");
  const validSince =
    typeof raw?.since === "string" && Number.isFinite(Date.parse(raw.since));
  return {
    automaticCompletion: raw?.automaticCompletion === true && validSince,
    since: validSince ? raw!.since! : null,
    afterRow:
      Number.isSafeInteger(raw?.afterRow) && raw!.afterRow! >= 0
        ? raw!.afterRow!
        : 0,
    eligibleIds: Array.isArray(raw?.eligibleIds)
      ? raw.eligibleIds
          .filter(
            (id): id is string => typeof id === "string" && id.length <= 256,
          )
          .slice(-200)
      : [],
  };
}
export function observeTerminal(
  db: CargoDatabase,
  e: MissionEvent,
  source: LogSource,
) {
  const state = workflow(db);
  if (
    !state.automaticCompletion ||
    !state.since ||
    !["Completed", "Abandoned"].includes(e.kind)
  )
    return;
  const row = db.db
    .prepare("SELECT rowid AS n FROM mission_events WHERE id=?")
    .get(e.id);
  const at = e.timestamp ?? (source.mode === "Live" ? e.receivedAt : null);
  if (
    !row ||
    Number(row.n) <= state.afterRow ||
    !at ||
    Date.parse(at) < Date.parse(state.since)
  )
    return;
  db.setSetting("workflow.automation", {
    ...state,
    eligibleIds: [...new Set([...state.eligibleIds, e.id])].slice(-200),
  });
}
export function automaticEvent(db: CargoDatabase, e: MissionEvent) {
  const state = workflow(db);
  if (!state.automaticCompletion || !state.eligibleIds.includes(e.id))
    return false;
  const row = db.db
    .prepare("SELECT rowid AS n FROM mission_events WHERE id=?")
    .get(e.id);
  return !!row && Number(row.n) > state.afterRow;
}
export function setAutomation(db: CargoDatabase, enabled: boolean) {
  const prior = workflow(db);
  if (prior.automaticCompletion === enabled) return;
  db.setSetting("workflow.automation", {
    ...prior,
    automaticCompletion: enabled,
    since: enabled ? new Date().toISOString() : null,
    afterRow: Number(
      db.db
        .prepare("SELECT COALESCE(MAX(rowid),0) AS n FROM mission_events")
        .get()!.n,
    ),
  });
}
