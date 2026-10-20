export type ContractStatus = "Active" | "Completed" | "Abandoned";
export type ContractSource = "Log" | "OCR" | "Manual";
export type DataOrigin = "Sample" | "Manual" | "Log";
export type Page = "Dashboard" | "Manifest" | "History" | "Settings";
export interface Ship {
  id: string;
  name: string;
  manufacturer: string;
  cargoCapacitySCU: number;
}
export interface CargoObjective {
  id: string;
  contractId: string;
  commodity: string;
  pickupLocation: string;
  destination: string;
  quantitySCU: number;
  deliveredSCU: number;
  externalObjectiveId?: string;
  lastLogEventAt?: string;
}
export interface Contract {
  id: string;
  missionId?: string;
  name: string;
  status: ContractStatus;
  source: ContractSource;
  payout: number | null;
  confirmedEarnings: number;
  acceptedAt: string;
  completedAt?: string;
  cargoObjectives: CargoObjective[];
  dataOrigin: DataOrigin;
}
export interface CargoRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "Active" | "Finished";
  contractIds: string[];
  contractSnapshots: Contract[];
}
export interface ObjectiveDraft {
  commodity: string;
  pickupLocation: string;
  destination: string;
  quantitySCU: number;
}
export interface ContractDraft {
  name: string;
  payout: number;
  objectives: ObjectiveDraft[];
}
