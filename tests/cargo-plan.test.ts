import { describe, it, expect } from "vitest";
import type { Contract } from "../src/types/models";
import { cargoPlan, plannedSCU } from "../src/stores/cargoPlan";
const contract = (
  id: string,
  rows: {
    commodity: string;
    pickupLocation: string;
    destination: string;
    quantitySCU: number;
  }[],
  status: Contract["status"] = "Active",
): Contract => ({
  id,
  name: id,
  status,
  source: "Manual",
  dataOrigin: "Manual",
  payout: null,
  confirmedEarnings: 0,
  acceptedAt: null,
  cargoObjectives: rows.map((r, i) => ({
    ...r,
    id: id + i,
    contractId: id,
    deliveredSCU: 0,
    loadedSCU: 3,
  })),
});
const row = (
  destination: string,
  quantitySCU: number,
  commodity = "Titanium",
  pickupLocation = "Port Tressler",
) => ({ commodity, pickupLocation, destination, quantitySCU });
describe("gameplay cargo plan", () => {
  it("aggregates identical commodity/routes across contracts while preserving reminder identities", () => {
    const contracts = [
      contract("a", [row("NB Int. Spaceport", 25), row("New Babbage", 10)]),
      contract("b", [row("NB Int. Spaceport", 5)]),
    ];
    const p = cargoPlan(contracts, "pickup");
    expect(p).toHaveLength(1);
    expect(p[0].scu).toBe(40);
    expect(p[0].lines).toHaveLength(2);
    expect(p[0].lines[0].scu).toBe(30);
    expect(p[0].lines[0].objectives.map((o) => o.id)).toEqual(["a0", "b0"]);
    expect(
      cargoPlan(contracts, "delivery")
        .map((s) => s.scu)
        .sort((a, b) => a - b),
    ).toEqual([10, 30]);
  });
  it("keeps separate origins/commodities and uses required accepted quantities rather than loaded/delivered", () => {
    const a = contract("a", [
      row("Area18", 6),
      row("Area18", 8, "Titanium", "Everus Harbor"),
      row("Area18", 4, "Hydrogen"),
    ]);
    a.cargoObjectives[0].deliveredSCU = 4;
    const before = JSON.stringify(a);
    expect(
      plannedSCU([a, contract("closed", [row("Area18", 99)], "Completed")]),
    ).toBe(18);
    const s = cargoPlan([a], "delivery");
    expect(s[0].lines).toHaveLength(3);
    expect(s[0].scu).toBe(18);
    expect(JSON.stringify(a)).toBe(before);
  });
  it("excludes superseded/closed contracts and deduplicates persistent objectives only", () => {
    const a = contract("a", [row("Area18", 6)]);
    a.cargoObjectives.push({ ...a.cargoObjectives[0] });
    const old = contract("old", [row("Area18", 99)]);
    old.supersededBy = "a";
    expect(plannedSCU([a, old])).toBe(6);
    expect(cargoPlan([a, old], "pickup")[0].scu).toBe(6);
  });
});
