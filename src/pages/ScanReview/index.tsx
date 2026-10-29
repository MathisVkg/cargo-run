import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { PageHeader, Badge, EmptyState } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { captureImage, useOcrStore } from "../../stores/useOcrStore";
import { useCargoStore } from "../../stores/useCargoStore";
import {
  reviewCaptures,
  failedAutomaticAttempt,
} from "../../utils/captureReview";
import { date, money, number } from "../../utils/format";
import { ContractReview } from "./ContractReview";
import { ScanIssueCard } from "./ScanIssueCard";
export default function ScanReview() {
  const { state, busy, error, capture, reparse, retry, remove, clear } =
      useOcrStore((s) => s),
    setPage = useCargoStore((s) => s.setPage);
  const [filter, setFilter] = useState("All"),
    [editing, setEditing] = useState<string | null>(null),
    [advanced, setAdvanced] = useState<string | null>(null),
    [large, setLarge] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false),
    [missing, setMissing] = useState<Set<string>>(new Set());
  const rows = reviewCaptures(state?.captures ?? []),
    selected = state?.captures.find((c) => c.id === large);
  return (
    <>
      <PageHeader
        eyebrow="CARGO / SCANS"
        title="Scan History & Issues"
        description="Valid accepted contracts import automatically. Resolve only the scans that need attention."
      >
        <button
          className="button"
          disabled={busy || !rows.length}
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
      <div className="monitor-buttons scan-filters">
        {["All", "Imported", "Updated", "Issues", "Failed"].map((f) => (
          <button
            key={f}
            className={"button " + (filter === f ? "primary" : "")}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <button className="button" onClick={() => setPage("Settings")}>
          Capture settings
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!rows.length && (
        <section className="panel">
          <EmptyState
            title="No captures yet"
            description="Show an accepted contract and use your capture shortcut. Cargo Run imports safe scans automatically."
          />
        </section>
      )}
      <div className="scan-history">
        {rows
          .filter(
            (c) =>
              filter === "All" ||
              (filter === "Issues" &&
                !["Imported", "Updated", "Failed"].includes(
                  c.importResult?.status ??
                    (c.status === "Failed" ? "Failed" : ""),
                )) ||
              filter ===
                (c.importResult?.status ??
                  (c.status === "Failed" ? "Failed" : "")),
          )
          .map((c) => {
            const outcome = c.importResult,
              status = ["Captured", "Processing"].includes(c.status)
                ? "OCR processing"
                : (outcome?.status ??
                  (c.status === "Failed"
                    ? "Failed"
                    : c.evidenceLink
                      ? "Updated"
                      : "Pending corrections")),
              success = status === "Imported" || status === "Updated";
            const image = !!c.screenshot && !missing.has(c.id),
              o = c.observation;
            return (
              <section
                className="panel scan-history-entry"
                key={c.id}
                data-capture-id={c.id}
              >
                <div className="scan-history-summary">
                  {image ? (
                    <button
                      className="scan-history-thumb"
                      aria-label={"Preview " + (o?.title.value ?? "capture")}
                      onClick={() => setLarge(c.id)}
                    >
                      <img
                        src={captureImage(c.id, true)}
                        alt="Saved screenshot"
                        onError={() => setMissing(new Set([...missing, c.id]))}
                      />
                    </button>
                  ) : (
                    <span className="capture-placeholder">
                      <Camera size={24} />
                    </span>
                  )}
                  <div className="scan-history-text">
                    <h2>{o?.title.value ?? "Capture " + date(c.capturedAt)}</h2>
                    <p>
                      {o
                        ? number(
                            o.objectives.reduce(
                              (n, r) => n + (r.requiredSCU.value ?? 0),
                              0,
                            ),
                          ) + " SCU"
                        : c.status}{" "}
                      · {money(o?.reward.value ?? null)} · {date(c.capturedAt)}
                    </p>
                    <Badge
                      tone={
                        success
                          ? "green"
                          : status === "Failed"
                            ? "red"
                            : "amber"
                      }
                    >
                      {status}
                    </Badge>
                    <p role="status">
                      {success
                        ? "Dashboard and Manifest updated."
                        : (outcome?.message ??
                          c.error ??
                          "Reprocess saved OCR to import this earlier scan.")}
                    </p>
                    {failedAutomaticAttempt(c) && (
                      <small>
                        {
                          state!.captures.filter(
                            (p) =>
                              p.trigger?.requestId === c.trigger?.requestId,
                          ).length
                        }{" "}
                        capture attempts · {c.validationMessage ?? c.error}
                      </small>
                    )}
                  </div>
                  <div className="monitor-buttons">
                    {!success && o && (
                      <button
                        className="button primary"
                        onClick={() => {
                          setEditing(editing === c.id ? null : c.id);
                          setAdvanced(null);
                        }}
                      >
                        Resolve issue
                      </button>
                    )}
                    <button
                      className="button"
                      disabled={!o}
                      onClick={() => {
                        setAdvanced(advanced === c.id ? null : c.id);
                        setEditing(null);
                      }}
                    >
                      Edit details / Advanced
                    </button>
                    {c.result && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(null);
                          void reparse(c.id);
                        }}
                      >
                        Reprocess saved OCR
                      </button>
                    )}
                    {c.status === "Failed" && image && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void retry(c.id)}
                      >
                        Retry OCR
                      </button>
                    )}
                    {!image && (
                      <button
                        className="button"
                        disabled={busy || !state?.captureAvailable}
                        onClick={() => void capture()}
                      >
                        Retry capture
                      </button>
                    )}
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => void remove(c.id)}
                    >
                      Delete capture
                    </button>
                  </div>
                </div>
                {editing === c.id && o && !success && (
                  <ScanIssueCard capture={c} />
                )}
                {advanced === c.id && o && (
                  <div className="scan-advanced">
                    <ContractReview capture={c} />
                    <details>
                      <summary>OCR evidence and diagnostics</summary>
                      <pre className="ocr-raw">
                        {JSON.stringify(
                          {
                            result: c.result,
                            observation: o,
                            trigger: c.trigger,
                            importResult: outcome,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  </div>
                )}
              </section>
            );
          })}
      </div>
      <Overlay
        open={!!large}
        onClose={() => setLarge(null)}
        title="Saved screenshot"
        subtitle="LOCAL CAPTURE"
        side="center"
      >
        {selected && (
          <div className="full-screenshot">
            <img src={captureImage(selected.id)} alt="Full saved screenshot" />
          </div>
        )}
      </Overlay>
      <Overlay
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear stored captures?"
        subtitle="SCREENSHOTS"
        side="center"
      >
        <div className="dialog-body">
          <p>
            Delete screenshot files and capture records? Contracts and linked
            text evidence remain.
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
              setEditing(null);
              setAdvanced(null);
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
