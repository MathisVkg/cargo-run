import type { CargoObjective } from "./models";
export interface CargoStateValues {
  required: number;
  loaded: number;
  delivered: number;
  shipId: string | null;
  evidence: "Manual" | "Unknown";
}
export const cargoValues = (o: CargoObjective): CargoStateValues => ({
  required: o.quantitySCU,
  loaded: o.loadedSCU ?? 0,
  delivered: o.deliveredSCU,
  shipId: o.loadedShipId ?? null,
  evidence: o.loadEvidence ?? "Unknown",
});
export const progressStamp = (o: CargoObjective) =>
  JSON.stringify(cargoValues(o));
export const loaded = (o: CargoObjective) => o.loadedSCU ?? 0;
export const awaitingPickup = (o: CargoObjective) =>
  Math.max(0, o.quantitySCU - loaded(o) - o.deliveredSCU);
export interface ProgressChange {
  objectiveId: string;
  action: "Load" | "Deliver" | "Unload" | "SetLoaded" | "Undo";
  quantity: number;
  expected: string;
  undoId?: string;
}
export interface ProgressRequest {
  requestId: string;
  shipId: string;
  changes: ProgressChange[];
}
export interface CargoActivity {
  id: string;
  objectiveId: string;
  contractId: string;
  action: string;
  quantityDelta: number;
  loadedDelta: number;
  deliveredDelta: number;
  source: "Manual" | "Log";
  at: string;
  previous: CargoStateValues;
  next: CargoStateValues;
  undoOf?: string;
}
