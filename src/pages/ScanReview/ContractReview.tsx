import { useEffect, useState } from "react";
import type { CaptureRecord } from "../../types/ocr";
import type {
  OcrReview,
  ReviewedDraft,
  ReviewedObjective,
  ConfirmReview,
} from "../../types/review";
import { reviewErrors } from "../../types/review";
import { useOcrStore } from "../../stores/useOcrStore";
import { Badge } from "../../components/ui";
export function ContractReview({ capture }: { capture: CaptureRecord }) {
  const [review, setReview] = useState<OcrReview | null>(null),
    [draft, setDraft] = useState<ReviewedDraft | null>(null);
  const [target, setTarget] = useState(""),
    [checked, setChecked] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<string, "Keep" | "Reviewed">>(
    {},
  );
  const [flags, setFlags] = useState({
    acceptedConfirmed: false,
    incompleteConfirmed: false,
    associationConfirmed: false,
    distinctConfirmed: false,
    consolidationConfirmed: false,
    objectiveRemovalConfirmed: false,
  });
  const [removed, setRemoved] = useState<string[]>([]),
    [removedSource, setRemovedSource] = useState<string[]>([]);
  const refresh = useOcrStore((s) => s.refresh);
  const load = async (targetId?: string) => {
    setBusy(true);
    setError("");
    setChecked(false);
    setChoices({});
    setFlags({
      acceptedConfirmed: false,
      incompleteConfirmed: false,
      associationConfirmed: false,
      distinctConfirmed: false,
      consolidationConfirmed: false,
      objectiveRemovalConfirmed: false,
    });
    setRemoved([]);
    setRemovedSource([]);
    try {
      const r = await window.cargoRun.prepareOcr({
        captureId: capture.id,
        targetId,
        advanced: true,
      });
      setReview(r);
      setDraft(r.draft);
      setTarget(r.target?.id ?? "");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [capture.id]);
  const change = (d: ReviewedDraft) => {
    setDraft(d);
    setChecked(false);
    setChoices({});
    setMessage("");
  };
  const row = (i: number, patch: Partial<ReviewedObjective>) =>
    draft &&
    change({
      ...draft,
      objectives: draft.objectives.map((o, j) =>
        i === j ? { ...o, ...patch } : o,
      ),
    });
  const check = async () => {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const r = await window.cargoRun.prepareOcr({
        captureId: capture.id,
        advanced: true,
        targetId: target,
        draft,
        removeObjectiveIds: removed,
        removeSourceObjectiveIds: removedSource,
      });
      setReview(r);
      setChecked(true);
      setChoices({});
      setFlags({
        acceptedConfirmed: false,
        incompleteConfirmed: false,
        associationConfirmed: false,
        distinctConfirmed: false,
        consolidationConfirmed: false,
        objectiveRemovalConfirmed: false,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!review || !draft) return;
    setBusy(true);
    setError("");
    try {
      const input: ConfirmReview = {
        captureId: capture.id,
        advanced: true,
        targetId: target,
        draft,
        removeObjectiveIds: removed,
        removeSourceObjectiveIds: removedSource,
        action: target ? "Update" : "Create",
        observationHash: review.observationHash,
        targetVersion: review.targetVersion,
        sourceVersion: review.sourceVersion,
        choices,
        ...flags,
      };
      const result = await window.cargoRun.confirmOcr(input);
      await refresh();
      await load(result.contractId);
      setMessage(
        result.idempotent
          ? "This capture is already associated; no duplicate was created."
          : "Reviewed contract saved. Dashboard, Manifest and History are updated.",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!review || !draft)
    return (
      <section className="panel review-form">
        <h2>Review contract</h2>
        <p role="alert">{error || "Loading review…"}</p>
        <button className="button" onClick={() => void load()}>
          Reload review
        </button>
      </section>
    );
  const invalid = reviewErrors(draft),
    original = review.original;
  const evidence = (value: unknown, recognized: unknown) => (
    <small className="form-note">
      Original OCR:{" "}
      {recognized === null || recognized === ""
        ? "Unknown"
        : String(recognized)}{" "}
      {JSON.stringify(value) !== JSON.stringify(recognized) && (
        <Badge tone="amber">Manual correction</Badge>
      )}
    </small>
  );
  return (
    <section className="panel review-form">
      <div className="panel-heading">
        <div>
          <h2>Review and confirm contract</h2>
          <p>
            OCR: {capture.status} · Review:{" "}
            {review.previous?.attached
              ? "Linked"
              : invalid.length
                ? "Needs correction"
                : checked
                  ? "Ready to confirm"
                  : "Awaiting review"}
          </p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() => void load(target)}
        >
          Reload review
        </button>
      </div>
      <div className="drawer-body">
        <p className="notice warning">
          Only explicit confirmation saves a contract. Verify every visible
          objective; a screenshot may show a partial list. Acceptance time
          remains unknown unless you enter a supported time.
        </p>
        <label>
          Save as
          <select
            aria-label="Review target contract"
            value={target}
            disabled={busy}
            onChange={(e) => void load(e.target.value)}
          >
            {!review.previous && (
              <option value="">New OCR-only contract</option>
            )}
            {review.targets.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.missionId ?? "Local " + c.id.slice(0, 8)} ·{" "}
                {c.status}
              </option>
            ))}
          </select>
        </label>
        {review.candidates.map((c) => (
          <details key={c.contract.id}>
            <summary>
              {c.kind} · {c.contract.name} ·{" "}
              {c.contract.missionId ?? c.contract.id.slice(0, 8)}
            </summary>
            <ul>
              {c.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        ))}
        <p>
          Total reviewed SCU:{" "}
          {draft.objectives.reduce((n, o) => n + (o.quantitySCU ?? 0), 0)} ·
          Recognized view: {capture.observation?.view.value ?? "Ambiguous"} ·{" "}
          {review.previous
            ? "Bound to " + review.previous.contractId
            : "Not yet associated"}
        </p>
        <p className="form-note">
          Selecting a target reloads its suggested mappings. Title, reward and
          timing alone never verify a MissionId. Duplicate objective rows stay
          separate.
        </p>
        <div className="review-fields">
          <label>
            Reviewed title
            <input
              value={draft.name}
              maxLength={2000}
              onChange={(e) => change({ ...draft, name: e.target.value })}
            />
            {evidence(draft.name, original.name)}
          </label>
          <label>
            Reviewed company
            <input
              value={draft.company ?? ""}
              maxLength={2000}
              placeholder="Unknown"
              onChange={(e) =>
                change({ ...draft, company: e.target.value || null })
              }
            />
            {evidence(draft.company, original.company)}
          </label>
          <label>
            Reviewed reward (aUEC)
            <input
              type="number"
              min="0"
              value={draft.payout ?? ""}
              placeholder="Unknown"
              onChange={(e) =>
                change({
                  ...draft,
                  payout: e.target.value === "" ? null : e.target.valueAsNumber,
                })
              }
            />
            {evidence(draft.payout, original.payout)}
          </label>
          <label>
            Accepted at (ISO date/time, optional)
            <input
              value={draft.acceptedAt ?? ""}
              placeholder="Unknown"
              disabled={!!review.target?.missionId}
              onChange={(e) =>
                change({ ...draft, acceptedAt: e.target.value || null })
              }
            />
            {evidence(draft.acceptedAt, null)}
          </label>
        </div>
        {draft.objectives.map((o, i) => (
          <fieldset className="objective-fields" key={i}>
            <legend>Reviewed objective {i + 1}</legend>
            {(
              [
                "commodity",
                "pickupLocation",
                "destination",
                "quantitySCU",
                "deliveredSCU",
              ] as const
            ).map((key) => (
              <label key={key}>
                {
                  {
                    commodity: "Commodity",
                    pickupLocation: "Pickup location",
                    destination: "Destination",
                    quantitySCU: "Required SCU",
                    deliveredSCU: "Delivered SCU",
                  }[key]
                }
                <input
                  aria-label={"Objective " + (i + 1) + " " + key}
                  type={key.endsWith("SCU") ? "number" : "text"}
                  step="any"
                  value={o[key] ?? ""}
                  onChange={(e) =>
                    row(i, {
                      [key]: key.endsWith("SCU")
                        ? e.target.value === ""
                          ? null
                          : e.target.valueAsNumber
                        : e.target.value,
                    })
                  }
                />
                {evidence(o[key], original.objectives[i]?.[key] ?? null)}
              </label>
            ))}
            {review.target && (
              <>
                <label>
                  Existing objective mapping
                  <select
                    aria-label={"Objective " + (i + 1) + " mapping"}
                    value={o.existingObjectiveId ?? ""}
                    onChange={(e) => {
                      const existing = review.target?.cargoObjectives.find(
                        (x) => x.id === e.target.value,
                      );
                      row(i, {
                        existingObjectiveId: e.target.value || undefined,
                        externalObjectiveId:
                          existing?.externalObjectiveId?.startsWith("fallback-")
                            ? undefined
                            : existing?.externalObjectiveId,
                      });
                    }}
                  >
                    <option value="">Add a separate row</option>
                    {review.target.cargoObjectives.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.commodity} · {x.destination} · {x.quantitySCU} SCU ·{" "}
                        {x.id.slice(-12)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Observed ObjectiveId
                  <select
                    value={o.externalObjectiveId ?? ""}
                    onChange={(e) =>
                      row(i, {
                        externalObjectiveId: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {[
                      ...new Map(
                        [
                          ...review.pendingObjectives,
                          ...review.target.cargoObjectives
                            .filter(
                              (x) =>
                                x.externalObjectiveId &&
                                !x.externalObjectiveId.startsWith("fallback-"),
                            )
                            .map((x) => ({ ...x, id: x.externalObjectiveId! })),
                        ].map((x) => [x.id, x]),
                      ).values(),
                    ].map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.id} · {x.commodity} · {x.destination}
                      </option>
                    ))}
                  </select>
                </label>
                {!o.existingObjectiveId && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!!o.newDistinct}
                      onChange={(e) =>
                        row(i, { newDistinct: e.target.checked })
                      }
                    />
                    This is a distinct objective, including if its fields
                    resemble a stored row.
                  </label>
                )}
              </>
            )}
            <button
              className="button"
              onClick={() => {
                if (o.existingObjectiveId)
                  setRemoved([...removed, o.existingObjectiveId]);
                if (o.sourceObjectiveId)
                  setRemovedSource([...removedSource, o.sourceObjectiveId]);
                change({
                  ...draft,
                  objectives: draft.objectives.filter((_, j) => i !== j),
                });
              }}
            >
              Remove objective {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          className="button"
          onClick={() =>
            change({
              ...draft,
              objectives: [
                ...draft.objectives,
                {
                  commodity: "",
                  pickupLocation: "",
                  destination: "",
                  quantitySCU: null,
                  deliveredSCU: 0,
                  newDistinct: true,
                },
              ],
            })
          }
        >
          Add objective
        </button>
        {review.target &&
          review.target.cargoObjectives
            .filter(
              (o) =>
                !draft.objectives.some((r) => r.existingObjectiveId === o.id),
            )
            .map((o) => (
              <label className="checkbox-label" key={o.id}>
                <input
                  type="checkbox"
                  checked={removed.includes(o.id)}
                  onChange={(e) => {
                    setRemoved(
                      e.target.checked
                        ? [...removed, o.id]
                        : removed.filter((id) => id !== o.id),
                    );
                    setChecked(false);
                  }}
                />
                Remove unmatched stored objective: {o.commodity} ·{" "}
                {o.destination} · {o.quantitySCU} SCU (otherwise preserved)
              </label>
            ))}
        <ul className="recognition-warnings">
          {review.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        {invalid.length > 0 && (
          <p className="form-error">{invalid.join(" ")}</p>
        )}
        <button
          className="button"
          disabled={busy}
          onClick={() => void load(target)}
        >
          Cancel review changes
        </button>
        <button
          className="button"
          disabled={busy || !!invalid.length}
          onClick={() => void check()}
        >
          Check changes
        </button>
        {checked && (
          <div className="review-confirmation">
            {review.errors.length > 0 && (
              <p className="form-error" role="alert">
                {review.errors.join(" ")}
              </p>
            )}
            {review.conflicts.map((c) => (
              <fieldset key={c.path}>
                <legend>Conflict: {c.path}</legend>
                <p>
                  Stored: {String(c.stored ?? "Unknown")} · Reviewed:{" "}
                  {String(c.reviewed ?? "Unknown")}
                </p>
                <label>
                  <input
                    type="radio"
                    name={capture.id + c.path}
                    checked={choices[c.path] === "Keep"}
                    onChange={() =>
                      setChoices({ ...choices, [c.path]: "Keep" })
                    }
                  />
                  Keep stored
                </label>
                <label>
                  <input
                    type="radio"
                    name={capture.id + c.path}
                    checked={choices[c.path] === "Reviewed"}
                    onChange={() =>
                      setChoices({ ...choices, [c.path]: "Reviewed" })
                    }
                  />
                  Use reviewed
                </label>
              </fieldset>
            ))}
            {(
              [
                [
                  "acceptedConfirmed",
                  "I confirm this contract was accepted in-game, even if the screenshot shows Offers or is ambiguous.",
                ],
                [
                  "incompleteConfirmed",
                  "I checked the potentially incomplete objective list and all recognition warnings.",
                ],
                ...(target
                  ? [
                      [
                        "associationConfirmed",
                        "I confirm this evidence belongs to the selected contract and reviewed the objective mappings.",
                      ],
                    ]
                  : review.candidates.length
                    ? [
                        [
                          "distinctConfirmed",
                          "This is a separate accepted instance from every suggested candidate.",
                        ],
                      ]
                    : []),
                ...(review.sourceContract
                  ? [
                      [
                        "consolidationConfirmed",
                        "Consolidate this OCR-only contract into the selected Game.log MissionId; preserve its audit and history.",
                      ],
                    ]
                  : []),
                ...(removed.length || removedSource.length
                  ? [
                      [
                        "objectiveRemovalConfirmed",
                        "I explicitly confirm removal of the selected undelivered objective rows.",
                      ],
                    ]
                  : []),
              ] as [keyof typeof flags, string][]
            ).map(([key, label]) => (
              <label className="checkbox-label" key={key}>
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(e) =>
                    setFlags({ ...flags, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
            <button
              className="button primary"
              disabled={
                busy ||
                !!review.errors.length ||
                review.conflicts.some((c) => !choices[c.path]) ||
                !flags.acceptedConfirmed ||
                !flags.incompleteConfirmed ||
                (!!target && !flags.associationConfirmed) ||
                (!target &&
                  !!review.candidates.length &&
                  !flags.distinctConfirmed) ||
                (!!review.sourceContract && !flags.consolidationConfirmed) ||
                (!!(removed.length || removedSource.length) &&
                  !flags.objectiveRemovalConfirmed)
              }
              onClick={() => void save()}
            >
              {target ? "Confirm update" : "Confirm new OCR contract"}
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        <details>
          <summary>Original OCR fields (unchanged evidence)</summary>
          <pre className="ocr-raw">{JSON.stringify(original, null, 2)}</pre>
        </details>
      </div>
    </section>
  );
}
