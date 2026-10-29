import { useOcrStore } from "../../stores/useOcrStore";
import type { CaptureMode } from "../../types/capturePolicy";
export function CapturePolicyControls({
  section = "capture",
}: {
  section?: "capture" | "storage" | "advanced";
}) {
  const { state, busy, configurePolicy, cleanup } = useOcrStore((s) => s);
  if (!state) return null;
  const p = state.policy,
    last = state.lastSuccessful;
  const modes = [
    ["Automatic", "Automatic · prefer Star Citizen window"],
    ["Window", "Star Citizen Window"],
    ["Display", "Full Display"],
  ];
  return (
    <div className="capture-policy-controls">
      {section === "capture" && (
        <>
          <label htmlFor="capture-source">Capture Method</label>
          <select
            id="capture-source"
            value={p.source}
            disabled={busy || state.recording}
            onChange={(e) =>
              void configurePolicy({
                ...p,
                source: e.target.value as CaptureMode,
              })
            }
          >
            {modes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <p className="form-note">
            Window capture targets the verified game window. Full Display
            includes other visible content on that monitor. Window-only capture
            never falls back.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.allowDisplayFallback}
              disabled={busy}
              onChange={(e) =>
                void configurePolicy({
                  ...p,
                  allowDisplayFallback: e.target.checked,
                })
              }
            />
            Allow full-display fallback in Automatic mode
          </label>
          {last && (
            <p className="form-note">
              Last saved:{" "}
              {last.backend === "Window"
                ? "Star Citizen Window"
                : "Full Display"}{" "}
              · {last.width} × {last.height}
              {last.fallback ? " · Fallback used" : ""}
              {last.fallbackReason ? " · " + last.fallbackReason : ""}
            </p>
          )}
          <div className="setting-divider" />
          <h3>Automatic capture · experimental</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.autoEnabled}
              disabled={busy}
              onChange={(e) =>
                void configurePolicy({ ...p, autoEnabled: e.target.checked })
              }
            />
            Capture after a new hauling acceptance
          </label>
          <p className="form-note">
            A delayed screenshot may show a different contract. MissionIds are
            unverified trigger candidates; saving always requires review and
            confirmation.
          </p>
          <label htmlFor="auto-delay">Capture delay</label>
          <select
            id="auto-delay"
            value={p.delaySeconds}
            disabled={busy}
            onChange={(e) =>
              void configurePolicy({
                ...p,
                delaySeconds: Number(e.target.value),
              })
            }
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} seconds
              </option>
            ))}
          </select>
          <label htmlFor="auto-attempts">Maximum attempts</label>
          <select
            id="auto-attempts"
            value={p.maxAttempts}
            disabled={busy}
            onChange={(e) =>
              void configurePolicy({
                ...p,
                maxAttempts: Number(e.target.value),
              })
            }
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          <p className="form-note">
            Live monitoring must be running. At most 20 pending requests; each
            expires after two minutes. Imports never trigger captures. Stopping
            monitoring cancels pending requests.
          </p>
        </>
      )}
      {section === "advanced" && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!p.autoSourceOverride}
              onChange={(e) =>
                void configurePolicy({
                  ...p,
                  autoSourceOverride: e.target.checked,
                })
              }
            />
            Override Capture Method for automatic triggers
          </label>
          <p className="form-note">
            An existing differing automatic source is preserved here during
            migration. Turn the override off to use the shared Capture Method.
          </p>
          <label htmlFor="auto-source">Advanced automatic override</label>
          <select
            id="auto-source"
            value={p.autoSource}
            disabled={busy || !p.autoSourceOverride}
            onChange={(e) =>
              void configurePolicy({
                ...p,
                autoSource: e.target.value as CaptureMode,
              })
            }
          >
            {modes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <details>
            <summary>
              Automatic capture requests ·{" "}
              {
                state.automaticRequests.filter((r) =>
                  ["Pending", "Running"].includes(r.status),
                ).length
              }{" "}
              pending
            </summary>
            <div className="automatic-request-list">
              {state.automaticRequests.map((r) => (
                <p className="form-note" key={r.id}>
                  {r.status} · {r.attempts} attempts · Candidate {r.missionId} ·{" "}
                  {r.message}
                </p>
              ))}
            </div>
          </details>
        </>
      )}
      {section === "storage" && (
        <>
          <div className="setting-divider" />
          <h3>Screenshot retention</h3>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={p.cleanupEnabled}
              disabled={busy}
              onChange={(e) =>
                void configurePolicy({ ...p, cleanupEnabled: e.target.checked })
              }
            />
            Clean up expired screenshots automatically
          </label>
          <label htmlFor="capture-retention">
            Unlinked screenshot retention
          </label>
          <select
            id="capture-retention"
            value={p.unlinkedDays}
            disabled={busy}
            onChange={(e) =>
              void configurePolicy({
                ...p,
                unlinkedDays: Number(e.target.value) as 1 | 7 | 14 | 30,
              })
            }
          >
            {[1, 7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
          <p className="form-note">
            {state.storage.count} captures ·{" "}
            {(state.storage.bytes / 1048576).toFixed(1)} MiB of 512 MiB. Capture
            and OCR work in progress are protected. Contract records and History
            are never deleted by cleanup.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={() => void cleanup()}
          >
            Clean up expired captures now
          </button>
          {state.storage.lastCleanupAt && (
            <p className="form-note">
              Last cleanup: {state.storage.deleted} captures removed.
            </p>
          )}
          {state.storage.errors.map((e, i) => (
            <p className="form-error" key={i}>
              {e}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
