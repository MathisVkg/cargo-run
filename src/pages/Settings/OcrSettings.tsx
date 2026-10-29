import { useState } from "react";
import { useOcrStore } from "../../stores/useOcrStore";
import { useCargoStore } from "../../stores/useCargoStore";
import { Badge } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { CapturePolicyControls } from "./CapturePolicyControls";
import { ShortcutControls } from "./ShortcutControls";
export function OcrSettings({
  section = "capture",
}: {
  section?: "capture" | "storage" | "advanced";
}) {
  const { state, error, busy, configure, capture, clear, displays } =
    useOcrStore((s) => s);
  const setPage = useCargoStore((s) => s.setPage),
    [confirm, setConfirm] = useState(false);
  if (!state) return <p>{error ?? "Loading OCR capability…"}</p>;
  const s = state.settings;
  const mayCaptureDisplay = (mode: string) =>
    mode === "Display" ||
    (mode === "Automatic" && state.policy.allowDisplayFallback);
  const showDisplay =
    mayCaptureDisplay(state.policy.source) ||
    (state.policy.autoSourceOverride &&
      mayCaptureDisplay(state.policy.autoSource));
  if (section === "advanced")
    return (
      <div className="advanced-settings">
        <p>
          OCR provider: {state.engine.name} ·{" "}
          {state.engine.available ? "Available" : "Unavailable"}
        </p>
        <p>
          Capture status:{" "}
          {state.captureError ??
            state.lastCapture?.message ??
            "No recent error"}
        </p>
        <ShortcutControls diagnosticsOnly />
        <CapturePolicyControls section="advanced" />
        <p className="form-note">
          Parser boxes, raw OCR and recognition warnings are available in Scan
          Review. Experimental input backends remain development-only and
          unchanged.
        </p>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  if (section === "storage")
    return (
      <>
        <CapturePolicyControls section="storage" />
        <p className="log-path">{state.storagePath}</p>
        <div className="setting-divider" />
        <h3>Remove stored captures</h3>
        <p className="form-note">
          Deletes screenshot files and capture records. Contracts, linked text
          evidence and review audit remain. This is separate from automatic
          retention.
        </p>
        <button
          className="button danger"
          disabled={busy || !state.captures.length}
          onClick={() => setConfirm(true)}
        >
          Clear stored captures
        </button>
        <Overlay
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Clear stored captures?"
          subtitle="LOCAL SCREENSHOTS & OCR"
          side="center"
        >
          <div className="dialog-body">
            <p>
              Remove all stored screenshot files and raw OCR observations?
              Contracts, minimal evidence, review audit and run history remain.
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
      </>
    );
  return (
    <section className="panel setting-card ocr-settings">
      <div className="monitor-heading">
        <h2>OCR &amp; Capture</h2>
        <Badge tone={state.engine.available ? "green" : "red"}>
          {state.engine.available ? "Engine available" : "Engine unavailable"}
        </Badge>
      </div>
      <p>
        Capture a contract, review and correct its fields, then confirm saving.
        Works without Game.log monitoring.
      </p>
      {!state.engine.available && (
        <p className="form-error">{state.engine.error}</p>
      )}
      <div className="ocr-settings-grid">
        <div>
          <CapturePolicyControls />
          {showDisplay && (
            <>
              <label htmlFor="capture-display">
                Display for Full Display / fallback
              </label>
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
                Full Display includes other visible content on that monitor.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() => void displays()}
              >
                Refresh displays
              </button>
            </>
          )}
        </div>
        <div>
          <ShortcutControls />
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
            A saved screenshot tone does not confirm OCR accuracy.
          </p>
        </div>
      </div>
      {state.policy.autoSourceOverride && (
        <p className="notice warning">
          Automatic capture uses a preserved source override. Review it in
          Advanced &amp; Diagnostics.
        </p>
      )}
      <div className="monitor-buttons">
        <button
          className="button primary"
          disabled={busy || state.recording || !state.captureAvailable}
          onClick={() => void capture()}
        >
          Capture now
        </button>
        <button className="button" onClick={() => setPage("Scan Review")}>
          Open Scan Review
        </button>
      </div>
      <p className="form-note">
        {state.captures.length} / {state.limit} stored · {state.queued} queued ·{" "}
        {state.processing ? "OCR processing" : "OCR idle"}
      </p>
      {state.captureError && (
        <p className="form-error" role="alert">
          {state.captureError}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
