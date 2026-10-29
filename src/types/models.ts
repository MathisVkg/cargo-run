export type ContractStatus = "Active" | "Completed" | "Abandoned";
export type ContractSource = "Log" | "OCR" | "Manual";
export type DataOrigin = "Sample" | "Manual" | "Log" | "OCR";
export type Page =
  "Dashboard" | "Manifest" | "History" | "Settings" | "Scan Review";
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
  acceptedAt: string | null;
  company?: string | null;
  sources?: ("Log" | "OCR" | "Manual")[];
  supersededBy?: string;
  fieldProvenance?: Record<
    string,
    {
      source: "Log" | "OCR" | "Manual";
      captureId?: string;
      at: string;
      corroboratedBy?: string[];
    }
  >;
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
  id?: string;
  deliveredSCU?: number;
  commodity: string;
  pickupLocation: string;
  destination: string;
  quantitySCU: number;
}
export interface ContractDraft {
  company?: string | null;
  name: string;
  payout: number | null;
  objectives: ObjectiveDraft[];
}
