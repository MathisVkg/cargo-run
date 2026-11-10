import type { CargoObjective, Contract } from "./models";
export interface ObjectiveChecklist {
  pickedUp: boolean;
  delivered: boolean;
  pickupRevision: string;
  deliveryRevision: string;
  deliverySource: "Player" | "Recorded";
}
export const checklist = (o: CargoObjective): ObjectiveChecklist =>
  o.checklist ?? {
    pickedUp: false,
    delivered: false,
    pickupRevision: "",
    deliveryRevision: "",
    deliverySource: "Player",
  };
export const checklistStamp = (o: CargoObjective) =>
  JSON.stringify(checklist(o));
export const checklistProgress = (c: Contract) => ({
  done: c.cargoObjectives.filter((o) => checklist(o).delivered).length,
  total: c.cargoObjectives.length,
});
export interface ChecklistRequest {
  requestId: string;
  changes: {
    objectiveId: string;
    kind: "pickup" | "delivery";
    done: boolean;
    expected: string;
  }[];
}
export interface WorkflowPreferences {
  automaticCompletion: boolean;
}
export interface FinishRunRequest {
  confirmed: true;
  runId: string;
  expectedRevision: number;
  completeIds: string[];
}
