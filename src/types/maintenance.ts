export type CleanupMode = "closed" | "history" | "reset";
export interface LocalDataStats {
  retainedCargo: {
    contracts: number;
    scu: number;
    ships: { id: string | null; name: string; scu: number }[];
  };
  total: number;
  active: number;
  completed: number;
  abandoned: number;
  finishedRuns: number;
  captures: number;
  pendingMissions: number;
  trackingBytes: number;
  lastBackup: string | null;
}
export interface CleanupPreview {
  token: string;
  mode: CleanupMode;
  contracts: number;
  runs: number;
  captures: number;
  links: number;
  audits: number;
  runReferences: number;
  automaticRequests: number;
  preservesActive: boolean;
  stopsMonitoring: boolean;
  description: string;
}
export interface CleanupResult {
  backupPath: string;
  message: string;
  warnings: string[];
  stats: LocalDataStats;
}
