import { useMemo, useRef, useState } from "react";
import type { Contract } from "../../types/models";
import { groupByLocation, canonicalLocation } from "../../stores/selectors";
import { checklist, checklistStamp } from "../../types/workflow";
import { number } from "../../utils/format";
import { ContractDetails } from "./ContractDetails";
import { ChecklistToggle } from "../cargo/ChecklistToggle";
import { useCargoStore } from "../../stores/useCargoStore";
import { EmptyState } from "../ui";
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
                pending = g.rows.filter(
                  (r) => r.objective && !checklist(r.objective).pickedUp,
                );
              return (
                <article className="panel stop-card" key={g.destination}>
                  <div className="stop-card-title">
                    <h3>{g.destination}</h3>
                    <strong className="numeric">
                      {number(g.required)} <small>SCU required</small>
                    </strong>
                  </div>
                  <p>
                    {g.contractCount} associated contract
                    {g.contractCount === 1 ? "" : "s"}
                  </p>
                  <div className="table-scroll">
                    <table className="cargo-table stop-checklist">
                      <thead>
                        <tr>
                          <th>Cargo</th>
                          <th>Quantity</th>
                          <th>
                            {kind === "pickup" ? "Destination" : "Origin"}
                          </th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map(({ contract, objective: o }) =>
                          o ? (
                            <tr key={o.id} data-objective-id={o.id}>
                              <td>
                                {o.commodity || "Unknown commodity"}
                                <small className="checklist-contract">
                                  {contract.name}
                                </small>
                              </td>
                              <td className="numeric">
                                {number(o.quantitySCU)} SCU
                              </td>
                              <td>
                                {canonicalLocation(
                                  kind === "pickup"
                                    ? o.destination
                                    : o.pickupLocation,
                                  kind === "pickup" ? "delivery" : "pickup",
                                )}
                              </td>
                              <td>
                                <ChecklistToggle objective={o} kind={kind} />
                              </td>
                            </tr>
                          ) : (
                            <tr key={contract.id}>
                              <td colSpan={4}>
                                Cargo is not yet known for {contract.name}.
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <footer className="stop-card-footer">
                    {kind === "pickup" && (
                      <button
                        className="button small"
                        disabled={busy || !pending.length}
                        onClick={async () => {
                          if (lock.current) return;
                          lock.current = true;
                          setBusy(true);
                          setMessage("");
                          try {
                            await update({
                              requestId: crypto.randomUUID(),
                              changes: pending.map((r) => ({
                                objectiveId: r.objective!.id,
                                kind: "pickup",
                                done: true,
                                expected: checklistStamp(r.objective!),
                              })),
                            });
                            setMessage(
                              "All entries at " +
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
                        Mark all picked up
                      </button>
                    )}
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
