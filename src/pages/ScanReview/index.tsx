import { useEffect, useState } from "react";
import { Camera, RefreshCw, Trash2, Expand, ScanLine } from "lucide-react";
import { PageHeader, Badge, EmptyState } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { useOcrStore, captureImage } from "../../stores/useOcrStore";
import { useCargoStore } from "../../stores/useCargoStore";
import { date, number } from "../../utils/format";
import type { Field } from "../../types/ocr";
function Extracted<T>({ label, field }: { label: string; field: Field<T> }) {
  return (
    <div className="extracted-field">
      <span>{label}</span>
      <strong>{field.value === null ? "Unknown" : String(field.value)}</strong>
      <small>
        <Badge
          tone={
            field.state === "Recognized"
              ? "green"
              : field.state === "Ambiguous"
                ? "amber"
                : "neutral"
          }
        >
          {field.state}
        </Badge>{" "}
        {field.method}
        {field.confidence !== null
          ? " · engine confidence " + field.confidence.toFixed(1)
          : ""}
      </small>
      {field.evidence && (
        <details>
          <summary>Source evidence</summary>
          <small>
            {field.evidence.region}
            {field.evidence.box
              ? " · x " +
                Math.round(field.evidence.box.x) +
                ", y " +
                Math.round(field.evidence.box.y)
              : ""}
          </small>
          <pre>{field.evidence.text}</pre>
        </details>
      )}
    </div>
  );
}
export default function ScanReview() {
  const { state, error, busy, capture, retry, remove, clear, reparse } =
      useOcrStore((s) => s),
    setPage = useCargoStore((s) => s.setPage);
  const [id, setId] = useState<string | null>(null),
    [large, setLarge] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!state) return;
    if (!state.captures.some((c) => c.id === id))
      setId(state.captures.at(-1)?.id ?? null);
  }, [state?.captures, id]);
  const [imageError, setImageError] = useState(false);
  const selected = state?.captures.find((c) => c.id === id),
    observation = selected?.observation;
  useEffect(() => setImageError(false), [selected?.id]);
  return (
    <>
      <PageHeader
        eyebrow="OBSERVATIONS / OCR PROTOTYPE"
        title="Scan Review"
        description="Inspect captured screens and local OCR. Nothing here changes your contracts."
      >
        <button
          className="button"
          disabled={busy || !state?.captures.length}
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={14} />
          Clear captures
        </button>
        <button
          className="button primary"
          disabled={busy || state?.recording || !state?.captureAvailable}
          onClick={() => void capture()}
        >
          <Camera size={15} />
          Capture now
        </button>
      </PageHeader>
      <div className="notice scan-notice">
        <ScanLine size={18} />
        <p>
          Prototype observations only. Captures can be incomplete or
          misrecognized. OCR does not create contracts, confirm acceptance, or
          reconcile Game.log IDs.
        </p>
        <button className="button" onClick={() => setPage("Settings")}>
          OCR Settings
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!state?.captures.length ? (
        <section className="panel">
          <EmptyState
            title="No captures yet"
            description="Focus a contract in Star Citizen and press the registered shortcut. Choose a capture source in Settings; use Full Display with an explicit monitor for a desktop test."
          />
        </section>
      ) : (
        <div className="scan-layout">
          <aside className="panel capture-list" aria-label="Captured screens">
            {[...state.captures].reverse().map((c) => (
              <button
                className={"capture-item " + (c.id === id ? "selected" : "")}
                key={c.id}
                onClick={() => setId(c.id)}
              >
                {c.screenshot ? (
                  <img
                    src={captureImage(c.id, true)}
                    alt={"Capture " + date(c.capturedAt)}
                  />
                ) : (
                  <span className="capture-placeholder">
                    <Camera size={24} />
                  </span>
                )}
                <span>
                  <strong>
                    {c.observation?.title.value ??
                      "Capture " + c.id.slice(0, 8)}
                  </strong>
                  <small>{date(c.capturedAt)}</small>
                  <Badge
                    tone={
                      c.validation === "Duplicate" ||
                      c.validation === "Cancelled"
                        ? "neutral"
                        : c.status === "Failed"
                          ? "red"
                          : c.status === "Processed"
                            ? "green"
                            : "amber"
                    }
                  >
                    {c.validation === "Duplicate" ||
                    c.validation === "Cancelled"
                      ? "Skipped"
                      : c.status}
                  </Badge>
                </span>
              </button>
            ))}
          </aside>
          <section className="scan-detail">
            {selected && (
              <>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {selected.observation?.title.value ??
                          "Capture " + selected.id.slice(0, 8)}
                      </h2>
                      <p>
                        {date(selected.capturedAt)} · {selected.source} ·{" "}
                        {selected.displayLabel ?? "Display unresolved"} ·{" "}
                        {selected.width ?? "—"} × {selected.height ?? "—"}
                      </p>
                    </div>
                    <div className="monitor-buttons">
                      {selected.result && (
                        <button
                          className="button"
                          disabled={busy}
                          onClick={() => void reparse(selected.id)}
                        >
                          Reprocess saved OCR
                        </button>
                      )}
                      {selected.status === "Failed" && (
                        <button
                          className="button"
                          disabled={busy || !selected.screenshot}
                          onClick={() => void retry(selected.id)}
                        >
                          <RefreshCw size={14} />
                          Retry OCR
                        </button>
                      )}
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void remove(selected.id)}
                      >
                        <Trash2 size={14} />
                        Delete capture
                      </button>
                    </div>
                  </div>
                  <div className="capture-metadata">
                    <p>
                      Origin:{" "}
                      {selected.source === "Automatic"
                        ? "Automatic Game.log trigger"
                        : selected.source === "Shortcut"
                          ? "Global shortcut"
                          : "Manual button"}{" "}
                      · Capture method: {selected.backend ?? "Display (legacy)"}{" "}
                      · {selected.width ?? "—"} × {selected.height ?? "—"}
                      {selected.fallback ? " · Full-display fallback used" : ""}
                    </p>
                    {selected.fallbackReason && (
                      <p className="notice warning">
                        {selected.fallbackReason}
                      </p>
                    )}
                    {selected.trigger && (
                      <div className="notice warning capture-trigger">
                        <strong>
                          Unverified trigger candidate · not a contract
                          association
                        </strong>
                        <p>MissionId: {selected.trigger.candidateMissionId}</p>
                        <p>
                          {selected.trigger.eventType} ·{" "}
                          {date(selected.trigger.eventAt)} ·{" "}
                          {selected.trigger.delaySeconds}s configured delay ·
                          capture attempt {selected.trigger.attempt}
                        </p>
                        <p>
                          Validation: {selected.validation ?? "Pending"} ·{" "}
                          {selected.validationMessage ??
                            "The captured contract may differ from the trigger."}
                        </p>
                      </div>
                    )}
                    <p className="form-note">
                      Screenshot expiry:{" "}
                      {selected.expiresAt
                        ? date(selected.expiresAt)
                        : "Protected or unavailable"}
                      .
                    </p>
                  </div>
                  {selected.screenshot && !imageError ? (
                    <button
                      className="screenshot-preview"
                      onClick={() => setLarge(true)}
                      aria-label="Inspect full screenshot"
                    >
                      <img
                        src={captureImage(selected.id)}
                        alt="Saved contract screenshot"
                        onError={() => setImageError(true)}
                      />
                      <span>
                        <Expand size={14} />
                        Inspect screenshot
                      </span>
                    </button>
                  ) : (
                    <EmptyState
                      title={
                        selected.status === "Failed" || imageError
                          ? "Screenshot unavailable"
                          : "Saving screenshot…"
                      }
                      description={
                        imageError
                          ? "Stored screenshot is missing or cannot be decoded. OCR text remains available; capture the screen again."
                          : (selected.error ??
                            "Capture is independent from OCR processing.")
                      }
                    />
                  )}
                  <div className="panel-footer">
                    <span>
                      Capture: {selected.screenshot ? "Saved" : "Unavailable"} ·
                      OCR: {selected.status}
                    </span>
                    <span>Attempts: {selected.attempts}</span>
                  </div>
                  {selected.error && (
                    <p className="form-error" role="alert">
                      {selected.error}
                    </p>
                  )}
                </section>
                {observation && (
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Extracted contract observation{" "}
                          <Badge tone="amber">Potentially incomplete</Badge>
                        </h2>
                        <p>
                          Only visible content; no MissionId or acceptance
                          timestamp is inferred.
                        </p>
                      </div>
                    </div>
                    <div className="extracted-grid">
                      <Extracted
                        label="Contract title"
                        field={observation.title}
                      />
                      <Extracted
                        label="Contracted by"
                        field={observation.company}
                      />
                      <Extracted
                        label="Reward (aUEC)"
                        field={observation.reward}
                      />
                      <Extracted
                        label="Offers / Accepted"
                        field={observation.view}
                      />
                      <Extracted
                        label="Visible delivery objectives"
                        field={observation.objectiveCount}
                      />
                    </div>
                    <div className="table-scroll">
                      <table className="cargo-table">
                        <thead>
                          <tr>
                            <th>Commodity</th>
                            <th>Pickup</th>
                            <th>Destination</th>
                            <th>Required SCU</th>
                            <th>Delivered SCU</th>
                          </tr>
                        </thead>
                        <tbody>
                          {observation.objectives.map((o, i) => (
                            <tr key={i}>
                              <td>
                                <Extracted
                                  label={"Objective " + (i + 1)}
                                  field={o.commodity}
                                />
                              </td>
                              <td>
                                <Extracted label="Pickup" field={o.pickup} />
                              </td>
                              <td>
                                <Extracted
                                  label="Destination"
                                  field={o.destination}
                                />
                              </td>
                              <td>
                                <Extracted
                                  label="Required"
                                  field={o.requiredSCU}
                                />
                              </td>
                              <td>
                                <Extracted
                                  label="Delivered"
                                  field={o.deliveredSCU}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="recognition-warnings">
                      {observation.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {selected.result && (
                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Raw recognized text</h2>
                        <p>
                          {selected.result.provider} ·{" "}
                          {number(selected.result.durationMs / 1000)} s · OCR
                          image {selected.result.width} ×{" "}
                          {selected.result.height} · provider boxes retained
                        </p>
                      </div>
                    </div>
                    <pre className="ocr-raw">
                      {selected.result.text || "No text recognized."}
                    </pre>
                    <details className="ocr-boxes">
                      <summary>
                        Inspect OCR lines, bounding boxes and engine confidence
                      </summary>
                      <pre>
                        {JSON.stringify(selected.result.lines, null, 2)}
                      </pre>
                    </details>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
      )}
      <Overlay
        open={large}
        onClose={() => setLarge(false)}
        title="Saved screenshot"
        subtitle="LOCAL CAPTURE"
        side="center"
      >
        {selected?.screenshot && (
          <div className="full-screenshot">
            <img src={captureImage(selected.id)} alt="Full saved screenshot" />
          </div>
        )}
        <p className="form-note screenshot-help">
          Scroll to inspect the full native-resolution screenshot.
        </p>
      </Overlay>
      <Overlay
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear stored captures?"
        subtitle="OCR OBSERVATIONS ONLY"
        side="center"
      >
        <div className="dialog-body">
          <p>
            This removes stored screenshots and OCR results. Contract records,
            Game.log state and run history are unaffected.
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
}
