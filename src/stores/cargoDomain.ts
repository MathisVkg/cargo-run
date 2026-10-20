import { createStore } from "zustand/vanilla";
import { ships } from "../data/ships";
import { sampleContracts } from "../data/sample";
import type { CargoRun, Contract, ContractDraft, Page } from "../types/models";

export function validateDraft(draft: ContractDraft): string | null {
  if (!draft.name.trim()) return "Enter a contract name.";
  if (!Number.isFinite(draft.payout) || draft.payout < 0)
    return "Payout must be a finite, non-negative number.";
  if (!draft.objectives.length) return "Add at least one delivery stop.";
  for (const o of draft.objectives) {
    if (
      !o.pickupLocation.trim() ||
      !o.destination.trim() ||
      !o.commodity.trim()
    )
      return "Complete the pickup, destination, and commodity for each stop.";
    if (!Number.isFinite(o.quantitySCU) || o.quantitySCU <= 0)
      return "Cargo quantity must be greater than zero.";
  }
  if (!Number.isFinite(draft.objectives.reduce((n, o) => n + o.quantitySCU, 0)))
    return "Total cargo quantity is too large.";
  return null;
}
export interface CargoState {
  page: Page;
  selectedShipId: string;
  contracts: Contract[];
  runs: CargoRun[];
  currentRun: CargoRun;
  sampleMode: boolean;
  setPage(page: Page): void;
  selectShip(id: string): void;
  saveContract(draft: ContractDraft, id?: string): string;
  abandonContract(id: string): void;
  finishRun(): void;
  clearSampleData(): void;
}
const newRun = (ids: string[] = []): CargoRun => ({
  id: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  status: "Active",
  contractIds: ids,
  contractSnapshots: [],
});
export function createCargoStore(seed: Contract[] = sampleContracts()) {
  return createStore<CargoState>((set) => ({
    page: "Dashboard",
    selectedShipId: ships[0].id,
    contracts: structuredClone(seed),
    runs: [],
    currentRun: newRun(
      seed.filter((c) => c.status === "Active").map((c) => c.id),
    ),
    sampleMode: seed.some((c) => c.dataOrigin === "Sample"),
    setPage: (page) => set({ page }),
    selectShip: (id) => {
      if (ships.some((s) => s.id === id)) set({ selectedShipId: id });
    },
    saveContract: (draft, id) => {
      const error = validateDraft(draft);
      if (error) throw new Error(error);
      const contractId = id ?? crypto.randomUUID();
      set((state) => {
        const existing = id
          ? state.contracts.find((c) => c.id === id)
          : undefined;
        if (id && (!existing || existing.status !== "Active"))
          throw new Error("Only active contracts can be edited.");
        if (existing?.source === "Log")
          throw new Error(
            "Log contracts are updated by observed mission events; create a manual contract to enter separate details.",
          );
        if (existing?.cargoObjectives.some((o) => o.deliveredSCU > 0))
          throw new Error("Partially delivered contracts cannot be edited.");
        const contract: Contract = {
          id: contractId,
          name: draft.name.trim(),
          payout: draft.payout,
          status: "Active",
          source: existing?.source ?? "Manual",
          ...(existing?.missionId ? { missionId: existing.missionId } : {}),
          dataOrigin: existing?.dataOrigin ?? "Manual",
          confirmedEarnings: 0,
          acceptedAt: existing?.acceptedAt ?? new Date().toISOString(),
          cargoObjectives: draft.objectives.map((o, i) => ({
            id: existing?.cargoObjectives[i]?.id ?? crypto.randomUUID(),
            contractId,
            commodity: o.commodity.trim(),
            pickupLocation: o.pickupLocation.trim(),
            destination: o.destination.trim(),
            quantitySCU: o.quantitySCU,
            deliveredSCU: 0,
          })),
        };
        return {
          contracts: existing
            ? state.contracts.map((c) => (c.id === id ? contract : c))
            : [...state.contracts, contract],
          currentRun: {
            ...state.currentRun,
            contractIds: [
              ...new Set([...state.currentRun.contractIds, contractId]),
            ],
          },
        };
      });
      return contractId;
    },
    abandonContract: (id) =>
      set((state) => ({
        contracts: state.contracts.map((c) =>
          c.id === id && c.status === "Active"
            ? { ...c, status: "Abandoned" as const, confirmedEarnings: 0 }
            : c,
        ),
      })),
    finishRun: () =>
      set((state) => {
        const included = state.contracts.filter((c) =>
          state.currentRun.contractIds.includes(c.id),
        );
        if (!included.length) return state;
        const closed: CargoRun = {
          ...state.currentRun,
          status: "Finished",
          finishedAt: new Date().toISOString(),
          contractSnapshots: structuredClone(included),
        };
        const carried = state.contracts
          .filter((c) => c.status === "Active")
          .map((c) => c.id);
        return { runs: [closed, ...state.runs], currentRun: newRun(carried) };
      }),
    clearSampleData: () =>
      set((state) => ({
        contracts: state.contracts.filter((c) => c.dataOrigin !== "Sample"),
        sampleMode: false,
        currentRun: {
          ...state.currentRun,
          contractIds: state.currentRun.contractIds.filter((id) =>
            state.contracts.some(
              (c) => c.id === id && c.dataOrigin !== "Sample",
            ),
          ),
        },
      })),
  }));
}
