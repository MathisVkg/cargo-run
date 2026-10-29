import { useEffect, useState } from "react";
import type { CaptureRecord } from "../../types/ocr";
import type { ScanIssue, ResolveScan, ReviewedDraft } from "../../types/review";
import { useOcrStore } from "../../stores/useOcrStore";
export function ScanIssueCard({ capture }: { capture: CaptureRecord }) {
  const [issue, setIssue] = useState<ScanIssue | null>(null),
    [draft, setDraft] = useState<ReviewedDraft | null>(null),
    [target, setTarget] = useState<string | undefined>(),
    [separate, setSeparate] = useState(false),
    [accepted, setAccepted] = useState(false),
    [coverage, setCoverage] = useState(false),
    [choices, setChoices] = useState<Record<string, "Keep" | "Reviewed">>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useOcrStore((s) => s.refresh);
  const load = async (id?: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await window.cargoRun.scanIssue({
        captureId: capture.id,
        targetId: id,
      });
      setIssue(r);
      setDraft(r.review.draft);
      setTarget(r.review.target?.id);
      setChoices({});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, [capture.id]);
  if (!issue || !draft) return <p role="alert">{error || "Loading scan…"}</p>;
  const payload = (): ResolveScan => ({
    captureId: capture.id,
    targetId: separate ? "" : target,
    separate,
    draft,
    acceptedConfirmed: accepted,
    coverageConfirmed: coverage,
    choices,
    observationHash: issue.review.observationHash,
    targetVersion: issue.review.targetVersion,
  });
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await window.cargoRun.resolveScan(payload());
      await refresh();
      if (r && ["Imported", "Updated"].includes(r.status)) return;
      const next = await window.cargoRun.scanIssue(payload());
      setIssue(next);
      setError(r?.message ?? "Review this scan.");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const row = (i: number, key: string, value: string | number | null) =>
    setDraft({
      ...draft,
      objectives: draft.objectives.map((o, j) =>
        i === j ? { ...o, [key]: value } : o,
      ),
    });
  return (
    <div className="compact-scan-issue">
      <p>{issue.outcome.message}</p>
      {(issue.review.targets.length > 0 ||
        issue.outcome.message.includes("already closed")) && (
        <>
          <p>Which active contract is this?</p>
          <div className="scan-candidate-actions">
            {issue.review.targets.map((c) => (
              <button
                className={
                  "button " + (!separate && target === c.id ? "primary" : "")
                }
                key={c.id}
                disabled={busy}
                onClick={() => {
                  setSeparate(false);
                  void load(c.id);
                }}
              >
                {c.name} ·{" "}
                {c.cargoObjectives.length
                  ? c.cargoObjectives.reduce((n, o) => n + o.quantitySCU, 0) +
                    " SCU"
                  : "Cargo unknown"}{" "}
                · {c.source} ·{" "}
                {c.acceptedAt
                  ? new Date(c.acceptedAt).toLocaleTimeString()
                  : "Time unknown"}
              </button>
            ))}
            <button
              className={"button " + (separate ? "primary" : "")}
              disabled={busy}
              onClick={() => {
                setSeparate(true);
                setTarget("");
              }}
            >
              Create a separate contract
            </button>
          </div>
        </>
      )}
      {(!issue.review.draft.name.trim() ||
        capture.observation?.title.state === "Ambiguous") && (
        <label>
          Contract title
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
      )}
      {capture.observation?.company.state === "Ambiguous" && (
        <label>
          Company
          <input
            value={draft.company ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, company: e.target.value || null })
            }
          />
        </label>
      )}
      {capture.observation?.reward.state === "Ambiguous" && (
        <label>
          Correct reward (aUEC)
          <input
            type="number"
            value={draft.payout ?? ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                payout: e.target.value === "" ? null : e.target.valueAsNumber,
              })
            }
          />
        </label>
      )}
      {draft.objectives.map((o, i) => (
        <div key={i}>
          {(
            [
              "commodity",
              "pickupLocation",
              "destination",
              "quantitySCU",
              "deliveredSCU",
            ] as const
          )
            .filter((k) => {
              const source = issue.review.draft.objectives[i] ?? o;
              return (
                source[k] === null ||
                source[k] === "" ||
                (k === "quantitySCU" && Number(source[k]) <= 0) ||
                (k === "deliveredSCU" &&
                  Number(source[k]) > Number(source.quantitySCU)) ||
                capture.observation?.objectives[i]?.[
                  (
                    {
                      pickupLocation: "pickup",
                      destination: "destination",
                      commodity: "commodity",
                      quantitySCU: "requiredSCU",
                      deliveredSCU: "deliveredSCU",
                    } as const
                  )[k]
                ].state === "Ambiguous"
              );
            })
            .map((k) => (
              <label key={k}>
                Objective {i + 1} ·{" "}
                {
                  {
                    commodity: "Commodity",
                    pickupLocation: "Pickup",
                    destination: "Destination",
                    quantitySCU: "Required SCU",
                    deliveredSCU: "Delivered SCU",
                  }[k]
                }
                <input
                  aria-label={"Correct " + k + " " + (i + 1)}
                  type={k.endsWith("SCU") ? "number" : "text"}
                  value={o[k] ?? ""}
                  onChange={(e) =>
                    row(
                      i,
                      k,
                      k.endsWith("SCU")
                        ? e.target.value === ""
                          ? null
                          : e.target.valueAsNumber
                        : e.target.value,
                    )
                  }
                />
              </label>
            ))}
        </div>
      ))}
      {issue.review.conflicts
        .filter((c) => {
          const p = c.path.split(".");
          const incoming =
            p[0] === "objectives"
              ? (
                  draft.objectives[Number(p[1])] as unknown as Record<
                    string,
                    unknown
                  >
                )?.[p[2]]
              : (draft as unknown as Record<string, unknown>)[p[0]];
          return (
            incoming !== null &&
            incoming !== "" &&
            JSON.stringify(incoming) !== JSON.stringify(c.stored)
          );
        })
        .map((c) => (
          <fieldset key={c.path}>
            <legend>
              {c.path.startsWith("objectives.")
                ? "Objective " +
                  (Number(c.path.split(".")[1]) + 1) +
                  " · " +
                  ({
                    quantitySCU: "Required SCU",
                    deliveredSCU: "Delivered SCU",
                    pickupLocation: "Pickup",
                    destination: "Destination",
                    commodity: "Commodity",
                  }[c.path.split(".")[2]] ?? "Field")
                : ({
                    name: "Title",
                    company: "Company",
                    payout: "Reward",
                    acceptedAt: "Acceptance time",
                  }[c.path] ?? "Field")}
            </legend>
            <label>
              <input
                type="radio"
                name={capture.id + c.path}
                checked={choices[c.path] === "Keep"}
                onChange={() => setChoices({ ...choices, [c.path]: "Keep" })}
              />
              Keep stored: {String(c.stored)}
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
              Use screenshot: {String(c.reviewed)}
            </label>
          </fieldset>
        ))}
      {capture.observation?.view.value !== "Accepted" && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          I accepted this contract in-game.
        </label>
      )}
      {!issue.coverageEstablished && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={coverage}
            onChange={(e) => setCoverage(e.target.checked)}
          />
          I checked the full objective list. Keep any existing objectives not
          shown here.
        </label>
      )}
      <button
        className="button primary"
        disabled={busy}
        onClick={() => void submit()}
      >
        Save corrected scan
      </button>
      <button
        className="button"
        disabled={busy}
        onClick={() => void load(target)}
      >
        Cancel changes
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
