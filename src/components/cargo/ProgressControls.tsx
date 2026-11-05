import { useEffect, useRef, useState } from "react";
import type { CargoObjective, Contract } from "../../types/models";
import {
  loaded,
  inventoryActions,
  canUndoInventory,
  cargoValues,
  awaitingPickup,
  progressStamp,
  type CargoActivity,
  type ProgressChange,
} from "../../types/progress";
import { useCargoStore } from "../../stores/useCargoStore";

export function ProgressControls({
  contract,
  objective: o,
  kind,
}: {
  contract: Contract;
  objective: CargoObjective;
  kind: "pickup" | "delivery";
}) {
  const shipId = useCargoStore((s) => s.selectedShipId),
    ships = useCargoStore((s) => s.ships),
    revision = useCargoStore((s) => s.revision),
    update = useCargoStore((s) => s.recordProgress);
  const closed = contract.status !== "Active";
  const [quantity, setQuantity] = useState(""),
    [action, setAction] = useState<ProgressChange["action"]>(
      closed ? "Unload" : kind === "pickup" ? "Load" : "Deliver",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [last, setLast] = useState<CargoActivity | undefined>();
  const lock = useRef(false);
  useEffect(() => {
    let live = true;
    void window.cargoRun
      .cargoActivity(contract.id)
      .then((a) => {
        if (live) setLast(a.find((a) => a.objectiveId === o.id));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [contract.id, o.id, revision]);
  const offShip = loaded(o) > 0 && o.loadedShipId !== shipId;
  const run = async (action: ProgressChange["action"], quantity: number) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await update({
        requestId: crypto.randomUUID(),
        shipId,
        changes: [
          {
            objectiveId: o.id,
            action,
            quantity,
            expected: progressStamp(o),
            ...(action === "Undo" ? { undoId: last?.id } : {}),
          },
        ],
      });
      setQuantity("");
    } catch (e) {
      setError(String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const available = inventoryActions(contract.status);
  const selectedAction = available.includes(action) ? action : available[0];
  const full = closed
    ? loaded(o)
    : kind === "pickup"
      ? awaitingPickup(o)
      : loaded(o);
  return (
    <div className="cargo-progress-control" data-objective-id={o.id}>
      <span className="form-note">
        {o.loadEvidence === "Manual"
          ? "Manually recorded load"
          : "Load not confirmed"}
        {loaded(o) > 0
          ? " · " +
            (ships.find((s) => s.id === o.loadedShipId)?.name ?? "Saved ship")
          : ""}
      </span>
      <div className="cargo-quick-buttons">
        <button
          className="button small"
          disabled={busy || offShip || full <= 0}
          onClick={() =>
            void run(
              closed ? "Unload" : kind === "pickup" ? "Load" : "Deliver",
              full,
            )
          }
        >
          {closed
            ? "Unload cargo"
            : kind === "pickup"
              ? "Load remainder"
              : "Deliver onboard"}
        </button>
        <details>
          <summary>
            {closed
              ? "Adjust retained cargo"
              : kind === "pickup"
                ? "Record loading"
                : "Record delivery"}
          </summary>
          <p>
            {contract.name} · {o.commodity} · {o.pickupLocation} →{" "}
            {o.destination}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(selectedAction, Number(quantity));
            }}
          >
            <label>
              Action
              <select
                aria-label="Action"
                value={selectedAction}
                onChange={(e) =>
                  setAction(e.target.value as ProgressChange["action"])
                }
                disabled={busy || offShip}
              >
                {available.map((a) => (
                  <option key={a} value={a}>
                    {a === "Load"
                      ? "Load additional cargo"
                      : a === "Deliver"
                        ? "Deliver onboard cargo"
                        : a === "Unload"
                          ? closed
                            ? "Unload cargo"
                            : "Unload without delivery"
                          : "Correct onboard quantity"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantity (SCU)
              <input
                type="number"
                aria-label="Quantity (SCU)"
                min={selectedAction === "SetLoaded" ? 0 : 0.000001}
                max={closed ? loaded(o) : undefined}
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={busy || offShip}
              />
            </label>
            <button className="button primary small" disabled={busy || offShip}>
              Record progress
            </button>
          </form>
          <p className="form-note">
            {closed
              ? "Unload removes cargo from its assigned ship. Correction sets an absolute onboard total, downward only. Status, delivery totals and earnings stay unchanged."
              : "Correction sets the onboard total. Unloading returns cargo to awaiting pickup. Delivery consumes recorded onboard cargo and does not complete the contract or confirm payout."}
          </p>
        </details>
        {last?.source === "Manual" &&
          last.action !== "Undo" &&
          canUndoInventory(contract.status, cargoValues(o), last.previous) && (
            <button
              className="text-button"
              disabled={busy || offShip}
              onClick={() => void run("Undo", 0)}
            >
              Undo last cargo change
            </button>
          )}
      </div>
      {offShip && (
        <p className="warning-text">
          Select the ship holding this cargo to update it.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
