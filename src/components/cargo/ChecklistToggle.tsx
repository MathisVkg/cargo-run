import { useRef, useState } from "react";
import type { CargoObjective } from "../../types/models";
import { checklist, checklistStamp } from "../../types/workflow";
import { useCargoStore } from "../../stores/useCargoStore";
export function ChecklistToggle({
  objective,
  kind,
  disabled = false,
}: {
  objective: CargoObjective;
  kind: "pickup" | "delivery";
  disabled?: boolean;
}) {
  const update = useCargoStore((s) => s.checklist),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    lock = useRef(false);
  const done =
    kind === "pickup"
      ? checklist(objective).pickedUp
      : checklist(objective).delivered;
  return (
    <div className="checklist-action">
      <span className="checklist-state">{done ? "Done" : "Pending"}</span>
      <button
        className={"button small " + (done ? "checklist-done" : "")}
        aria-pressed={done}
        aria-label={
          (done ? "Undo " : "Mark ") +
          (kind === "pickup" ? "pickup" : "delivery") +
          (done ? "" : " done") +
          " for " +
          objective.id
        }
        disabled={busy || disabled}
        onClick={async () => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setMessage("");
          try {
            await update({
              requestId: crypto.randomUUID(),
              changes: [
                {
                  objectiveId: objective.id,
                  kind,
                  done: !done,
                  expected: checklistStamp(objective),
                },
              ],
            });
            setMessage("Checklist updated");
          } catch (e) {
            setMessage(String(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {done
          ? "Undo"
          : kind === "pickup"
            ? "Mark picked up"
            : "Mark delivered"}
      </button>
      {message && <small role="status">{message}</small>}
    </div>
  );
}
