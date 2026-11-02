export type NavigationMode = "expanded" | "compact" | "hidden";
/** Responsive hiding is temporary; opening it at narrow widths always yields compact mode. */
export function navigationModeForWidth(
  width: number,
  preference: NavigationMode,
  narrowOpen = false,
): NavigationMode {
  if (width < 1200) return narrowOpen ? "compact" : "hidden";
  if (preference === "hidden") return "hidden";
  return width < 1400 ? "compact" : preference;
}
