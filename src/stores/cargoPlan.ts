import type { Contract, CargoObjective } from "../types/models";
import {
  activeContracts,
  canonicalLocation,
  uniqueObjectives,
  contractSCU,
} from "./selectors";
export interface PlanLine {
  commodity: string;
  route: string;
  scu: number;
  objectives: CargoObjective[];
}
export interface PlanStop {
  location: string;
  scu: number;
  lines: PlanLine[];
}
export function cargoPlan(
  contracts: Contract[],
  kind: "pickup" | "delivery",
): PlanStop[] {
  const stops = new Map<string, PlanStop>();
  for (const c of activeContracts(contracts))
    for (const o of uniqueObjectives(c)) {
      const location = canonicalLocation(
          kind === "pickup" ? o.pickupLocation : o.destination,
          kind,
        ),
        route = canonicalLocation(
          kind === "pickup" ? o.destination : o.pickupLocation,
          kind === "pickup" ? "delivery" : "pickup",
        ),
        key = location.toLocaleLowerCase(),
        stop = stops.get(key) ?? { location, scu: 0, lines: [] };
      // Destination/origin is part of the aggregation key: identical cargo never loses its route.
      const commodity = o.commodity.trim() || "Unknown commodity";
      let line = stop.lines.find(
        (l) =>
          l.commodity.toLocaleLowerCase() === commodity.toLocaleLowerCase() &&
          l.route.toLocaleLowerCase() === route.toLocaleLowerCase(),
      );
      if (!line) {
        line = { commodity, route, scu: 0, objectives: [] };
        stop.lines.push(line);
      }
      line.scu += o.quantitySCU;
      line.objectives.push(o);
      stop.scu += o.quantitySCU;
      stops.set(key, stop);
    }
  return [...stops.values()].sort((a, b) =>
    a.location.localeCompare(b.location),
  );
}
export const plannedSCU = (contracts: Contract[]) =>
  activeContracts(contracts).reduce((n, c) => n + contractSCU(c), 0);
