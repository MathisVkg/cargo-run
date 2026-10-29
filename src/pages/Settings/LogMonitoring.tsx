import { useState } from "react";
import {
  FileText,
  Radio,
  FolderOpen,
  Play,
  Square,
  Download,
  Activity,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { Badge } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { date } from "../../utils/format";
export function LogMonitoring({
  diagnosticsOnly = false,
}: {
  diagnosticsOnly?: boolean;
}) {
  const tracking = useCargoStore((s) => s.tracking),
    choose = useCargoStore((s) => s.chooseLog),
    start = useCargoStore((s) => s.startMonitoring),
    stop = useCargoStore((s) => s.stopMonitoring),
    importHistory = useCargoStore((s) => s.importHistory),
    pending = useCargoStore((s) => s.pending),
    sample = useCargoStore((s) => s.sampleMode);
  const [confirm, setConfirm] = useState(false),
    [errorsOnly, setErrorsOnly] = useState(false);
  const events = tracking.events.filter(
    (e) => !errorsOnly || e.kind === "Error",
  );
  const busy = pending > 0 || tracking.importing;
  return (
    <>
      <section className="panel setting-card log-config">
        {!diagnosticsOnly && (
          <>
            <div className="setting-icon">
              <FileText size={21} />
            </div>
            <div className="monitor-heading">
              <h2>Game.log Monitoring</h2>
              <Badge
                tone={
                  tracking.status === "ONLINE"
                    ? "green"
                    : tracking.status === "ERROR"
                      ? "red"
                      : "neutral"
                }
              >
                {tracking.status}
              </Badge>
            </div>
            <p>
              Optional mission-event enrichment for identity, acceptance time,
              objectives and completion. OCR contract creation works without
              monitoring. Select Game.log to monitor new events or explicitly
              import history.
            </p>
            <div className="log-path" title={tracking.path ?? undefined}>
              {tracking.path ?? "No Game.log selected"}
            </div>
            <div className="monitor-buttons">
              <button
                className="button"
                disabled={busy}
                onClick={() => void choose()}
              >
                <FolderOpen size={14} />
                Select Game.log
              </button>
              <button
                className="button primary"
                disabled={busy || !tracking.path || tracking.enabled || sample}
                onClick={() => void start()}
              >
                <Play size={14} />
                Start monitoring
              </button>
              <button
                className="button"
                disabled={busy || !tracking.enabled}
                onClick={() => void stop()}
              >
                <Square size={13} />
                Stop monitoring
              </button>
              <button
                className="button"
                disabled={busy || !tracking.path || sample}
                onClick={() => setConfirm(true)}
              >
                <Download size={14} />
                {tracking.importing ? "Importing…" : "Import existing history"}
              </button>
            </div>
            <p className="form-note">
              <Radio size={12} /> ONLINE means the file is readable and
              monitored. It does not indicate that Star Citizen is running.
              First start skips existing contents; saved checkpoints resume
              unread bytes after restart or a monitoring pause.
            </p>
            {sample && (
              <p className="form-error">
                Remove sample contracts before tracking or importing real
                missions.
              </p>
            )}
            {tracking.error && (
              <p className="form-error" role="alert">
                {tracking.error}
              </p>
            )}
            <div className="setting-divider" />
          </>
        )}
        {diagnosticsOnly && (
          <>
            <h3>
              <Activity size={16} />
              Parser diagnostics
            </h3>
            <div className="diagnostic-stats">
              <span>
                <strong>{tracking.accepted}</strong>Accepted missions
              </span>
              <span>
                <strong>{tracking.objectives}</strong>Objective events
              </span>
              <span>
                <strong>{tracking.completed}</strong>Completion events
              </span>
              <span>
                <strong>{tracking.parsingErrors}</strong>Parsing errors
              </span>
              <span>
                <strong>{tracking.unresolved}</strong>Unresolved events
              </span>
            </div>
            <p className="form-note">
              Last event received:{" "}
              {tracking.lastEventAt ? date(tracking.lastEventAt) : "None yet"} ·
              Duplicate semantic notifications are counted once. Only the three
              supplied notification formats are recognized.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              Show parsing failures only
            </label>
            <div className="diagnostic-events">
              {events.length ? (
                events.map((e) => (
                  <details key={e.id} className="diagnostic-event">
                    <summary>
                      <Badge
                        tone={
                          e.kind === "Error"
                            ? "red"
                            : e.unresolved
                              ? "amber"
                              : "neutral"
                        }
                      >
                        {e.kind}
                      </Badge>
                      <span>{e.message}</span>
                      <time>{date(e.receivedAt)}</time>
                    </summary>
                    <dl>
                      <dt>Received</dt>
                      <dd>{date(e.receivedAt)}</dd>
                      <dt>Log timestamp</dt>
                      <dd>
                        {e.eventAt
                          ? date(e.eventAt)
                          : "Not available · receipt time used"}
                      </dd>
                      <dt>MissionId</dt>
                      <dd>{e.missionId ?? "Unavailable"}</dd>
                      <dt>Source</dt>
                      <dd>
                        {e.mode} · {e.sourcePath}
                      </dd>
                      {e.unresolved && (
                        <>
                          <dt>Association</dt>
                          <dd>
                            Waiting for a matching acceptance notification
                          </dd>
                        </>
                      )}
                    </dl>
                    <pre>{e.raw || "No raw line available."}</pre>
                  </details>
                ))
              ) : (
                <p className="form-note">
                  {errorsOnly
                    ? "No parsing failures in the recent diagnostic history."
                    : "No mission notifications received yet."}
                </p>
              )}
            </div>
            <p className="form-note">
              Recent diagnostic history is bounded to 200 events; raw lines are
              limited to 16 KiB. Event identifiers and unresolved association
              data remain in SQLite for replay safety.
            </p>
          </>
        )}
      </section>
      <Overlay
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Import existing Game.log history?"
        subtitle="EXPLICIT HISTORY IMPORT"
        side="center"
      >
        <div className="dialog-body">
          <p>
            This reads the selected file from its beginning. Old accepted
            missions may appear as active if their completion notification is
            absent. Existing MissionIds and event identifiers prevent
            duplicates.
          </p>
          <p>
            The file is only read. No Game.log contents will be changed. Import
            ends at the file size captured when it starts.
          </p>
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={async () => {
              setConfirm(false);
              try {
                await importHistory();
              } catch {
                /* Error banner and diagnostics show failures. */
              }
            }}
          >
            Confirm import
          </button>
        </div>
      </Overlay>
    </>
  );
}
