import type { Contract, CargoObjective, ContractStatus } from "../types/models";
function contract(
  id: string,
  name: string,
  payout: number,
  status: ContractStatus,
  stops: [string, string, string, number][],
): Contract {
  const cargoObjectives: CargoObjective[] = stops.map(
    ([commodity, pickupLocation, destination, quantitySCU], i) => ({
      id: id + "-obj-" + i,
      contractId: id,
      commodity,
      pickupLocation,
      destination,
      quantitySCU,
      deliveredSCU: status === "Completed" ? quantitySCU : 0,
    }),
  );
  return {
    id,
    name,
    payout,
    status,
    source: "Manual",
    confirmedEarnings: status === "Completed" ? payout : 0,
    dataOrigin: "Sample",
    acceptedAt: "2026-10-18T14:20:00.000Z",
    ...(status === "Completed"
      ? { completedAt: "2026-10-18T15:40:00.000Z" }
      : {}),
    cargoObjectives,
  };
}
export function sampleContracts(): Contract[] {
  return [
    contract("sample-01", "Industrial supply chain", 78000, "Active", [
      ["Titanium", "Everus Harbor", "Area18", 120],
      ["Aluminum", "Everus Harbor", "Orison", 64],
    ]),
    contract("sample-02", "ArcCorp materials transfer", 54000, "Active", [
      ["Agricultural supplies", "Baijini Point", "Area18", 96],
    ]),
    contract("sample-03", "Crusader infrastructure", 62000, "Active", [
      ["Processed food", "Seraphim Station", "Orison", 80],
    ]),
    contract("sample-04", "Frontier resupply", 46000, "Active", [
      ["Medical supplies", "Port Tressler", "New Babbage", 60],
    ]),
    contract("sample-05", "Station provisions", 32500, "Completed", [
      ["Processed food", "Everus Harbor", "Seraphim Station", 48],
    ]),
    contract("sample-06", "Mining equipment transfer", 28000, "Abandoned", [
      ["Mining equipment", "Area18", "Lorville", 32],
    ]),
  ];
}
