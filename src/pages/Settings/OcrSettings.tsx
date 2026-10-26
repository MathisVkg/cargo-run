import { useEffect, useState } from "react";
import { ScanLine, Camera, RefreshCw, Trash2, Keyboard } from "lucide-react";
import { useOcrStore } from "../../stores/useOcrStore";
import { useCargoStore } from "../../stores/useCargoStore";
import { Badge } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
export function OcrSettings() {
  const { state, error, busy, configure, capture, clear, displays } =
      useOcrStore((s) => s),
    setPage = useCargoStore((s) => s.setPage);
  const [shortcut, setShortcut] = useState(""),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (state) setShortcut(state.settings.accelerator);
  }, [state?.settings.accelerator]);
  if (!state)
    return (
      <section className="panel setting-card">
        <h2>OCR prototype</h2>
        <p>{error ?? "Loading local OCR capability…"}</p>
      </section>
    );
  const s = state.settings;
  return (
    <section className="panel setting-card ocr-settings">
      <div className="setting-icon">
        <ScanLine size={21} />
      </div>
      <div className="monitor-heading">
        <h2>Windows capture & OCR prototype</h2>
        <Badge tone={state.engine.available ? "green" : "red"}>
          {state.engine.available ? "Engine available" : "Engine unavailable"}
        </Badge>
      </div>
      <p>
        {state.engine.name}. Screenshots are observations for review and never
        create or update contracts.
      </p>
      {!state.engine.available && (
        <p className="form-error">{state.engine.error}</p>
      )}
      <div className="ocr-settings-grid">
        <div>
          <label htmlFor="ocr-shortcut">
            <Keyboard size={14} />
            Global shortcut
          </label>
          <div className="monitor-buttons">
            <input
              id="ocr-shortcut"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              maxLength={80}
            />
            <button
              className="button"
              disabled={busy}
              onClick={() => void configure({ ...s, accelerator: shortcut })}
            >
              Save shortcut
            </button>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.enabled}
              disabled={busy}
              onChange={(e) =>
                void configure({ ...s, enabled: e.target.checked })
              }
            />
            Enable global capture shortcut
          </label>
          <p className="form-note">
            <Badge
              tone={state.registered ? "green" : s.enabled ? "red" : "neutral"}
            >
              {state.registered
                ? "Registered"
                : s.enabled
                  ? "Registration failed"
                  : "Disabled"}
            </Badge>
          </p>
          {state.shortcutError && (
            <p className="form-error">{state.shortcutError}</p>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={s.sounds}
              disabled={busy}
              onChange={(e) =>
                void configure({ ...s, sounds: e.target.checked })
              }
            />
            Capture confirmation sounds
          </label>
          <p className="form-note">
            A short tone confirms a saved screenshot. A warning tone indicates
            capture failure. Neither sound reports OCR accuracy.
          </p>
        </div>
        <div>
          <label htmlFor="capture-display">Capture display</label>
          <select
            id="capture-display"
            value={s.displayId}
            disabled={busy}
            onChange={(e) =>
              void configure({ ...s, displayId: e.target.value })
            }
          >
            <option value="auto">Automatic · Star Citizen display</option>
            {state.displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.width} × {d.height}
              </option>
            ))}
            {s.displayId !== "auto" &&
              !state.displays.some((d) => d.id === s.displayId) && (
                <option value={s.displayId}>
                  Disconnected display · {s.displayId}
                </option>
              )}
          </select>
          <p className="form-note">
            Automatic targets Star Citizen’s foreground window, or its only
            visible window. Select a display explicitly for a desktop test. Full
            displays are captured, including any other visible content.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void displays()}
          >
            <RefreshCw size={14} />
            Refresh displays
          </button>
          {state.captureError && (
            <p className="form-error" role="alert">
              {state.captureError}
            </p>
          )}
        </div>
      </div>
      <div className="setting-divider" />
      <div className="monitor-buttons">
        <button
          className="button primary"
          disabled={busy || !state.captureAvailable}
          onClick={() => void capture()}
        >
          <Camera size={15} />
          Capture selected display
        </button>
        <button className="button" onClick={() => setPage("Scan Review")}>
          <ScanLine size={15} />
          Open Scan Review
        </button>
        <button
          className="button"
          disabled={busy || !state.captures.length}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} />
          Clear stored captures
        </button>
      </div>
      <p className="form-note">
        {state.captures.length} / {state.limit} stored · {state.queued} queued ·{" "}
        {state.processing ? "OCR processing" : "OCR idle"} · at most 12 pending
        and 512 MiB storage.
      </p>
      <div className="log-path">{state.storagePath}</div>
      {state.lastCapture && (
        <p
          className={state.lastCapture.success ? "form-note" : "form-error"}
          role="status"
        >
          {state.lastCapture.message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Overlay
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear stored captures?"
        subtitle="OCR OBSERVATIONS ONLY"
        side="center"
      >
        <div className="dialog-body">
          <p>
            This deletes screenshot files and OCR observations. Existing
            contracts, Game.log events and run history are unaffected. In-flight
            recognition results for deleted captures will be discarded.
          </p>
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              setConfirm(false);
              void clear();
            }}
          >
            Confirm clear captures
          </button>
        </div>
      </Overlay>
    </section>
  );
}
