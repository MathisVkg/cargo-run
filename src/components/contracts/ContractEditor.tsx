import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Overlay } from "../ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import { useOcrStore, captureImage } from "../../stores/useOcrStore";
import type {
  ReviewedDraft,
  ReviewedObjective,
  OcrReview,
  EvidenceLink,
} from "../../types/review";
import { reviewErrors } from "../../types/review";
import type { Contract } from "../../types/models";
import type { CaptureRecord } from "../../types/ocr";
const emptyRow = (): ReviewedObjective => ({
  commodity: "",
  pickupLocation: "",
  destination: "",
  quantitySCU: null,
  deliveredSCU: 0,
});
const blank = (): ReviewedDraft => ({
  name: "",
  company: null,
  payout: null,
  acceptedAt: null,
  objectives: [emptyRow()],
});
const fromContract = (c: Contract): ReviewedDraft => ({
  name: c.name,
  company: c.company ?? null,
  payout: c.payout,
  acceptedAt: c.acceptedAt,
  objectives: c.cargoObjectives.map((o) => ({
    ...o,
    existingObjectiveId: o.id,
    deliveredSCU: o.deliveredSCU,
  })),
});
export function ContractEditor() {
  const request = useCargoStore((s) => s.editorRequest),
    close = useCargoStore((s) => s.closeEditor),
    contracts = useCargoStore((s) => s.contracts),
    saveManual = useCargoStore((s) => s.saveContract);
  const captures = useOcrStore((s) => s.state)?.captures ?? [],
    refresh = useOcrStore((s) => s.refresh);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  const [savedEvidence, setSavedEvidence] = useState<EvidenceLink | null>(null);
  const [draft, setDraft] = useState<ReviewedDraft>(blank),
    [captureId, setCaptureId] = useState(""),
    [target, setTarget] = useState(""),
    [review, setReview] = useState<OcrReview | null>(null),
    [busy, setBusy] = useState(false),
    [capturing, setCapturing] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false),
    [large, setLarge] = useState(false),
    [deleting, setDeleting] = useState(false);
  const [flags, setFlags] = useState({
      accepted: false,
      incomplete: false,
      distinct: false,
      consolidate: false,
    }),
    [choices, setChoices] = useState<Record<string, "Keep" | "Reviewed">>({});
  const baseline = useRef(""),
    dirty = useRef(new Set<string>()),
    generation = useRef(0),
    lock = useRef(false),
    captureLock = useRef(false),
    loaded = useRef(""),
    targetVersion = useRef<string | undefined>(undefined);
  const selected = contracts.find((c) => c.id === request?.contractId),
    capture = captures.find((c) => c.id === captureId);
  const change = (next: ReviewedDraft, key: string) => {
    dirty.current.add(key);
    setDraft(next);
    setChoices({});
    setError("");
  };
  const requestClose = () => {
    if (lock.current) return;
    if (JSON.stringify(draft) !== baseline.current) setDiscard(true);
    else close();
  };
  const captureOnce = async () => {
    if (captureLock.current) return;
    captureLock.current = true;
    setCapturing(true);
    setError("");
    setMessage(
      "Capturing the Star Citizen window once. You can type while recognition runs.",
    );
    const token = generation.current;
    try {
      const r = await window.cargoRun.ocrCaptureEditor();
      await refresh();
      if (token !== generation.current) return;
      setCaptureId(r.captureId);
      loaded.current = "";
      setReview(null);
    } catch (e) {
      if (token === generation.current) {
        setError(
          "Game capture unavailable. Enter the contract manually. " + String(e),
        );
        setMessage("");
      }
    } finally {
      if (token === generation.current) {
        captureLock.current = false;
        setCapturing(false);
      }
    }
  };
  useEffect(() => {
    generation.current++;
    const token = generation.current;
    captureLock.current = false;
    dirty.current.clear();
    loaded.current = "";
    targetVersion.current = undefined;
    const c = contracts.find((c) => c.id === request?.contractId),
      initial = c ? fromContract(c) : blank();
    setCapturing(false);
    setRemovedIds([]);
    setRemovalConfirmed(false);
    setDraft(initial);
    baseline.current = JSON.stringify(initial);
    setCaptureId(request?.captureId ?? "");
    setTarget(c?.id ?? "");
    setReview(null);
    setSavedEvidence(null);
    setError("");
    setMessage("");
    setDiscard(false);
    setLarge(false);
    setFlags({
      accepted: false,
      incomplete: false,
      distinct: false,
      consolidate: false,
    });
    setChoices({});
    if (!request) return;
    if (c && !request.captureId)
      void window.cargoRun
        .contractEvidence(c.id)
        .then((links) => {
          if (token !== generation.current) return;
          const link = links.find((l) => l.attached);
          if (link) {
            setCaptureId(link.captureId);
            setSavedEvidence(link);
          }
        })
        .catch((e) => {
          if (token === generation.current) setError(String(e));
        });
    if (!c && !request.captureId) void captureOnce();
    return () => {
      generation.current++;
    };
  }, [request?.id]);
  useEffect(() => {
    if (!request || !capture) return;
    if (capture.status === "Failed") {
      setMessage("");
      setError(capture.error ?? "Capture failed. Manual entry is available.");
      return;
    }
    if (!capture.observation) {
      setMessage("Recognizing screenshot locally… You can continue editing.");
      return;
    }
    const key =
      capture.id +
      JSON.stringify(capture.result) +
      JSON.stringify(capture.observation);
    if (loaded.current === key) return;
    loaded.current = key;
    const token = generation.current;
    void window.cargoRun
      .prepareOcr({ captureId: capture.id, targetId: target, advanced: true })
      .then((r) => {
        if (token !== generation.current) return;
        setReview(r);
        targetVersion.current ??= r.targetVersion;
        // Existing contracts start from their saved fields. Fresh OCR fills untouched fields only.
        if (!selected)
          setDraft((prev) => {
            const next = { ...prev };
            if (!dirty.current.has("name")) next.name = r.original.name;
            if (!dirty.current.has("company"))
              next.company = r.original.company;
            if (!dirty.current.has("payout")) next.payout = r.original.payout;
            if (!dirty.current.has("objectives"))
              next.objectives = r.original.objectives.length
                ? r.draft.objectives.map((o) => ({ ...o }))
                : prev.objectives;
            next.acceptedAt = r.original.acceptedAt;
            return next;
          });
        setMessage(
          r.errors.length
            ? "Recognition needs correction: " + r.errors.join(" ")
            : "Recognition ready. Review the fields and save when correct.",
        );
      })
      .catch((e) => {
        if (token === generation.current) setError(String(e));
      });
  }, [request?.id, capture, target]);
  const save = async () => {
    if (lock.current) return;
    if (
      captureLock.current ||
      capturing ||
      (capture && ["Captured", "Processing"].includes(capture.status))
    ) {
      setError(
        "Recognition is still running. You can keep editing while it finishes.",
      );
      return;
    }
    setError("");
    lock.current = true;
    setBusy(true);
    try {
      const errors = reviewErrors(draft);
      if (errors.length) throw Error(errors.join(" "));
      if (capture?.observation) {
        const r = await window.cargoRun.prepareOcr({
          captureId: capture.id,
          targetId: target,
          advanced: true,
          draft,
          removeObjectiveIds: removedIds,
        });
        if (targetVersion.current && r.targetVersion !== targetVersion.current)
          throw Error(
            "Contract changed while editing. Close and reopen to preserve newer progress.",
          );
        setReview(r);
        const missing =
          (r.capture.observation?.view.value !== "Accepted" &&
            !flags.accepted) ||
          ((r.capture.observation?.potentiallyIncomplete ||
            r.warnings.length > 0) &&
            !flags.incomplete) ||
          (!target && r.candidates.length > 0 && !flags.distinct) ||
          (!!r.sourceContract && !flags.consolidate) ||
          (removedIds.length > 0 && !removalConfirmed) ||
          r.conflicts.some((c) => !choices[c.path]);
        if (r.errors.length) throw Error(r.errors.join(" "));
        if (missing) {
          setMessage(
            "Review the acceptance, identity or changed-field confirmations below, then save.",
          );
          return;
        }
        await window.cargoRun.confirmOcr({
          captureId: capture.id,
          targetId: target,
          advanced: true,
          draft,
          removeObjectiveIds: removedIds,
          action: target ? "Update" : "Create",
          observationHash: r.observationHash,
          targetVersion: r.targetVersion,
          sourceVersion: r.sourceVersion,
          acceptedConfirmed:
            r.capture.observation?.view.value === "Accepted" || flags.accepted,
          incompleteConfirmed: flags.incomplete,
          associationConfirmed: !!target,
          distinctConfirmed: flags.distinct,
          consolidationConfirmed: flags.consolidate,
          objectiveRemovalConfirmed: removalConfirmed,
          choices,
        });
        await refresh();
      } else {
        if (capture && ["Captured", "Processing"].includes(capture.status))
          throw Error(
            "Recognition is still running. Keep editing, or wait before saving to retain its evidence.",
          );
        await saveManual(
          {
            name: draft.name,
            company: draft.company,
            payout: draft.payout,
            objectives: draft.objectives.map((o) => ({
              ...o,
              id: o.existingObjectiveId,
              quantitySCU: o.quantitySCU!,
              deliveredSCU: o.deliveredSCU ?? 0,
            })),
          },
          selected?.id,
        );
      }
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const row = (i: number, patch: Partial<ReviewedObjective>) =>
    change(
      {
        ...draft,
        objectives: draft.objectives.map((o, j) =>
          i === j ? { ...o, ...patch } : o,
        ),
      },
      "objectives",
    );
  const processing =
    capturing ||
    (!!capture && ["Captured", "Processing"].includes(capture.status));
  if (!request) return null;
  return (
    <>
      <Overlay
        open
        onClose={requestClose}
        side="center"
        title={selected ? "Edit Contract" : "Add Contract"}
        subtitle="CONTRACT EDITOR"
        className="unified-editor"
      >
        <form
          className="contract-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="drawer-body editor-body">
            <div className="editor-capture-toolbar">
              <p role="status">
                {message || "Enter the accepted contract details."}
              </p>
              <button
                type="button"
                className="button small"
                disabled={processing || busy}
                onClick={() => void captureOnce()}
              >
                Capture again
              </button>
            </div>
            {!capture && savedEvidence && (
              <details className="expired-editor-evidence">
                <summary>
                  Advanced · Saved OCR evidence (screenshot unavailable)
                </summary>
                <pre className="ocr-raw">
                  {JSON.stringify(savedEvidence, null, 2)}
                </pre>
              </details>
            )}
            {capture && (
              <EditorEvidence
                capture={capture}
                openImage={() => setLarge(true)}
                reprocess={async () => {
                  if (captureLock.current) return;
                  captureLock.current = true;
                  setError("");
                  try {
                    await window.cargoRun.ocrReprocessEditor(capture.id);
                    loaded.current = "";
                    await refresh();
                    setMessage(
                      "Reprocessing the saved screenshot; existing edits are retained. Use recognized fields to apply the result.",
                    );
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    captureLock.current = false;
                  }
                }}
                processing={processing || busy}
                apply={() => {
                  if (!review) return;
                  setRemovedIds([]);
                  setRemovalConfirmed(false);
                  change(
                    {
                      ...review.original,
                      objectives: review.original.objectives.map((o) => ({
                        ...o,
                        existingObjectiveId:
                          selected?.cargoObjectives.filter(
                            (r) =>
                              r.commodity.toLowerCase() ===
                                o.commodity.toLowerCase() &&
                              r.destination.toLowerCase() ===
                                o.destination.toLowerCase() &&
                              r.pickupLocation.toLowerCase() ===
                                o.pickupLocation.toLowerCase(),
                          ).length === 1
                            ? selected.cargoObjectives.find(
                                (r) =>
                                  r.commodity.toLowerCase() ===
                                    o.commodity.toLowerCase() &&
                                  r.destination.toLowerCase() ===
                                    o.destination.toLowerCase() &&
                                  r.pickupLocation.toLowerCase() ===
                                    o.pickupLocation.toLowerCase(),
                              )?.id
                            : undefined,
                      })),
                    },
                    "objectives",
                  );
                  dirty.current.add("name");
                  dirty.current.add("company");
                  dirty.current.add("payout");
                  setMessage(
                    "Recognized fields applied. Review corrections before saving.",
                  );
                }}
              />
            )}
            {capture?.observation && !selected && (
              <label>
                Save as
                <select
                  aria-label="Contract association"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setRemovedIds([]);
                    setRemovalConfirmed(false);
                    targetVersion.current = undefined;
                    setChoices({});
                    loaded.current = "";
                  }}
                >
                  <option value="">New accepted contract</option>
                  {contracts
                    .filter((c) => c.status === "Active" && !c.supersededBy)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        Attach to {c.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div className="editor-fields">
              <label>
                Contract name
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={draft.name}
                  onChange={(e) =>
                    change({ ...draft, name: e.target.value }, "name")
                  }
                />
              </label>
              <label>
                Company (optional)
                <input
                  value={draft.company ?? ""}
                  onChange={(e) =>
                    change(
                      { ...draft, company: e.target.value || null },
                      "company",
                    )
                  }
                />
              </label>
              <label>
                Reward (aUEC, optional)
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={draft.payout ?? ""}
                  onChange={(e) =>
                    change(
                      {
                        ...draft,
                        payout:
                          e.target.value === "" ? null : e.target.valueAsNumber,
                      },
                      "payout",
                    )
                  }
                />
              </label>
            </div>
            <div className="section-heading">
              <h3>Delivery objectives</h3>
              <span>{draft.objectives.length}</span>
            </div>
            {draft.objectives.map((o, i) => (
              <fieldset className="objective-fields" key={i}>
                <legend>Objective {i + 1}</legend>
                {target && (
                  <details className="objective-identity">
                    <summary>Advanced · Objective identity</summary>
                    <label>
                      Objective identity
                      <select
                        aria-label={"Objective identity " + (i + 1)}
                        value={o.existingObjectiveId ?? ""}
                        onChange={(e) =>
                          row(i, {
                            existingObjectiveId: e.target.value || undefined,
                            newDistinct: !e.target.value,
                          })
                        }
                      >
                        <option value="">New objective</option>
                        {contracts
                          .find((c) => c.id === target)
                          ?.cargoObjectives.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.commodity} → {r.destination} · {r.quantitySCU}{" "}
                              SCU
                            </option>
                          ))}
                      </select>
                    </label>
                    {!o.existingObjectiveId && (
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={o.newDistinct ?? false}
                          onChange={(e) =>
                            row(i, { newDistinct: e.target.checked })
                          }
                        />
                        Treat this as a new distinct objective
                      </label>
                    )}
                  </details>
                )}
                <div className="editor-objective-grid">
                  <label>
                    Pickup location
                    <input
                      required
                      value={o.pickupLocation}
                      onChange={(e) =>
                        row(i, { pickupLocation: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Destination
                    <input
                      required
                      value={o.destination}
                      onChange={(e) => row(i, { destination: e.target.value })}
                    />
                  </label>
                  <label>
                    Commodity
                    <input
                      required
                      value={o.commodity}
                      onChange={(e) => row(i, { commodity: e.target.value })}
                    />
                  </label>
                  <label>
                    Required SCU
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      required
                      value={o.quantitySCU ?? ""}
                      onChange={(e) =>
                        row(i, {
                          quantitySCU:
                            e.target.value === ""
                              ? null
                              : e.target.valueAsNumber,
                        })
                      }
                    />
                  </label>
                </div>
                {capture?.observation?.objectives[i]?.deliveredSCU.state !==
                  "Recognized" &&
                  capture?.observation && (
                    <label>
                      Observed delivered SCU
                      <input
                        aria-label={"Observed delivered SCU " + (i + 1)}
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={o.deliveredSCU ?? ""}
                        onChange={(e) =>
                          row(i, {
                            deliveredSCU:
                              e.target.value === ""
                                ? null
                                : e.target.valueAsNumber,
                          })
                        }
                      />
                    </label>
                  )}
                {draft.objectives.length > 1 && (
                  <button
                    type="button"
                    className="text-button danger-text"
                    onClick={() => {
                      if (o.existingObjectiveId) {
                        setRemovedIds((v) => [...v, o.existingObjectiveId!]);
                        setRemovalConfirmed(false);
                      }
                      change(
                        {
                          ...draft,
                          objectives: draft.objectives.filter(
                            (_, j) => i !== j,
                          ),
                        },
                        "objectives",
                      );
                    }}
                  >
                    <Trash2 size={13} />
                    Remove objective {i + 1}
                  </button>
                )}
              </fieldset>
            ))}
            <button
              type="button"
              className="button small"
              onClick={() =>
                change(
                  { ...draft, objectives: [...draft.objectives, emptyRow()] },
                  "objectives",
                )
              }
            >
              <Plus size={14} />
              Add delivery objective
            </button>
            {capture?.observation && removedIds.length > 0 && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={removalConfirmed}
                  onChange={(e) => setRemovalConfirmed(e.target.checked)}
                />
                Remove the selected saved objectives
              </label>
            )}
            {review && (
              <div className="editor-confirmations">
                {capture?.observation?.view.value !== "Accepted" && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={flags.accepted}
                      onChange={(e) =>
                        setFlags({ ...flags, accepted: e.target.checked })
                      }
                    />
                    I accepted this contract in-game.
                  </label>
                )}
                {(review.capture.observation?.potentiallyIncomplete ||
                  review.warnings.length > 0) && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={flags.incomplete}
                      onChange={(e) =>
                        setFlags({ ...flags, incomplete: e.target.checked })
                      }
                    />
                    I checked the full objective list; preserve existing unseen
                    objectives.
                  </label>
                )}
                {!target && review.candidates.length > 0 && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={flags.distinct}
                      onChange={(e) =>
                        setFlags({ ...flags, distinct: e.target.checked })
                      }
                    />
                    This is a separate accepted contract from the matching
                    candidates.
                  </label>
                )}
                {review.sourceContract && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={flags.consolidate}
                      onChange={(e) =>
                        setFlags({ ...flags, consolidate: e.target.checked })
                      }
                    />
                    Consolidate the existing OCR record into the selected
                    contract.
                  </label>
                )}
                {review.conflicts.map((c) => (
                  <label key={c.path}>
                    {c.message}
                    <select
                      aria-label={"Choose value for " + c.path}
                      value={choices[c.path] ?? ""}
                      onChange={(e) =>
                        setChoices({
                          ...choices,
                          [c.path]: e.target.value as "Keep" | "Reviewed",
                        })
                      }
                    >
                      <option value="">Choose a value…</option>
                      <option value="Keep">
                        Keep stored: {String(c.stored)}
                      </option>
                      <option value="Reviewed">
                        Use editor: {String(c.reviewed)}
                      </option>
                    </select>
                  </label>
                ))}
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <p className="form-note">
              Saving confirms your reviewed fields. Unseen objectives, recorded
              cargo and evidence are protected by existing validation.
            </p>
          </div>
          <div className="dialog-actions">
            {capture && !capture.evidenceLink && (
              <button
                type="button"
                className="text-button danger-text editor-delete"
                disabled={busy || processing}
                onClick={() => setDeleting(true)}
              >
                Delete capture
              </button>
            )}
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save contract"}
            </button>
          </div>
        </form>
      </Overlay>
      <Overlay
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard unsaved changes?"
        side="center"
      >
        <div className="dialog-body">
          Your changes have not been saved. Captures remain available under
          Needs review.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setDiscard(false)}>
            Keep editing
          </button>
          <button
            className="button danger"
            onClick={() => {
              setDiscard(false);
              close();
            }}
          >
            Discard changes
          </button>
        </div>
      </Overlay>
      <Overlay
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete capture?"
        side="center"
      >
        <div className="dialog-body">
          Delete this unresolved capture and screenshot? Saved contract records
          remain protected.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setDeleting(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={async () => {
              try {
                await window.cargoRun.ocrDelete(captureId);
                await refresh();
                setCaptureId("");
                setReview(null);
                setDeleting(false);
              } catch (e) {
                setError(String(e));
                setDeleting(false);
              }
            }}
          >
            Confirm delete capture
          </button>
        </div>
      </Overlay>
      <Overlay
        open={large}
        onClose={() => setLarge(false)}
        title="Original screenshot"
        side="center"
      >
        <div className="full-screenshot">
          {capture && (
            <img
              src={captureImage(capture.id)}
              alt="Original contract screenshot"
            />
          )}
        </div>
      </Overlay>
    </>
  );
}
function EditorEvidence({
  capture,
  openImage,
  reprocess,
  apply,
  processing,
}: {
  capture: CaptureRecord;
  openImage(): void;
  reprocess(): void;
  apply(): void;
  processing: boolean;
}) {
  if (!capture.screenshot && !capture.result)
    return (
      <p className="capture-failure-note">
        {capture.error ??
          "No screenshot is available. Enter the contract manually."}
      </p>
    );
  return (
    <section className="editor-evidence">
      <div>
        {capture.screenshot ? (
          <button
            type="button"
            className="editor-thumbnail"
            aria-label="Open original screenshot"
            onClick={openImage}
          >
            <img
              src={captureImage(capture.id, true)}
              alt="Contract screenshot preview"
            />
            <span>Open original screenshot</span>
          </button>
        ) : (
          <p className="muted">
            Screenshot unavailable. Saved recognition remains recoverable.
          </p>
        )}
      </div>
      <div>
        <p>
          {capture.status === "Failed"
            ? "Capture failed"
            : capture.status === "Processed"
              ? "Recognized screenshot"
              : "Recognition processing"}
        </p>
        <div className="editor-evidence-actions">
          <button
            type="button"
            className="button small"
            disabled={processing || !capture.screenshot}
            onClick={reprocess}
          >
            Reprocess saved OCR
          </button>
          <button
            type="button"
            className="button small"
            disabled={processing || !capture.observation}
            onClick={apply}
          >
            Use recognized fields
          </button>
        </div>
        <details>
          <summary>Advanced · OCR evidence</summary>
          <pre className="ocr-raw">
            {JSON.stringify(
              {
                observation: capture.observation,
                result: capture.result,
                recovery: capture.recovery,
                importResult: capture.importResult,
                trigger: capture.trigger,
                validation: capture.validation,
                validationMessage: capture.validationMessage,
                source: capture.source,
                requestedSource: capture.requestedSource,
                backend: capture.backend,
              },
              null,
              2,
            )}
          </pre>
        </details>
      </div>
    </section>
  );
}
