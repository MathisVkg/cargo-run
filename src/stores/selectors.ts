import type { Contract, CargoObjective } from "../types/models";
export const activeContracts = (contracts: Contract[]): Contract[] => [
  ...new Map(
    contracts
      .filter((c) => c.status === "Active" && !c.supersededBy)
      .map((c) => [c.id, c]),
  ).values(),
];
/** Presentation deduplication uses persistent identity only; matching remains in main. */
export const uniqueObjectives = (c: Contract): CargoObjective[] => [
  ...new Map(c.cargoObjectives.map((o) => [o.id, o])).values(),
];
export const contractSCU = (c: Contract): number =>
  uniqueObjectives(c).reduce((n, o) => n + o.quantitySCU, 0);
export const recordedOnboard = (cs: Contract[], shipId: string) =>
  cs
    .filter((c) => !c.supersededBy)
    .flatMap(uniqueObjectives)
    .filter((o) => o.loadedShipId === shipId)
    .reduce((n, o) => n + (o.loadedSCU ?? 0), 0);
export const remainingSCU = (o: CargoObjective): number =>
  Math.max(0, o.quantitySCU - o.deliveredSCU);
export const outstandingSCU = (c: Contract): number =>
  uniqueObjectives(c).reduce((n, o) => n + remainingSCU(o), 0);
/** Deliberately bounded display aliases, never used to change stored evidence or mission identity. */
export function canonicalLocation(
  value: string,
  kind: "pickup" | "delivery" = "delivery",
): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const aliases = new Map([
    ["nb int. spaceport", "NB Int. Spaceport"],
    ["nb int. spaceport on microtech", "NB Int. Spaceport"],
  ]);
  return (
    aliases.get(cleaned.toLocaleLowerCase()) ??
    (cleaned ||
      (kind === "pickup" ? "Unknown pickup" : "Unresolved Destination"))
  );
}
export function operationStats(contracts: Contract[]) {
  const active = activeContracts(contracts);
  return {
    missions: active.length,
    scu: active.reduce((n, c) => n + outstandingSCU(c), 0),
    potential: active.reduce((n, c) => n + (c.payout ?? 0), 0),
    destinations: new Set(
      active.flatMap((c) =>
        uniqueObjectives(c).map((o) => canonicalLocation(o.destination)),
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
export interface LocationGroup {
  destination: string;
  rows: { contract: Contract; objective: CargoObjective | null }[];
  contractCount: number;
  scu: number;
  required: number;
  delivered: number;
  unknownCargo: boolean;
}
export type DestinationGroup = LocationGroup;
export function groupByLocation(
  contracts: Contract[],
  kind: "pickup" | "delivery",
): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();
  for (const contract of activeContracts(contracts)) {
    const objectives: (CargoObjective | null)[] = uniqueObjectives(contract);
    if (!objectives.length) objectives.push(null);
    for (const objective of objectives) {
      const destination = canonicalLocation(
        objective
          ? kind === "pickup"
            ? objective.pickupLocation
            : objective.destination
          : "",
        kind,
      );
      const key = destination.toLocaleLowerCase();
      const group = groups.get(key) ?? {
        destination,
        rows: [],
        contractCount: 0,
        scu: 0,
        required: 0,
        delivered: 0,
        unknownCargo: false,
      };
      group.rows.push({ contract, objective });
      group.scu += objective ? remainingSCU(objective) : 0;
      group.required += objective?.quantitySCU ?? 0;
      group.delivered += objective?.deliveredSCU ?? 0;
      group.unknownCargo ||= !objective;
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      contractCount: new Set(g.rows.map((r) => r.contract.id)).size,
    }))
    .sort((a, b) => a.destination.localeCompare(b.destination));
}
export const groupByDestination = (contracts: Contract[]) =>
  groupByLocation(contracts, "delivery");
export function progressLabel(c: Contract, o: CargoObjective): string {
  const field = c.fieldProvenance?.[`objectives.${o.id}.deliveredSCU`];
  if (field?.source === "Manual") return "Reported manually";
  if (o.lastLogEventAt && o.deliveredSCU > 0)
    return "Supported Game.log progress";
  if (o.deliveredSCU > 0) return "Reported progress";
  return "Planned";
}
export function planningCapacity(planned: number, capacity: number) {
  return {
    utilization: capacity > 0 ? (planned / capacity) * 100 : null,
    unallocated: Math.max(0, capacity - planned),
    over: planned > capacity,
  };
}
