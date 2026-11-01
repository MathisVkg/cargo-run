import {
  LayoutDashboard,
  List,
  History,
  Settings,
  ScanLine,
  Files,
  PanelLeftClose,
  PanelLeftOpen,
  EyeOff,
} from "lucide-react";
import { Overlay } from "../ui/Overlay";
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
function Items({ onClose }: { onClose(): void }) {
  const page = useCargoStore((s) => s.page),
    setPage = useCargoStore((s) => s.setPage);
  return (
    <>
      {entries.map(({ page: target, icon: Icon, label }) => (
        <button
          key={target}
          title={label}
          aria-label={label}
          aria-current={page === target ? "page" : undefined}
          className={"nav-item " + (page === target ? "selected" : "")}
          onClick={() => {
            setPage(target);
            onClose();
          }}
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </>
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
  return (
    <aside className={"sidebar " + mode} aria-label={mode + " sidebar"}>
      <p className="sidebar-label">OPERATIONS</p>
      <nav aria-label="Main navigation">
        <Items onClose={() => {}} />
      </nav>
      <div className="sidebar-controls">
        <button
          className="nav-item sidebar-control"
          aria-label={
            mode === "expanded" ? "Collapse navigation" : "Hide navigation"
          }
          title={
            mode === "expanded" ? "Collapse navigation" : "Hide navigation"
          }
          onClick={() =>
            void setPreferences({
              navigationMode: mode === "expanded" ? "compact" : "hidden",
            })
          }
        >
          {mode === "expanded" ? (
            <PanelLeftClose size={19} />
          ) : (
            <EyeOff size={19} />
          )}
          <span>
            {mode === "expanded" ? "Collapse navigation" : "Hide navigation"}
          </span>
        </button>
        {mode === "compact" && width >= 1400 && (
          <button
            className="nav-item sidebar-control"
            aria-label="Expand navigation"
            title="Expand navigation"
            onClick={() => void setPreferences({ navigationMode: "expanded" })}
          >
            <PanelLeftOpen size={19} />
            <span>Expand navigation</span>
          </button>
        )}
      </div>
      <p className="sidebar-foot">
        LOCAL COMPANION
        <br />
        Fleet Operations 2.0
      </p>
    </aside>
  );
}
export function Navigation({
  open,
  onClose,
  width,
}: {
  open: boolean;
  onClose(): void;
  width: number;
}) {
  const setPreferences = useCargoStore((s) => s.setPreferences);
  const pin = (mode: NavigationMode) => {
    void setPreferences({ navigationMode: mode });
    onClose();
  };
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Cargo Run"
      subtitle="FLEET OPERATIONS 2.0"
      side="left"
      dismissOnOutside
    >
      <nav aria-label="Temporary navigation">
        <Items onClose={onClose} />
      </nav>
      <div className="navigation-pinning">
        {width >= 1400 && (
          <button className="button" onClick={() => pin("expanded")}>
            Show expanded sidebar
          </button>
        )}
        {width >= 1100 && (
          <button className="button" onClick={() => pin("compact")}>
            Show compact sidebar
          </button>
        )}
      </div>
      <div className="nav-footer">Cargo Run / 0.5.3</div>
    </Overlay>
  );
}
