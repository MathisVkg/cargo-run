import {
  LayoutDashboard,
  List,
  History,
  Settings,
  ScanLine,
  Files,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import type { NavigationMode } from "../../utils/navigation";
const entries = [
  { page: "Dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { page: "Manifest", icon: List, label: "Manifest" },
  { page: "Contracts", icon: Files, label: "Contracts" },
  { page: "History", icon: History, label: "History" },
  { page: "Scan Review", icon: ScanLine, label: "Scan History" },
  { page: "Settings", icon: Settings, label: "Settings" },
] as const;
function Item({ entry }: { entry: (typeof entries)[number] }) {
  const page = useCargoStore((s) => s.page),
    setPage = useCargoStore((s) => s.setPage);
  const Icon = entry.icon;
  return (
    <button
      title={entry.label}
      aria-label={entry.label}
      aria-current={page === entry.page ? "page" : undefined}
      className={"nav-item " + (page === entry.page ? "selected" : "")}
      onClick={() => setPage(entry.page)}
    >
      <Icon size={19} />
      <span>{entry.label}</span>
    </button>
  );
}
export function Sidebar({
  mode,
  width,
}: {
  mode: NavigationMode;
  width: number;
}) {
  const setPreferences = useCargoStore((s) => s.setPreferences);
  if (mode === "hidden") return null;
  const canExpand = width >= 1400,
    label = mode === "expanded" ? "Collapse navigation" : "Expand navigation";
  return (
    <aside className={"sidebar " + mode} aria-label={mode + " sidebar"}>
      <p className="sidebar-label">OPERATIONS</p>
      <nav className="sidebar-main-navigation" aria-label="Main navigation">
        <div className="sidebar-primary">
          {entries.slice(0, 5).map((entry) => (
            <Item entry={entry} key={entry.page} />
          ))}
        </div>
        <div className="sidebar-secondary">
          <Item entry={entries[5]} />
          <div className="sidebar-controls">
            <button
              className="icon-button sidebar-mode-toggle"
              aria-label={label}
              title={
                mode === "compact" && !canExpand
                  ? "Expanded navigation requires a wider window"
                  : label
              }
              disabled={mode === "compact" && !canExpand}
              onClick={() =>
                void setPreferences({
                  navigationMode: mode === "expanded" ? "compact" : "expanded",
                })
              }
            >
              {mode === "expanded" ? (
                <PanelLeftClose size={19} />
              ) : (
                <PanelLeftOpen size={19} />
              )}
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
