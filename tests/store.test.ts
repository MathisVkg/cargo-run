import { describe, expect, it } from "vitest";
import { createCargoStore, validateDraft } from "../src/stores/useCargoStore";
import {
  groupByDestination,
  operationStats,
  historyStats,
} from "../src/stores/selectors";
import { sampleContracts } from "../src/data/sample";
import type { ContractDraft } from "../src/types/models";
const draft: ContractDraft = {
  name: "New supply run",
  payout: 10000,
  objectives: [
    {
      commodity: "Titanium",
      pickupLocation: "Everus",
      destination: "Area18",
      quantitySCU: 10,
    },
    {
      commodity: "Food",
      pickupLocation: "Everus",
      destination: "Orison",
      quantitySCU: 30,
    },
  ],
};
describe("contract operations and selectors", () => {
  it("counts a multi-destination contract once and reconciles allocated payout", () => {
    const store = createCargoStore([]);
    store.getState().saveContract(draft);
    expect(operationStats(store.getState().contracts)).toEqual({
      missions: 1,
      scu: 40,
      potential: 10000,
      destinations: 2,
    });
    const groups = groupByDestination(store.getState().contracts);
    expect(groups.map((g) => g.allocatedPayout)).toEqual([2500, 7500]);
    expect(groups.reduce((n, g) => n + g.allocatedPayout, 0)).toBe(10000);
  });
  it("validates missing, negative, non-finite, and zero cargo inputs", () => {
    expect(validateDraft({ ...draft, name: " " })).toBeTruthy();
    for (const payout of [-1, NaN, Infinity])
      expect(validateDraft({ ...draft, payout })).toBeTruthy();
    for (const quantitySCU of [-1, 0, NaN, Infinity])
      expect(
        validateDraft({
          ...draft,
          objectives: [{ ...draft.objectives[0], quantitySCU }],
        }),
      ).toBeTruthy();
    expect(validateDraft({ ...draft, payout: 0 })).toBeNull();
    expect(validateDraft({ ...draft, objectives: [] })).toBeTruthy();
    const store = createCargoStore([]);
    expect(() =>
      store.getState().saveContract({ ...draft, payout: -1 }),
    ).toThrow();
    expect(store.getState().contracts).toHaveLength(0);
  });
  it("closes runs with immutable snapshots without changing unfinished contracts or earned totals", () => {
    const store = createCargoStore([]);
    const id = store.getState().saveContract(draft);
    const before = store.getState().contracts;
    store.getState().finishRun();
    expect(store.getState().contracts).toBe(before);
    expect(store.getState().runs[0].status).toBe("Finished");
    expect(store.getState().runs[0].contractSnapshots[0].status).toBe("Active");
    expect(historyStats(store.getState().contracts).earned).toBe(0);
    expect(store.getState().currentRun.contractIds).toEqual([id]);
    store.getState().saveContract({ ...draft, name: "Revised" }, id);
    expect(store.getState().runs[0].contractSnapshots[0].name).toBe(draft.name);
    expect(historyStats(store.getState().contracts).contracts).toBe(1);
  });
  it("edits immutably and abandons while preserving history", () => {
    const store = createCargoStore([]);
    const id = store.getState().saveContract(draft);
    const before = store.getState().contracts[0];
    store.getState().saveContract({ ...draft, payout: 20000 }, id);
    expect(before.payout).toBe(10000);
    expect(store.getState().contracts[0].source).toBe("Manual");
    store.getState().abandonContract(id);
    expect(operationStats(store.getState().contracts).missions).toBe(0);
    expect(store.getState().contracts[0].status).toBe("Abandoned");
    expect(() => store.getState().saveContract(draft, id)).toThrow();
  });
  it("only counts confirmed completed earnings and never repeats run contracts in all-time totals", () => {
    const store = createCargoStore();
    expect(operationStats(store.getState().contracts)).toEqual({
      missions: 4,
      scu: 420,
      potential: 240000,
      destinations: 3,
    });
    expect(historyStats(store.getState().contracts)).toEqual({
      contracts: 6,
      scu: 500,
      earned: 32500,
    });
    store.getState().finishRun();
    store.getState().finishRun();
    expect(historyStats(store.getState().contracts)).toEqual({
      contracts: 6,
      scu: 500,
      earned: 32500,
    });
  });
  it("removes sample data separately from manual entries and retained run snapshots", () => {
    const store = createCargoStore();
    const id = store.getState().saveContract(draft);
    store.getState().finishRun();
    store.getState().clearSampleData();
    expect(store.getState().contracts.map((c) => c.id)).toEqual([id]);
    expect(store.getState().runs[0].contractSnapshots).toHaveLength(5);
    expect(store.getState().currentRun.contractIds).toEqual([id]);
  });
  it("handles partial deliveries and counts unique contracts within the same destination", () => {
    const seed = sampleContracts().slice(0, 1);
    seed[0].cargoObjectives[0].deliveredSCU = 20;
    seed[0].cargoObjectives.push({
      ...seed[0].cargoObjectives[0],
      id: "extra",
      quantitySCU: 10,
      deliveredSCU: 0,
    });
    const group = groupByDestination(seed).find(
      (g) => g.destination === "Area18",
    )!;
    expect(group.scu).toBe(110);
    expect(group.contractCount).toBe(1);
    expect(operationStats(seed).missions).toBe(1);
  });
  it("ignores unknown ships and has useful empty-state calculations", () => {
    const store = createCargoStore([]);
    store.getState().selectShip("unknown");
    expect(store.getState().selectedShipId).toBe("c2");
    store.getState().selectShip("hull-c");
    expect(store.getState().selectedShipId).toBe("hull-c");
    expect(groupByDestination([])).toEqual([]);
    store.getState().finishRun();
    expect(store.getState().runs).toEqual([]);
  });
});
