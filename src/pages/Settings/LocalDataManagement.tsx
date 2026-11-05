import { useEffect, useRef, useState } from "react";
import { Database, RefreshCw } from "lucide-react";
import { Overlay } from "../../components/ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import type {
  CleanupMode,
  CleanupPreview,
  LocalDataStats,
  CleanupResult,
} from "../../types/maintenance";
const options = [
  {
    mode: "closed",
    label: "Clear closed contract history",
    detail:
      "Remove completed/abandoned records and their links/audits. Prune their references from retained runs. Keep active contracts; keep captures unlinked.",
  },
  {
    mode: "history",
    label: "Clear contract and run history",
    detail:
      "Also remove finished runs. Keep active contracts, the current run and all configuration. Keep captures unlinked.",
  },
  {
    mode: "reset",
    label: "Reset all local tracking data",
    detail:
      "Remove contracts, runs, captures/images, event history, requests and checkpoints. Keep ships, favorites and configuration. Monitoring stays stopped.",
  },
] as const;
export function LocalDataManagement() {
  const revision = useCargoStore((s) => s.revision);
  const showRetainedInventory = useCargoStore((s) => s.showRetainedInventory);
  const [stats, setStats] = useState<LocalDataStats | null>(null),
    [preview, setPreview] = useState<CleanupPreview | null>(null),
    [resetText, setResetText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<CleanupResult | null>(null);
  const saving = useRef(false);
  const refresh = () =>
    window.cargoRun
      .localDataStats()
      .then(setStats)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    void refresh();
  }, [revision]);
  const open = async (mode: CleanupMode) => {
    setBusy(true);
    setError("");
    try {
      setPreview(await window.cargoRun.previewCleanup(mode));
      setResetText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const execute = async () => {
    if (!preview || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await window.cargoRun.executeCleanup({
        token: preview.token,
        confirmed: true,
        resetText: preview.mode === "reset" ? resetText : undefined,
      });
      setResult(r);
      setStats(r.stats);
      setPreview(null);
    } catch (e) {
      setError(String(e));
      setPreview(null);
      void refresh();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="panel setting-card local-data-management">
      <div className="monitor-heading">
        <h2>
          <Database size={18} /> Local Data Management
        </h2>
        <button
          className="icon-button"
          aria-label="Refresh local data counts"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
        </button>
      </div>
      {stats && (
        <dl className="local-data-counts">
          {[
            ["Total contracts", stats.total],
            ["Active contracts", stats.active],
            ["Completed contracts", stats.completed],
            ["Abandoned contracts", stats.abandoned],
            ["Finished runs", stats.finishedRuns],
            ["Stored OCR captures", stats.captures],
            ["Pending Game.log missions", stats.pendingMissions],
            [
              "Tracking storage (approx.)",
              (stats.trackingBytes / 1048576).toFixed(2) + " MiB",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="form-note">
        Counts come from persisted local tracking data. Storage includes the
        database/WAL and managed capture files; backups are excluded. Total
        includes superseded source records. A consistent database and
        managed-evidence backup is required before each cleanup.
      </p>
      {!!stats?.retainedCargo.contracts && (
        <div className="notice" role="status">
          <p>
            History cleanup is blocked by {stats.retainedCargo.contracts} closed
            contract(s) with {stats.retainedCargo.scu} SCU retained onboard.
          </p>
          <p>
            {stats.retainedCargo.ships
              .map((s) => s.name + ": " + s.scu + " SCU")
              .join(" · ")}
          </p>
          <p>
            Open Cargo Manifest, select the assigned ship, then unload cargo or
            correct its onboard quantity downward. Full reset remains available
            with backup and RESET confirmation.
          </p>
          <button
            className="button"
            disabled={busy}
            onClick={showRetainedInventory}
          >
            Open retained inventory
          </button>
        </div>
      )}
      <div className="local-data-actions">
        {options.map((o) => (
          <div key={o.mode}>
            <div>
              <h3>{o.label}</h3>
              <p className="form-note">{o.detail}</p>
            </div>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => void open(o.mode)}
            >
              {o.label}
            </button>
          </div>
        ))}
      </div>
      {result && (
        <div role="status" className="notice">
          <p>
            {result.message}
            <br />
            Backup: <span className="log-path">{result.backupPath}</span>
            {result.warnings.map((w, i) => (
              <span key={i} className="warning-text">
                <br />
                {w}
              </span>
            ))}
          </p>
        </div>
      )}
      {!result && stats?.lastBackup && (
        <p className="form-note">
          Last cleanup backup:{" "}
          <span className="log-path">{stats.lastBackup}</span>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Overlay
        open={!!preview}
        onClose={() => {
          if (!saving.current) setPreview(null);
        }}
        title={
          preview?.mode === "reset"
            ? "Reset all local tracking data?"
            : "Confirm local history cleanup"
        }
        subtitle="BACKUP REQUIRED"
        side="center"
      >
        {preview && (
          <>
            <div className="dialog-body">
              <p>{preview.description}</p>
              <dl className="cleanup-impact">
                <div>
                  <dt>Contracts affected</dt>
                  <dd>{preview.contracts}</dd>
                </div>
                <div>
                  <dt>Runs affected</dt>
                  <dd>{preview.runs}</dd>
                </div>
                <div>
                  <dt>Captures affected</dt>
                  <dd>
                    {preview.captures}{" "}
                    {preview.mode === "reset"
                      ? "removed"
                      : "unlinked; records/images retained"}
                  </dd>
                </div>
                <div>
                  <dt>Links / review audits removed</dt>
                  <dd>
                    {preview.links} / {preview.audits}
                  </dd>
                </div>
                <div>
                  <dt>Run references pruned</dt>
                  <dd>{preview.runReferences}</dd>
                </div>
                <div>
                  <dt>Automatic request records</dt>
                  <dd>
                    {preview.automaticRequests}{" "}
                    {preview.mode === "reset"
                      ? "removed"
                      : "retained; pending work canceled"}
                  </dd>
                </div>
              </dl>
              <p>
                <strong>
                  {preview.preservesActive
                    ? "Active contracts will be preserved."
                    : "Active contracts will be removed."}
                </strong>{" "}
                {preview.stopsMonitoring
                  ? "Monitoring will remain stopped until you explicitly start it."
                  : "Monitoring pauses during cleanup and resumes if it was running."}
              </p>
              <p>
                Ships, favorites, navigation, OCR/capture/shortcut settings and
                Game.log path are preserved. The actual Game.log file is never
                modified.
              </p>
              <p>
                A unique backup is saved outside cleanup targets. If backup
                fails, cleanup is canceled. Recovery requires restoring the
                database and evidence together with Cargo Run closed; there is
                no one-click undo or guaranteed filesystem rollback.
              </p>
              {preview.mode === "reset" && (
                <label>
                  Type RESET to confirm
                  <input
                    autoComplete="off"
                    value={resetText}
                    onChange={(e) => setResetText(e.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
            </div>
            <div className="dialog-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                disabled={
                  busy || (preview.mode === "reset" && resetText !== "RESET")
                }
                onClick={() => void execute()}
              >
                {busy
                  ? "Backing up and cleaning…"
                  : preview.mode === "reset"
                    ? "Confirm reset"
                    : "Confirm cleanup"}
              </button>
            </div>
          </>
        )}
      </Overlay>
    </section>
  );
}
