import type { ContractStatus } from "./models";
export interface LifecycleActivity {
  id: string;
  contractId: string;
  missionId: string;
  eventId: string;
  action: string;
  at: string | null;
  receivedAt: string;
  previousStatus: ContractStatus;
  newStatus: ContractStatus;
}
export interface LifecycleIssue {
  missionId: string;
  eventId: string;
  kind: "Completed" | "Abandoned";
  eventAt: string | null;
  title: string;
  version: string;
  candidates: {
    id: string;
    name: string;
    status: ContractStatus;
    required: number;
    onboard: number;
    reason: string;
    automaticReason: string;
    identityEvidence: string;
  }[];
}
export interface LifecycleResolution {
  missionId: string;
  contractId?: string;
  version: string;
  confirmed?: boolean;
  dismiss?: boolean;
}
