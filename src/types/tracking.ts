import type { CargoRun, Contract, ContractDraft, Ship } from "./models";
export interface DomainSnapshot {
  ships: Ship[];
  selectedShipId: string;
  contracts: Contract[];
  runs: CargoRun[];
  currentRun: CargoRun;
  sampleMode: boolean;
}
export type MonitoringStatus = "ONLINE" | "OFFLINE" | "ERROR";
export interface MonitorConfig {
  path: string | null;
  enabled: boolean;
}
export interface DiagnosticEvent {
  id: number;
  receivedAt: string;
  eventAt: string | null;
  kind: string;
  missionId: string | null;
  message: string;
  raw: string;
  sourcePath: string;
  mode: "Live" | "Import";
  unresolved: boolean;
}
export interface TrackingInfo {
  status: MonitoringStatus;
  path: string | null;
  enabled: boolean;
  importing: boolean;
  error: string | null;
  lastEventAt: string | null;
  accepted: number;
  objectives: number;
  completed: number;
  parsingErrors: number;
  unresolved: number;
  events: DiagnosticEvent[];
}
export interface AppSnapshot extends DomainSnapshot {
  revision: number;
  databasePath: string;
  tracking: TrackingInfo;
}
export interface SaveContractRequest {
  draft: ContractDraft;
  id?: string;
}
export interface LogCheckpoint {
  fileKey: string;
  generation: string;
  offset: number;
  pending: string;
  dropping: boolean;
  anchor: string;
}
export interface LogSource {
  path: string;
  generation: string;
  offset: number;
  mode: "Live" | "Import";
}
export interface MissionEvent {
  id: string;
  kind: "Accepted" | "Objective" | "Completed";
  missionId: string;
  objectiveId: string | null;
  timestamp: string | null;
  receivedAt: string;
  title?: string;
  commodity?: string;
  destination?: string;
  quantitySCU?: number;
  deliveredSCU?: number;
}
export type ParseResult =
  | { type: "event"; event: MissionEvent }
  | { type: "error"; error: string }
  | { type: "ignore" };
