import { useMemo, useRef, useState } from "react";
import { ArrowUpFromLine, ArrowDownToLine } from "lucide-react";
import type { Contract } from "../../types/models";
import { groupByLocation, canonicalLocation } from "../../stores/selectors";
import { checklist, checklistStamp } from "../../types/workflow";
import { number } from "../../utils/format";
import { ContractDetails } from "./ContractDetails";
import { ChecklistToggle } from "../cargo/ChecklistToggle";
import { useCargoStore } from "../../stores/useCargoStore";
import { Badge, EmptyState } from "../ui";

export function LocationStops({
  contracts,
  kind,
}: {
  contracts: Contract[];
  kind: "pickup" | "delivery";
}) {
  const [detail, setDetail] = useState<Contract | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    lock = useRef(false);
  const update = useCargoStore((s) => s.checklist),
    groups = useMemo(() => groupByLocation(contracts, kind), [contracts, kind]);
  const isDone = (
    o: NonNullable<(typeof groups)[number]["rows"][number]["objective"]>,
  ) => (kind === "pickup" ? checklist(o).pickedUp : checklist(o).delivered);
  return (
    <>
      <section className="stop-section">
        <div className="section-heading">
          <h2>{kind === "pickup" ? "Pickup Stops" : "Delivery Stops"}</h2>
          <span className="muted">{groups.length} locations · A–Z</span>
        </div>
        {!groups.length ? (
          <EmptyState
            title="No planned stops"
            description="Cargo objectives will appear here when contracts are added."
          />
        ) : (
          <div className="stop-grid">
            {groups.map((g) => {
              const associated = [
                  ...new Map(
                    g.rows.map((r) => [r.contract.id, r.contract]),
                  ).values(),
                ],
                objectives = g.rows.flatMap((r) =>
                  r.objective ? [r.objective] : [],
                ),
                pending = objectives.filter((o) => !isDone(o)),
                done = objectives.length - pending.length,
                undoAll = objectives.length > 0 && !pending.length;
              return (
                <article className="panel stop-card" key={g.destination}>
                  <div className="stop-eyebrow">
                    <span>
                      {kind === "pickup" ? (
                        <ArrowUpFromLine size={15} />
                      ) : (
                        <ArrowDownToLine size={15} />
                      )}
                      {kind === "pickup" ? "PICKUP STOP" : "DELIVERY STOP"}
                    </span>
                    <Badge>
                      {g.contractCount} contract
                      {g.contractCount === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="stop-card-title">
                    <h3>{g.destination}</h3>
                    <strong
                      className="numeric"
                      title="Total required cargo at this stop"
                    >
                      {number(g.required)} <small>SCU</small>
                    </strong>
                  </div>
                  <div className="stop-cargo-list">
                    {g.rows.map(({ contract, objective: o }) =>
                      o ? (
                        <div
                          className={
                            "stop-cargo-row" + (isDone(o) ? " is-done" : "")
                          }
                          key={o.id}
                          data-objective-id={o.id}
                        >
                          <div className="stop-cargo-description">
                            <strong>
                              {o.commodity || "Unknown commodity"}
                            </strong>
                            <p>
                              <span className="numeric">
                                {number(o.quantitySCU)} SCU
                              </span>{" "}
                              {kind === "pickup" ? "→" : "from"}{" "}
                              {canonicalLocation(
                                kind === "pickup"
                                  ? o.destination
                                  : o.pickupLocation,
                                kind === "pickup" ? "delivery" : "pickup",
                              )}
                            </p>
                            {g.rows.filter(
                              (r) =>
                                r.objective?.commodity === o.commodity &&
                                r.objective?.destination === o.destination &&
                                r.objective?.pickupLocation ===
                                  o.pickupLocation,
                            ).length > 1 && (
                              <small className="checklist-contract">
                                {contract.name}
                              </small>
                            )}
                          </div>
                          <ChecklistToggle objective={o} kind={kind} />
                        </div>
                      ) : (
                        <p key={contract.id} className="muted">
                          Cargo is not yet known for {contract.name}.
                        </p>
                      ),
                    )}
                  </div>
                  <footer className="stop-card-footer">
                    <div className="stop-progress">
                      <span>
                        {done} of {objectives.length}{" "}
                        {kind === "pickup" ? "pickups" : "deliveries"} marked
                        done
                      </span>
                      {kind === "pickup" && (
                        <button
                          className="button small"
                          disabled={busy || !objectives.length}
                          onClick={async () => {
                            if (lock.current) return;
                            lock.current = true;
                            setBusy(true);
                            setMessage("");
                            try {
                              await update({
                                requestId: crypto.randomUUID(),
                                changes: (undoAll ? objectives : pending).map(
                                  (o) => ({
                                    objectiveId: o.id,
                                    kind,
                                    done: !undoAll,
                                    expected: checklistStamp(o),
                                  }),
                                ),
                              });
                              setMessage(
                                undoAll
                                  ? "Pickup marks cleared. Recorded cargo is unchanged."
                                  : "All entries at " +
                                      g.destination +
                                      " marked picked up. Recorded cargo is unchanged.",
                              );
                            } catch (e) {
                              setMessage(String(e));
                            } finally {
                              lock.current = false;
                              setBusy(false);
                            }
                          }}
                        >
                          {undoAll ? "Undo all" : "Mark all picked up"}
                        </button>
                      )}
                    </div>
                    {associated.length === 1 ? (
                      <button
                        className="text-button stop-contract-link"
                        onClick={() => setDetail(associated[0])}
                      >
                        View Contract
                      </button>
                    ) : (
                      <details className="associated-contracts">
                        <summary>
                          View {associated.length} associated contracts
                        </summary>
                        <ul>
                          {associated.map((c) => (
                            <li key={c.id}>
                              <button
                                className="text-button"
                                onClick={() => setDetail(c)}
                              >
                                {c.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
    </>
  );
}
