import { useEffect, useState } from "react";
import { Menu, Box, Minus, Square, Copy, X } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { useOcrStore } from "../../stores/useOcrStore";
import { ShipSelector } from "../ships/ShipSelector";
export function TopBar({ onMenu }: { onMenu(): void }) {
  const ocr = useOcrStore((s) => s.state);
  const setPage = useCargoStore((s) => s.setPage);
  const tracking = useCargoStore((s) => s.tracking);
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    void window.cargoRun?.isMaximized().then(setMaximized);
    return window.cargoRun?.onMaximized(setMaximized);
  }, []);
  const [captureFresh, setCaptureFresh] = useState(false);
  useEffect(() => {
    const remaining = ocr?.lastCapture
      ? Math.max(0, 5000 - (Date.now() - Date.parse(ocr.lastCapture.at)))
      : 0;
    setCaptureFresh(remaining > 0);
    const timer = setTimeout(() => setCaptureFresh(false), remaining);
    return () => clearTimeout(timer);
  }, [ocr?.lastCapture?.at]);
  return (
    <header className="topbar">
      <div className="brand">
        <button
          aria-label="Open navigation"
          className="icon-button navigation-toggle"
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
        <button
          className={
            "capture-indicator " +
            (captureFresh && ocr?.lastCapture?.success === false
              ? "capture-failed"
              : captureFresh && ocr?.lastCapture?.success
                ? "capture-success"
                : "")
          }
          onClick={() => setPage("Scan Review")}
          title={ocr?.lastCapture?.message ?? "Open Scan History"}
        >
          {captureFresh && ocr?.lastCapture?.success === false
            ? "Capture failed"
            : ocr?.processing
              ? "OCR processing"
              : ocr?.queued
                ? ocr.queued + " queued"
                : captureFresh && ocr?.lastCapture?.success
                  ? "Capture saved"
                  : !ocr
                    ? "OCR loading"
                    : !ocr.engine.available
                      ? "OCR unavailable"
                      : "OCR ready"}
        </button>
        <ShipSelector />
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
