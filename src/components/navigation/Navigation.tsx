import {
  LayoutDashboard,
  List,
  History,
  Settings,
  ScanLine,
  Files,
} from "lucide-react";
import { Overlay } from "../ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
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
export function Sidebar() {
  return (
    <aside className="sidebar">
      <p className="sidebar-label">OPERATIONS</p>
      <nav aria-label="Main navigation">
        <Items onClose={() => {}} />
      </nav>
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
}: {
  open: boolean;
  onClose(): void;
}) {
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Cargo Run"
      subtitle="FLEET OPERATIONS 2.0"
      side="left"
    >
      <nav aria-label="Temporary navigation">
        <Items onClose={onClose} />
      </nav>
      <div className="nav-footer">Cargo Run / 0.5.0</div>
    </Overlay>
  );
}
