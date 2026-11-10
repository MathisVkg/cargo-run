import { useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { PageHeader, Badge, EmptyState } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { ContractDetails } from "../../components/contracts/ContractDetails";
import { captureImage, useOcrStore } from "../../stores/useOcrStore";
import { useCargoStore } from "../../stores/useCargoStore";
import { reviewCaptures, scanPresentation } from "../../utils/captureReview";
import { date, money, number } from "../../utils/format";
import { ContractReview } from "./ContractReview";
import { ScanIssueCard } from "./ScanIssueCard";
export default function ScanReview() {
  const { state, busy, error, capture, reparse, reprocess, remove, clear } =
    useOcrStore((s) => s);
  const contracts = useCargoStore((s) => s.contracts),
    setPage = useCargoStore((s) => s.setPage);
  const [filter, setFilter] = useState("All"),
    [editing, setEditing] = useState<string | null>(null),
    [detailed, setDetailed] = useState<string | null>(null),
    [large, setLarge] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null),
    [viewing, setViewing] = useState<string | null>(null),
    [expanded, setExpanded] = useState<Record<string, boolean>>({}),
    [missing, setMissing] = useState<Set<string>>(new Set());
  const rows = reviewCaptures(state?.captures ?? []),
    selected = state?.captures.find((c) => c.id === large),
    review = state?.captures.find((c) => c.id === editing);
  return (
    <>
      <PageHeader
        eyebrow="CARGO / SCANS"
        title="Scan History & Issues"
        description="Accepted contracts import automatically. Review only the scans that need attention."
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
        {[
          "All",
          "Imported",
          "Updated",
          "Needs review",
          "Processing",
          "Failed",
        ].map((f) => (
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
            (c) => filter === "All" || scanPresentation(c).status === filter,
          )
          .map((c) => {
            const { status, message } = scanPresentation(c),
              success = status === "Imported" || status === "Updated",
              processing = status === "Processing";
            const image = !!c.screenshot && !missing.has(c.id),
              o = c.observation,
              contractId =
                c.importResult?.contractId ?? c.evidenceLink?.contractId;
            const linked = success
              ? contracts.find((t) => t.id === contractId)
              : undefined;
            const cargoText = linked
              ? linked.cargoObjectives
                  .map(
                    (r) => r.commodity + " · " + number(r.quantitySCU) + " SCU",
                  )
                  .join("; ")
              : o?.objectives
                  .map(
                    (r) =>
                      (r.commodity.value ?? "Cargo") +
                      " · " +
                      number(r.requiredSCU.value ?? 0) +
                      " SCU",
                  )
                  .join("; ");
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
                    <h2>
                      {linked?.name ??
                        o?.title.value ??
                        "Capture " + date(c.capturedAt)}
                    </h2>
                    <p>
                      {cargoText ?? "Recognition pending"} ·{" "}
                      {money(linked?.payout ?? o?.reward.value ?? null)} ·{" "}
                      {date(c.capturedAt)}
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
                    <p role="status">{message}</p>
                  </div>
                  <div className="monitor-buttons scan-primary-actions">
                    {success && (
                      <button
                        className="button"
                        disabled={!contracts.some((t) => t.id === contractId)}
                        onClick={() => setViewing(contractId ?? null)}
                      >
                        View contract
                      </button>
                    )}
                    {status === "Needs review" && o && (
                      <button
                        className="button primary"
                        disabled={busy}
                        onClick={() => setEditing(c.id)}
                      >
                        Review issue
                      </button>
                    )}
                    {status === "Failed" && (
                      <button
                        className="button primary"
                        disabled={busy || !image}
                        onClick={() => void reprocess(c.id)}
                      >
                        Retry recognition
                      </button>
                    )}
                    {processing && (
                      <button className="button" disabled>
                        Processing…
                      </button>
                    )}
                    {status === "Failed" && !image && (
                      <small>Saved screenshot unavailable.</small>
                    )}
                  </div>
                </div>
                <div className="scan-secondary-actions">
                  <details
                    className="scan-advanced"
                    open={expanded[c.id] ?? false}
                    onToggle={(e) => {
                      const open = e.currentTarget.open;
                      setExpanded((v) =>
                        v[c.id] === open ? v : { ...v, [c.id]: open },
                      );
                    }}
                  >
                    <summary>Advanced</summary>
                    {expanded[c.id] && (
                      <>
                        <div className="monitor-buttons">
                          {(c.result || c.screenshot) && (
                            <button
                              className="button"
                              disabled={busy || processing || !image}
                              onClick={() => {
                                setEditing(null);
                                void reprocess(c.id);
                              }}
                            >
                              Reprocess saved OCR
                            </button>
                          )}
                          {c.result && (
                            <button
                              className="button"
                              disabled={busy || processing}
                              onClick={() => {
                                setEditing(null);
                                void reparse(c.id);
                              }}
                            >
                              Re-extract saved text
                            </button>
                          )}
                          <button
                            className="button"
                            disabled={!o || processing}
                            onClick={() =>
                              setDetailed(detailed === c.id ? null : c.id)
                            }
                          >
                            Detailed field editing
                          </button>
                        </div>
                        {c.recovery && (
                          <p
                            className="form-note"
                            role={
                              c.recovery.status === "Failed"
                                ? "alert"
                                : undefined
                            }
                          >
                            Last recognition attempt: {c.recovery.message}
                          </p>
                        )}
                        {detailed === c.id && o && (
                          <ContractReview capture={c} />
                        )}
                        <details>
                          <summary>Inspect raw OCR evidence</summary>
                          <pre className="ocr-raw">
                            {JSON.stringify(
                              {
                                recovery: c.recovery,
                                originalRecognition: c.originalRecognition,
                                recognitionHistory: c.recognitionHistory,
                                result: c.result,
                                observation: o,
                                trigger: c.trigger,
                                importResult: c.importResult,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      </>
                    )}
                  </details>
                  <button
                    className="text-button"
                    disabled={busy || processing}
                    onClick={() => setDeleting(c.id)}
                  >
                    Delete capture
                  </button>
                </div>
              </section>
            );
          })}
      </div>
      <Overlay
        open={!!review}
        onClose={() => setEditing(null)}
        title="Review scan"
        subtitle="CHECK RECOGNIZED DETAILS"
        side="center"
      >
        {review && (
          <ScanIssueCard
            key={review.id}
            capture={review}
            onClose={() => setEditing(null)}
          />
        )}
      </Overlay>
      <ContractDetails
        contract={contracts.find((c) => c.id === viewing) ?? null}
        onClose={() => setViewing(null)}
      />
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
        open={confirm || !!deleting}
        onClose={() => {
          setConfirm(false);
          setDeleting(null);
        }}
        title={deleting ? "Delete this capture?" : "Clear stored captures?"}
        subtitle="SCREENSHOTS"
        side="center"
      >
        <div className="dialog-body">
          <p>
            Delete{" "}
            {deleting
              ? "this screenshot and its capture record"
              : "screenshot files and capture records"}
            ? Contracts, linked text evidence and correction history remain.
          </p>
        </div>
        <div className="dialog-actions">
          <button
            className="button"
            onClick={() => {
              setConfirm(false);
              setDeleting(null);
            }}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={() => {
              const id = deleting;
              setConfirm(false);
              setDeleting(null);
              setEditing(null);
              if (id) void remove(id);
              else void clear();
            }}
          >
            {deleting ? "Confirm delete capture" : "Confirm clear captures"}
          </button>
        </div>
      </Overlay>
    </>
  );
}
