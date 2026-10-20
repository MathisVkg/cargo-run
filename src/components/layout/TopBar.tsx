import { useEffect, useState } from "react";
import {
  Menu,
  Box,
  Minus,
  Square,
  Copy,
  X,
  ChevronDown,
  Rocket,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
export function TopBar({ onMenu }: { onMenu(): void }) {
  const shipId = useCargoStore((s) => s.selectedShipId);
  const selectShip = useCargoStore((s) => s.selectShip);
  const ships = useCargoStore((s) => s.ships);
  const tracking = useCargoStore((s) => s.tracking);
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void window.cargoRun?.isMaximized().then(setMaximized);
    return window.cargoRun?.onMaximized(setMaximized);
  }, []);
  return (
    <header className="topbar">
      <div className="brand">
        <button
          aria-label="Open navigation"
          className="icon-button"
          onClick={onMenu}
        >
          <Menu size={20} />
        </button>
        <Box className="brand-mark" size={25} />
        <strong>Cargo Run</strong>
        <span className="brand-separator" />
        <span className="top-label">FLEET OPERATIONS</span>
      </div>
      <div className="top-right">
        <div className="ship-picker">
          <Rocket size={16} />
          <label className="sr-only" htmlFor="ship">
            Selected ship
          </label>
          <select
            id="ship"
            value={shipId}
            onChange={(e) => selectShip(e.target.value)}
          >
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.cargoCapacitySCU} SCU
              </option>
            ))}
          </select>
          <ChevronDown size={13} />
        </div>
        <span
          className={"connection " + tracking.status.toLowerCase()}
          title="ONLINE means the file is accessible and monitored; it does not mean Star Citizen is running."
        >
          <i />
          GAME.LOG <strong>{tracking.status}</strong>
        </span>
        <div className="window-controls">
          <button
            aria-label="Minimize"
            onClick={() => void window.cargoRun?.minimize()}
          >
            <Minus size={16} />
          </button>
          <button
            aria-label={maximized ? "Restore window" : "Maximize"}
            onClick={() => void window.cargoRun?.toggleMaximize()}
          >
            {maximized ? <Copy size={14} /> : <Square size={14} />}
          </button>
          <button
            className="close-window"
            aria-label="Close Cargo Run"
            onClick={() => void window.cargoRun?.close()}
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
