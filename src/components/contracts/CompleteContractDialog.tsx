import { useEffect, useRef, useState } from "react";
import { Overlay } from "../ui/Overlay";
import type { Contract } from "../../types/models";
import { checklistProgress } from "../../types/workflow";
import { useCargoStore } from "../../stores/useCargoStore";
import { money, number } from "../../utils/format";
export function CompleteContractDialog({
  contract,
  onClose,
  onCompleted,
}: {
  contract: Contract | null;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const current =
      useCargoStore((s) => s.contracts.find((c) => c.id === contract?.id)) ??
      contract,
    complete = useCargoStore((s) => s.completeContract);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    lock = useRef(false),
    progress = current ? checklistProgress(current) : { done: 0, total: 0 };
  useEffect(() => setError(""), [contract?.id]);
  if (!contract) return null;
  return (
    <Overlay
      open={!!contract}
      onClose={() => {
        if (!lock.current) {
          setError("");
          onClose();
        }
      }}
      title="Complete contract?"
      subtitle="MANUAL COMPLETION"
      side="center"
    >
      <div className="dialog-body">
        <p>You are about to mark this contract as completed in Cargo Run.</p>
        <dl className="run-summary">
          <div>
            <dt>Contract</dt>
            <dd>{current?.name}</dd>
          </div>
          <div>
            <dt>Potential reward</dt>
            <dd>{money(current?.payout ?? null)}</dd>
          </div>
          <div>
            <dt>Objectives</dt>
            <dd>
              {progress.done} / {progress.total} deliveries marked done
            </dd>
          </div>
        </dl>
        {(progress.done < progress.total || !progress.total) && (
          <p className="notice warning" role="status">
            Some checklist entries are still pending or unknown. You can
            explicitly complete the contract anyway.
          </p>
        )}
        <p>
          {number(
            current?.cargoObjectives.reduce(
              (n, o) => n + (o.loadedSCU ?? 0),
              0,
            ) ?? 0,
          )}{" "}
          SCU remains recorded onboard. Completion preserves cargo and checklist
          states. No payout is confirmed; potential rewards are not earnings.
        </p>
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
          className="button primary"
          disabled={busy || current?.status !== "Active"}
          onClick={async () => {
            if (!current || lock.current) return;
            lock.current = true;
            setBusy(true);
            setError("");
            try {
              await complete(current.id);
              onClose();
              onCompleted?.();
            } catch (e) {
              setError(String(e));
            } finally {
              lock.current = false;
              setBusy(false);
            }
          }}
        >
          Confirm completion
        </button>
      </div>
    </Overlay>
  );
}
