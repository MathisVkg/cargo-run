import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { ships } from "../data/ships";
import type { ContractDraft, Page } from "../types/models";
import type { AppSnapshot } from "../types/tracking";
export { createCargoStore, validateDraft } from "./cargoDomain";
interface RendererState extends AppSnapshot {
  page: Page;
  ready: boolean;
  actionError: string | null;
  pending: number;
  setPage(page: Page): void;
  selectShip(id: string): Promise<void>;
  saveContract(draft: ContractDraft, id?: string): Promise<void>;
  abandonContract(id: string): Promise<void>;
  finishRun(): Promise<void>;
  clearSampleData(): Promise<void>;
  loadSamples(): Promise<void>;
  chooseLog(): Promise<void>;
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  importHistory(): Promise<void>;
  dismissError(): void;
}
const initial: AppSnapshot = {
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
export const cargoStore = createStore<RendererState>(() => ({
  ...initial,
  page: "Dashboard",
  ready: false,
  actionError: null,
  pending: 0,
  setPage: (page) => cargoStore.setState({ page }),
  selectShip: (id) => quiet(() => window.cargoRun.selectShip(id)),
  saveContract: (draft, id) =>
    call(() => window.cargoRun.saveContract({ draft, id })),
  abandonContract: (id) => quiet(() => window.cargoRun.abandonContract(id)),
  finishRun: () => call(() => window.cargoRun.finishRun()),
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
