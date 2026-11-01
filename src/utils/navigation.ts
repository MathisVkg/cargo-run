export type NavigationMode = "expanded" | "compact" | "hidden";
/** A narrow viewport constrains layout without overwriting the saved wide preference. */
export function navigationModeForWidth(
  width: number,
  preference: NavigationMode,
): NavigationMode {
  if (width < 1100 || preference === "hidden") return "hidden";
  if (width < 1400) return "compact";
  return preference;
}
