import { useState } from "react";
import { Flag, TriangleAlert } from "lucide-react";
import { Overlay } from "../ui/Overlay";
import { operationStats } from "../../stores/selectors";
import { useCargoStore } from "../../stores/useCargoStore";
import { number, money } from "../../utils/format";
export function FinishRunDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const [saving, setSaving] = useState(false);
  const contracts = useCargoStore((s) => s.contracts);
  const finish = useCargoStore((s) => s.finishRun);
  const setPage = useCargoStore((s) => s.setPage);
  const stats = operationStats(contracts);
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title="Finish current run?"
      subtitle="RUN FINALIZATION"
      side="center"
    >
      <div className="dialog-body">
        <div className="dialog-symbol">
          <Flag size={27} />
        </div>
        <p>This closes the current run and saves a snapshot in History.</p>
        <div className="run-summary">
          <span>{stats.missions} active contracts</span>
          <span>{number(stats.scu)} SCU</span>
          <span>{money(stats.potential)} potential</span>
        </div>
        <div className="notice warning">
          <TriangleAlert size={19} />
          <p>
            Finishing a run does not complete its contracts. Unfinished
            contracts retain their status and carry forward into the next run.
            Potential payouts are never recorded as earned.
          </p>
        </div>
      </div>
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await finish();
              onClose();
              setPage("History");
            } catch {
              /* Global error banner shows persistence failures. */
            } finally {
              setSaving(false);
            }
          }}
        >
          Confirm & finish run
        </button>
      </div>
    </Overlay>
  );
}
