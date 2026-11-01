import catalog from "./ship-catalog.json";
import type { Ship } from "../types/models";
export const shipCatalog = catalog;
export const ships: Ship[] = catalog.ships;
/** Existing custom and retired records survive catalog refreshes. Legacy IDs remain stable. */
export function mergeShips(saved: Ship[], bundled: Ship[] = ships): Ship[] {
  const merged = new Map(bundled.map((s) => [s.id, s]));
  for (const ship of saved) if (!merged.has(ship.id)) merged.set(ship.id, ship);
  return [...merged.values()];
}
export function filterShips(
  items: Ship[],
  query = "",
  manufacturer = "",
  concepts = false,
): Ship[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(
    (s) =>
      Number.isFinite(s.cargoCapacitySCU) &&
      s.cargoCapacitySCU > 0 &&
      (concepts ||
        !s.availability ||
        s.availability.toLocaleLowerCase().replace(/-/g, " ") ===
          "flight ready") &&
      (!manufacturer || s.manufacturer === manufacturer) &&
      (!needle ||
        [s.name, s.manufacturer, String(s.cargoCapacitySCU)].some((v) =>
          v.toLocaleLowerCase().includes(needle),
        )),
  );
}
