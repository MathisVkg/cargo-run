import { activeContracts } from "../../stores/selectors";
import { useRef, useState } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
import { cargoPlan, plannedSCU, type PlanStop } from "../../stores/cargoPlan";
import { checklist, checklistStamp } from "../../types/workflow";
import { number } from "../../utils/format";
import { ShipCargoGrid } from "../../components/cargo/ShipCargoGrid";
import { EmptyState } from "../../components/ui";
function Stop({ stop, kind }: { stop: PlanStop; kind: "pickup" | "delivery" }) {
  const update = useCargoStore((s) => s.checklist),
    lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="panel plan-stop" open>
      <summary>
        <strong>{stop.location}</strong>
        <span className="numeric">{number(stop.scu)} SCU</span>
      </summary>
      <div className="plan-lines">
        {stop.lines.map((l) => {
          const done = l.objectives.filter((o) =>
              kind === "pickup"
                ? checklist(o).pickedUp
                : checklist(o).delivered,
            ).length,
            all = done === l.objectives.length;
          return (
            <div className="plan-line" key={l.commodity + "|" + l.route}>
              <div>
                <strong>{l.commodity}</strong>
                <p>
                  <span className="numeric">{number(l.scu)} SCU</span>{" "}
                  {kind === "pickup" ? "→" : "from"} {l.route}
                </p>
              </div>
              <button
                className={"reminder-toggle" + (all ? " done" : "")}
                disabled={busy}
                aria-pressed={all}
                title="Optional reminder only; no cargo movement or contract completion"
                aria-label={
                  (all ? "Undo " : "Mark ") +
                  kind +
                  " reminder for " +
                  l.commodity +
                  " " +
                  l.route
                }
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError("");
                  try {
                    await update({
                      requestId: crypto.randomUUID(),
                      changes: l.objectives
                        .filter(
                          (o) =>
                            all ||
                            (kind === "pickup"
                              ? !checklist(o).pickedUp
                              : !checklist(o).delivered),
                        )
                        .map((o) => ({
                          objectiveId: o.id,
                          kind,
                          done: !all,
                          expected: checklistStamp(o),
                        })),
                    });
                  } catch (e) {
                    setError(String(e));
                  } finally {
                    lock.current = false;
                    setBusy(false);
                  }
                }}
              >
                {all ? "✓" : done ? done + "/" + l.objectives.length : "○"}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
export default function Cargo() {
  const contracts = useCargoStore((s) => s.contracts),
    ships = useCargoStore((s) => s.ships),
    selected = useCargoStore((s) => s.selectedShipId),
    ship = ships.find((s) => s.id === selected),
    planned = plannedSCU(contracts),
    capacity = ship?.cargoCapacitySCU ?? 0,
    pickups = cargoPlan(contracts, "pickup"),
    deliveries = cargoPlan(contracts, "delivery"),
    unresolved = activeContracts(contracts).filter(
      (c) => !c.cargoObjectives.length,
    ).length;
  return (
    <>
      <header className="foundation-page-heading">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1>Cargo Plan</h1>
        </div>
        <div className="plan-utilization">
          <strong className="numeric">
            {number(planned)} / {number(capacity)} SCU
          </strong>
          <progress
            value={Math.min(planned, capacity)}
            max={Math.max(1, capacity)}
            aria-label="Planned cargo utilization"
          />
          <small>Required by active contracts · not recorded onboard</small>
        </div>
      </header>
      {planned > capacity && (
        <p className="notice warning" role="status">
          Planned cargo exceeds capacity by {number(planned - capacity)} SCU.
          Additional contracts are still allowed.
        </p>
      )}
      {unresolved > 0 && (
        <p className="notice warning">
          {unresolved} active contract(s) need cargo details. Their unknown
          quantities are excluded from this plan; review them in Contracts.
        </p>
      )}
      {!pickups.length && !unresolved && (
        <EmptyState
          title="No cargo planned"
          description="Add an accepted contract to see its pickup and delivery plan."
        />
      )}
      <div className="cargo-plan-columns">
        {(["pickup", "delivery"] as const).map((kind) => (
          <details className="plan-group" open key={kind}>
            <summary>
              <h2>{kind === "pickup" ? "Pickups" : "Deliveries"}</h2>
              <span>
                {(kind === "pickup" ? pickups : deliveries).length} locations
              </span>
            </summary>
            {(kind === "pickup" ? pickups : deliveries).map((stop) => (
              <Stop key={stop.location} stop={stop} kind={kind} />
            ))}
          </details>
        ))}
        <ShipCargoGrid
          ship={ship?.name ?? "Selected ship unavailable"}
          capacity={capacity}
          planned={planned}
        />
      </div>
      <p className="plan-footnote">
        ○ Optional reminders. Marks never move cargo, complete contracts or
        confirm earnings.
      </p>
    </>
  );
}
