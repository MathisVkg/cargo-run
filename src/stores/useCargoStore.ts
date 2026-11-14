import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { ships } from "../data/ships";
import type { ContractDraft, Page } from "../types/models";
import type { AppSnapshot } from "../types/tracking";
export { createCargoStore, validateDraft } from "./cargoDomain";
interface RendererState extends AppSnapshot {
  page: Page;
  editorRequest: { id: number; contractId?: string; captureId?: string } | null;
  openEditor(contractId?: string, captureId?: string): void;
  closeEditor(): void;
  retainedInventoryRequest: number;
  showRetainedInventory(): void;
  ready: boolean;
  actionError: string | null;
  pending: number;
  setPage(page: Page): void;
  selectShip(id: string): Promise<void>;
  resolveLifecycle(
    input: import("../types/lifecycle").LifecycleResolution,
  ): Promise<void>;
  recordProgress(
    input: import("../types/progress").ProgressRequest,
  ): Promise<void>;
  setPreferences(
    patch: import("../types/preferences").PreferencesPatch,
  ): Promise<void>;
  saveContract(draft: ContractDraft, id?: string): Promise<void>;
  abandonContract(id: string): Promise<void>;
  finishRun(
    input?: import("../types/workflow").FinishRunRequest,
  ): Promise<void>;
  completeContract(id: string): Promise<void>;
  checklist(input: import("../types/workflow").ChecklistRequest): Promise<void>;
  setWorkflow(
    input: import("../types/workflow").WorkflowPreferences,
  ): Promise<void>;
  clearSampleData(): Promise<void>;
  loadSamples(): Promise<void>;
  chooseLog(): Promise<void>;
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  importHistory(): Promise<void>;
  dismissError(): void;
}
const initial: AppSnapshot = {
  workflow: { automaticCompletion: false },
  preferences: {
    navigationMode: "expanded",
    dashboardView: "location",
    favoriteShipIds: [],
    recentShipIds: [],
  },
  revision: -1,
  databasePath: "",
  ships,
  selectedShipId: ships[0].id,
  contracts: [],
  runs: [],
  currentRun: {
    id: "loading",
    startedAt: new Date().toISOString(),
    status: "Active",
    contractIds: [],
    contractSnapshots: [],
  },
  sampleMode: false,
  tracking: {
    status: "OFFLINE",
    path: null,
    enabled: false,
    importing: false,
    error: null,
    lastEventAt: null,
    accepted: 0,
    objectives: 0,
    completed: 0,
    parsingErrors: 0,
    unresolved: 0,
    events: [],
  },
};
function receive(state: AppSnapshot): void {
  if (state.revision >= cargoStore.getState().revision)
    cargoStore.setState({ ...state, ready: true });
}
async function call(action: () => Promise<AppSnapshot>): Promise<void> {
  cargoStore.setState((s) => ({ pending: s.pending + 1, actionError: null }));
  try {
    receive(await action());
  } catch (error) {
    cargoStore.setState({
      actionError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    cargoStore.setState((s) => ({ pending: s.pending - 1 }));
  }
}
const quiet = (action: () => Promise<AppSnapshot>): Promise<void> =>
  call(action).catch(() => {});
let editorSequence = 0;
export const cargoStore = createStore<RendererState>(() => ({
  ...initial,
  page: "Contracts",
  editorRequest: null,
  openEditor: (contractId, captureId) =>
    cargoStore.setState({
      editorRequest: { id: ++editorSequence, contractId, captureId },
    }),
  closeEditor: () => cargoStore.setState({ editorRequest: null }),
  retainedInventoryRequest: 0,
  showRetainedInventory: () =>
    cargoStore.setState((s) => ({
      page: "Settings",
      retainedInventoryRequest: s.retainedInventoryRequest + 1,
    })),
  ready: false,
  actionError: null,
  pending: 0,
  setPage: (page) =>
    cargoStore.setState({
      page:
        page === "Dashboard" || page === "Manifest"
          ? "Cargo"
          : page === "Scan Review"
            ? "Contracts"
            : page,
    }),
  setPreferences: (patch) => quiet(() => window.cargoRun.setPreferences(patch)),
  selectShip: (id) => quiet(() => window.cargoRun.selectShip(id)),
  resolveLifecycle: (input) =>
    call(() => window.cargoRun.resolveLifecycle(input)),
  recordProgress: (input) => call(() => window.cargoRun.cargoProgress(input)),
  saveContract: (draft, id) =>
    call(() => window.cargoRun.saveContract({ draft, id })),
  abandonContract: (id) => quiet(() => window.cargoRun.abandonContract(id)),
  completeContract: (id) => call(() => window.cargoRun.completeContract(id)),
  checklist: (input) => call(() => window.cargoRun.checklist(input)),
  setWorkflow: (input) => call(() => window.cargoRun.setWorkflow(input)),
  finishRun: (input) => call(() => window.cargoRun.finishRun(input)),
  clearSampleData: () => quiet(() => window.cargoRun.removeSamples()),
  loadSamples: () => quiet(() => window.cargoRun.loadSamples()),
  chooseLog: () => quiet(() => window.cargoRun.chooseLog()),
  startMonitoring: () => quiet(() => window.cargoRun.startMonitoring()),
  stopMonitoring: () => quiet(() => window.cargoRun.stopMonitoring()),
  importHistory: () => call(() => window.cargoRun.importHistory()),
  dismissError: () => cargoStore.setState({ actionError: null }),
}));
export function initializeCargoStore(): () => void {
  const dispose = window.cargoRun.onState(receive);
  void call(() => window.cargoRun.getState()).catch(() => {});
  return dispose;
}
export function useCargoStore<T>(selector: (state: RendererState) => T): T {
  return useStore(cargoStore, selector);
}
