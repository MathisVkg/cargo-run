import type { Contract, CargoObjective } from "../types/models";
export const activeContracts = (contracts: Contract[]): Contract[] =>
  contracts.filter((c) => c.status === "Active");
export const contractSCU = (c: Contract): number =>
  c.cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0);
export const outstandingSCU = (c: Contract): number =>
  c.cargoObjectives.reduce(
    (n, o) => n + Math.max(0, o.quantitySCU - o.deliveredSCU),
    0,
  );
export function operationStats(contracts: Contract[]) {
  const active = activeContracts(contracts);
  return {
    missions: active.length,
    scu: active.reduce((n, c) => n + outstandingSCU(c), 0),
    potential: active.reduce((n, c) => n + (c.payout ?? 0), 0),
    destinations: new Set(
      active.flatMap((c) =>
        c.cargoObjectives.map((o) => o.destination).filter(Boolean),
      ),
    ).size,
  };
}
export function historyStats(contracts: Contract[]) {
  return {
    contracts: contracts.length,
    scu: contracts.reduce((n, c) => n + contractSCU(c), 0),
    earned: contracts.reduce(
      (n, c) => n + (c.status === "Completed" ? c.confirmedEarnings : 0),
      0,
    ),
  };
}
export interface DestinationGroup {
  destination: string;
  rows: { contract: Contract; objective: CargoObjective | null }[];
  contractCount: number;
  scu: number;
  allocatedPayout: number;
  unknownPayouts: boolean;
  unknownCargo: boolean;
}
export function groupByDestination(contracts: Contract[]): DestinationGroup[] {
  const groups = new Map<string, DestinationGroup>();
  for (const contract of activeContracts(contracts)) {
    const objectives: (CargoObjective | null)[] = contract.cargoObjectives
      .length
      ? contract.cargoObjectives
      : [null];
    const total = contractSCU(contract);
    for (const objective of objectives) {
      const destination = objective?.destination || "Unresolved Destination";
      const g = groups.get(destination) ?? {
        destination,
        rows: [],
        contractCount: 0,
        scu: 0,
        allocatedPayout: 0,
        unknownPayouts: false,
        unknownCargo: false,
      };
      g.rows.push({ contract, objective });
      g.scu += objective
        ? Math.max(0, objective.quantitySCU - objective.deliveredSCU)
        : 0;
      if (contract.payout === null) g.unknownPayouts = true;
      else
        g.allocatedPayout +=
          total > 0 && objective
            ? (contract.payout * objective.quantitySCU) / total
            : contract.payout;
      if (!objective) g.unknownCargo = true;
      groups.set(destination, g);
    }
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      contractCount: new Set(g.rows.map((r) => r.contract.id)).size,
    }))
    .sort((a, b) => a.destination.localeCompare(b.destination));
}
