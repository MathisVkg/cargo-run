import { useEffect, useState } from "react";
import { Box, Plus, Minus, Square, Copy, X } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { ShipSelector } from "../ships/ShipSelector";
export function TopBar() {
  const openEditor = useCargoStore((s) => s.openEditor);
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void window.cargoRun.isMaximized().then(setMaximized);
    return window.cargoRun.onMaximized(setMaximized);
  }, []);
  return (
    <header className="topbar">
      <div className="brand">
        <Box className="brand-mark" size={24} />
        <strong>Cargo Run</strong>
      </div>
      <div className="top-right">
        <ShipSelector />
        <button
          className="button primary top-add"
          aria-label="Add Contract"
          onClick={() => openEditor()}
        >
          <Plus size={16} />
          <span>Add Contract</span>
        </button>
        <div className="window-controls">
          <button
            aria-label="Minimize"
            onClick={() => void window.cargoRun.minimize()}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label={maximized ? "Restore window" : "Maximize"}
            onClick={() => void window.cargoRun.toggleMaximize()}
          >
            {maximized ? <Copy size={14} /> : <Square size={14} />}
          </button>
          <button
            className="close-window"
            aria-label="Close Cargo Run"
            onClick={() => void window.cargoRun.close()}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
