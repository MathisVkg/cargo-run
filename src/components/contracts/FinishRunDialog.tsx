import { useEffect, useRef, useState } from "react";
import { Overlay } from "../ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import { checklistProgress } from "../../types/workflow";
import { number, money } from "../../utils/format";
export function FinishRunDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const contracts = useCargoStore((s) => s.contracts),
    run = useCargoStore((s) => s.currentRun),
    revision = useCargoStore((s) => s.revision),
    finish = useCargoStore((s) => s.finishRun),
    setPage = useCargoStore((s) => s.setPage);
  const [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [expected, setExpected] = useState({ runId: "", revision: 0 }),
    lock = useRef(false);
  useEffect(() => {
    if (open) {
      setSelected([]);
      setError("");
      setExpected({ runId: run.id, revision });
    }
  }, [open]);
  const active = contracts.filter(
    (c) =>
      c.status === "Active" &&
      !c.supersededBy &&
      run.contractIds.includes(c.id),
  );
  const completed = active.filter((c) => {
    const p = checklistProgress(c);
    return p.total > 0 && p.done === p.total;
  }).length;
  const onboard = contracts
    .filter((c) => !c.supersededBy)
    .reduce(
      (n, c) =>
        n + c.cargoObjectives.reduce((n, o) => n + (o.loadedSCU ?? 0), 0),
      0,
    );
  async function apply(ids: string[]) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await finish({
        confirmed: true,
        runId: expected.runId,
        expectedRevision: expected.revision,
        completeIds: ids,
      });
      onClose();
      setPage("History");
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!open) return null;
  return (
    <Overlay
      open={open}
      onClose={() => {
        if (!lock.current) onClose();
      }}
      title="Finish current run?"
      subtitle="RUN FINALIZATION"
      side="center"
    >
      <div className="dialog-body">
        <p>
          Save the current run's snapshot in History. Choose whether to finish
          only the run or also complete selected contracts.
        </p>
        <div className="run-summary">
          <span>{active.length} active contracts</span>
          <span>{completed} with completed checklists</span>
          <span>
            {active.length - completed} with outstanding checklist items
          </span>
          <span>
            {money(active.reduce((n, c) => n + (c.payout ?? 0), 0))} total
            potential payout
          </span>
          <span>{number(onboard)} SCU recorded onboard across ships</span>
        </div>
        <p>
          Finish run only carries active contracts forward unchanged. Completing
          selected contracts preserves checklist marks, delivery totals and
          onboard inventory. Potential rewards never become confirmed earnings.
        </p>
        <fieldset disabled={busy}>
          <legend>Contracts to complete (optional)</legend>
          {active.map((c) => {
            const p = checklistProgress(c);
            return (
              <label className="checkbox-label" key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, c.id]
                        : selected.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name} · {p.done} / {p.total} deliveries marked done
              </label>
            );
          })}
        </fieldset>
        {selected.some((id) => {
          const c = active.find((c) => c.id === id),
            p = c && checklistProgress(c);
          return !p || !p.total || p.done < p.total;
        }) && (
          <p className="notice warning" role="status">
            Selected contracts have pending or unknown checklist entries.
            Explicit completion is allowed; no checklist or physical cargo
            quantity will be changed.
          </p>
        )}
        {revision !== expected.revision && (
          <p className="warning-text">
            Operations changed while this dialog was open. Cancel and reopen to
            review current data.
          </p>
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-actions">
        <button className="button" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={busy || revision !== expected.revision}
          onClick={() => void apply([])}
        >
          Finish run only
        </button>
        <button
          className="button primary"
          disabled={busy || !selected.length || revision !== expected.revision}
          onClick={() => void apply(selected)}
        >
          Complete selected and finish
        </button>
      </div>
    </Overlay>
  );
}
