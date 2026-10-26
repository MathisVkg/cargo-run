import {
  LayoutDashboard,
  List,
  History,
  Settings,
  ScanLine,
  ArrowUpRight,
  Box,
} from "lucide-react";
import { Overlay } from "../ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import type { Page } from "../../types/models";
const entries = [
  { page: "Dashboard", icon: LayoutDashboard, detail: "Current operations" },
  { page: "Manifest", icon: List, detail: "Cargo & delivery stops" },
  { page: "History", icon: History, detail: "Contracts & closed runs" },
  { page: "Scan Review", icon: ScanLine, detail: "Local OCR observations" },
  { page: "Settings", icon: Settings, detail: "Application configuration" },
] as const;
export function Navigation({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const page = useCargoStore((s) => s.page);
  const setPage = useCargoStore((s) => s.setPage);
  const navigate = (target: Page) => {
    setPage(target);
    onClose();
  };
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Cargo Run"
      subtitle="FLEET OPERATIONS"
      side="left"
    >
      <nav aria-label="Main navigation">
        {entries.map(({ page: item, icon: Icon, detail }) => (
          <button
            key={item}
            className={"nav-item " + (item === page ? "selected" : "")}
            aria-current={item === page ? "page" : undefined}
            onClick={() => navigate(item)}
          >
            <Icon size={20} />
            <span>
              <strong>{item}</strong>
              <small>{detail}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </nav>
      <div className="nav-footer">
        <Box size={19} />
        <span>
          Cargo Run <span className="muted">/ 0.3.2</span>
          <small>Local desktop companion</small>
        </span>
      </div>
    </Overlay>
  );
}
