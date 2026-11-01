import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TrackingService } from "../electron/main/trackingService";
import { createCargoStore } from "../src/stores/cargoDomain";
import {
  activeContracts,
  operationStats,
  groupByLocation,
  canonicalLocation,
  contractSCU,
  planningCapacity,
  progressLabel,
} from "../src/stores/selectors";
import { ships, shipCatalog, filterShips, mergeShips } from "../src/data/ships";
import { validatePreferences } from "../src/types/preferences";
import type { Contract, Ship } from "../src/types/models";
function fixture(): Contract[] {
  const store = createCargoStore([]);
  for (let i = 0; i < 20; i++)
    store.getState().saveContract({
      name: "Contract " + i,
      payout: i === 0 ? null : 1000,
      objectives: [
        {
          commodity: "Food",
          pickupLocation: "Port Tressler",
          destination:
            i % 2 ? "NB Int. Spaceport" : "NB Int. Spaceport on microTech",
          quantitySCU: 8,
        },
        {
          commodity: "Titanium",
          pickupLocation: "Port Tressler",
          destination: "Area18",
          quantitySCU: 12,
        },
      ],
    });
  return store.getState().contracts;
}
describe("Fleet Operations planning", () => {
  it("counts twenty unique contracts and full known rewards once", () => {
    const contracts = fixture();
    const c = contracts[0];
    contracts.push(c, { ...c, id: "superseded", supersededBy: c.id });
    expect(activeContracts(contracts)).toHaveLength(20);
    expect(operationStats(contracts)).toEqual({
      missions: 20,
      scu: 400,
      potential: 19000,
      destinations: 2,
    });
  });
  it("preserves distinct matching rows while deduplicating repeated objective IDs", () => {
    const c = fixture()[0];
    c.cargoObjectives.push(
      { ...c.cargoObjectives[0] },
      { ...c.cargoObjectives[0], id: "distinct" },
    );
    expect(contractSCU(c)).toBe(28);
    expect(groupByLocation([c], "pickup")[0].rows).toHaveLength(3);
  });
  it("groups bounded canonical aliases and shared pickup with quantities and original identities intact", () => {
    const contracts = fixture(),
      before = JSON.stringify(contracts);
    contracts[0].cargoObjectives[0].deliveredSCU = 3;
    const updated = JSON.stringify(contracts);
    const delivery = groupByLocation(contracts, "delivery");
    expect(delivery.map((g) => g.destination)).toEqual([
      "Area18",
      "NB Int. Spaceport",
    ]);
    expect(delivery[1]).toMatchObject({
      required: 160,
      delivered: 3,
      scu: 157,
      contractCount: 20,
    });
    const pickup = groupByLocation(contracts, "pickup")[0];
    expect(pickup.contractCount).toBe(20);
    expect(pickup.rows).toHaveLength(40);
    expect(pickup.scu).toBe(397);
    expect(JSON.stringify(contracts)).toBe(updated);
    expect(before).not.toBe(updated);
    expect(delivery.every((g) => !("allocatedPayout" in g))).toBe(true);
  });
  it("does not fuzzy merge different locations and handles unknowns", () => {
    const c = fixture()[0];
    c.cargoObjectives[0].destination = "";
    c.cargoObjectives[1].destination = "NB Int. Spaceport on another planet";
    expect(groupByLocation([c], "delivery").map((g) => g.destination)).toEqual([
      "NB Int. Spaceport on another planet",
      "Unresolved Destination",
    ]);
    c.cargoObjectives = [];
    expect(groupByLocation([c], "pickup")[0]).toMatchObject({
      destination: "Unknown pickup",
      unknownCargo: true,
    });
    expect(operationStats([]).scu).toBe(0);
    expect(canonicalLocation("constructor")).toBe("constructor");
    expect(canonicalLocation("__proto__")).toBe("__proto__");
  });
  it("changes planning capacity without claiming loaded cargo", () => {
    expect(planningCapacity(720, 696)).toEqual({
      utilization: (720 / 696) * 100,
      unallocated: 0,
      over: true,
    });
    expect(planningCapacity(100, 4608).unallocated).toBe(4508);
    expect(planningCapacity(100, 0).utilization).toBeNull();
  });
  it("uses evidence for progress labels and respects manual correction precedence", () => {
    const c = fixture()[0],
      o = c.cargoObjectives[0];
    expect(progressLabel(c, o)).toBe("Planned");
    o.deliveredSCU = 2;
    o.lastLogEventAt = "2026-11-01";
    expect(progressLabel(c, o)).toBe("Supported Game.log progress");
    c.fieldProvenance = {
      ["objectives." + o.id + ".deliveredSCU"]: { source: "Manual", at: "now" },
    };
    expect(progressLabel(c, o)).toBe("Reported manually");
  });
});
describe("Offline ship catalog and preferences", () => {
  it("rolls back selected ship and recent preferences together if the domain write fails", () => {
    const service = new TrackingService(":memory:");
    service.selectShip("hull-c");
    const before = service.snapshot();
    vi.spyOn(service.database, "saveDomain").mockImplementationOnce(() => {
      throw new Error("Test write failure");
    });
    expect(() => service.selectShip("c2")).toThrow("Test write failure");
    expect(service.snapshot().selectedShipId).toBe(before.selectedShipId);
    expect(service.snapshot().preferences).toEqual(before.preferences);
    expect(service.database.getSetting("ui.preferences")).toEqual(
      before.preferences,
    );
    service.database.close();
  });
  it("bundles every positive supported source row with distinct canonical variants and attribution", () => {
    expect(ships).toHaveLength(shipCatalog.coverage.eligible);
    expect(ships).toHaveLength(126);
    expect(filterShips(ships)).toHaveLength(105);
    expect(new Set(ships.map((s) => s.id)).size).toBe(ships.length);
    expect(new Set(ships.map((s) => s.source)).size).toBe(ships.length);
    expect(
      ships.every(
        (s) =>
          s.cargoCapacitySCU > 0 &&
          Number.isFinite(s.cargoCapacitySCU) &&
          s.source &&
          s.manufacturer,
      ),
    ).toBe(true);
    expect(ships.find((s) => s.id === "c2")?.cargoCapacitySCU).toBe(696);
    expect(filterShips(ships, "100i")[0].cargoCapacitySCU).toBe(2);
  });
  it("filters names manufacturers capacities and availability without changing variants", () => {
    expect(filterShips(ships, "Crusader").length).toBeGreaterThan(1);
    expect(filterShips(ships, "4608").some((s) => s.id === "hull-c")).toBe(
      true,
    );
    expect(
      filterShips(ships, "", "MISC").every((s) => s.manufacturer === "MISC"),
    ).toBe(true);
    expect(
      filterShips([
        { id: "bad", name: "Bad", manufacturer: "Test", cargoCapacitySCU: NaN },
      ]),
    ).toEqual([]);
    expect(filterShips(ships, "", "", true)).toHaveLength(126);
  });
  it("preserves custom and historical ship entries and old IDs", () => {
    const custom: Ship = {
      id: "custom",
      name: "My ship",
      manufacturer: "Custom",
      cargoCapacitySCU: 42,
    };
    const merged = mergeShips([{ ...ships[0], cargoCapacitySCU: 1 }, custom]);
    expect(merged.find((s) => s.id === "custom")).toEqual(custom);
    expect(merged.find((s) => s.id === "c2")?.cargoCapacitySCU).toBe(696);
    expect(
      ["c2", "caterpillar", "hull-c"].every((id) =>
        merged.some((s) => s.id === id),
      ),
    ).toBe(true);
  });
  it("validates a fixed preference payload", () => {
    const ids = new Set(ships.map((s) => s.id));
    for (const bad of [
      null,
      [],
      { other: true },
      { dashboardView: "bad" },
      { favoriteShipIds: ["unknown"] },
      { favoriteShipIds: ["c2", "c2"] },
      { recentShipIds: ["c2"] },
    ])
      expect(() => validatePreferences(bad, ids)).toThrow();
    expect(
      validatePreferences(
        { dashboardView: "contract", favoriteShipIds: ["c2"] },
        ids,
      ),
    ).toEqual({ dashboardView: "contract", favoriteShipIds: ["c2"] });
  });
  it("migrates an existing catalog transactionally without touching contracts or runs and persists favorites/recent/view", () => {
    const file = join(
      mkdtempSync(join(tmpdir(), "cargo-fleet-")),
      "test.sqlite",
    );
    let service = new TrackingService(file);
    const custom: Ship = {
      id: "custom",
      name: "Custom capacity",
      manufacturer: "Local",
      cargoCapacitySCU: 41,
    };
    service.saveContract({
      draft: {
        name: "Preserved migration cargo",
        payout: 24000,
        objectives: [
          {
            commodity: "Food",
            pickupLocation: "Port Tressler",
            destination: "Area18",
            quantitySCU: 12,
          },
        ],
      },
    });
    service.finishRun();
    const before = service.domain();
    service.database.saveDomain({
      ...before,
      ships: [
        ...ships.filter((s) => ["c2", "caterpillar", "hull-c"].includes(s.id)),
        custom,
      ],
      selectedShipId: "custom",
    });
    service.database.close();
    service = new TrackingService(file);
    expect(service.snapshot().selectedShipId).toBe("custom");
    expect(service.snapshot().ships.find((s) => s.id === "custom")).toEqual(
      custom,
    );
    expect(service.snapshot().contracts).toEqual(before.contracts);
    expect(service.snapshot().runs).toEqual(before.runs);
    service.setPreferences({
      dashboardView: "contract",
      favoriteShipIds: ["custom", "c2"],
    });
    service.selectShip("hull-c");
    service.database.close();
    service = new TrackingService(file);
    expect(service.snapshot().selectedShipId).toBe("hull-c");
    expect(service.snapshot().preferences).toEqual({
      navigationMode: "expanded",
      dashboardView: "contract",
      favoriteShipIds: ["custom", "c2"],
      recentShipIds: ["hull-c"],
    });
    service.database.close();
  });
});
