export interface UiPreferences {
  dashboardView: "location" | "contract";
  favoriteShipIds: string[];
  recentShipIds: string[];
}
export type PreferencesPatch = Partial<
  Pick<UiPreferences, "dashboardView" | "favoriteShipIds">
>;
export const defaultPreferences = (): UiPreferences => ({
  dashboardView: "location",
  favoriteShipIds: [],
  recentShipIds: [],
});
export function validatePreferences(
  input: unknown,
  shipIds: Set<string>,
): PreferencesPatch {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid preferences.");
  const p = input as Record<string, unknown>;
  if (
    Object.keys(p).some(
      (k) => !["dashboardView", "favoriteShipIds"].includes(k),
    )
  )
    throw new Error("Unknown preference.");
  if (
    p.dashboardView !== undefined &&
    p.dashboardView !== "location" &&
    p.dashboardView !== "contract"
  )
    throw new Error("Invalid dashboard view.");
  if (
    p.favoriteShipIds !== undefined &&
    (!Array.isArray(p.favoriteShipIds) ||
      p.favoriteShipIds.length > 500 ||
      p.favoriteShipIds.some(
        (id) => typeof id !== "string" || !shipIds.has(id),
      ) ||
      new Set(p.favoriteShipIds).size !== p.favoriteShipIds.length)
  )
    throw new Error("Invalid favorites.");
  return p as PreferencesPatch;
}
