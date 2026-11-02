import { ProgressControls } from "../cargo/ProgressControls";
import { loaded, awaitingPickup } from "../../types/progress";
import { useMemo, useState } from "react";
import type { Contract } from "../../types/models";
import {
  groupByLocation,
  canonicalLocation,
  remainingSCU,
} from "../../stores/selectors";
import { number } from "../../utils/format";
import { ContractDetails } from "./ContractDetails";
import { EmptyState } from "../ui";
export function LocationStops({
  contracts,
  kind,
}: {
  contracts: Contract[];
  kind: "pickup" | "delivery";
}) {
  const [detail, setDetail] = useState<Contract | null>(null);
  const groups = useMemo(
    () => groupByLocation(contracts, kind),
    [contracts, kind],
  );
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
              const commodities = new Map<
                string,
                {
                  required: number;
                  remaining: number;
                  delivered: number;
                  loaded: number;
                  awaiting: number;
                }
              >();
              const related = new Set<string>();
              for (const { objective: o } of g.rows) {
                if (!o) continue;
                const v = commodities.get(o.commodity) || {
                  required: 0,
                  remaining: 0,
                  delivered: 0,
                  loaded: 0,
                  awaiting: 0,
                };
                v.required += o.quantitySCU;
                v.remaining += remainingSCU(o);
                v.delivered += o.deliveredSCU;
                v.loaded += loaded(o);
                v.awaiting += awaitingPickup(o);
                commodities.set(o.commodity, v);
                related.add(
                  canonicalLocation(
                    kind === "pickup" ? o.destination : o.pickupLocation,
                    kind === "pickup" ? "delivery" : "pickup",
                  ),
                );
              }
              const associated = [
                ...new Map(
                  g.rows.map((r) => [r.contract.id, r.contract]),
                ).values(),
              ];
              const relevant = (id: string) =>
                g.rows
                  .filter((r) => r.contract.id === id)
                  .reduce(
                    (n, r) => n + (r.objective ? remainingSCU(r.objective) : 0),
                    0,
                  );
              return (
                <article className="panel stop-card" key={g.destination}>
                  <div className="stop-card-title">
                    <h3>{g.destination}</h3>
                    <strong className="numeric">
                      {number(g.scu)} <small>SCU remaining</small>
                    </strong>
                  </div>
                  <p>
                    {g.contractCount} associated contract
                    {g.contractCount !== 1 ? "s" : ""} · {number(g.delivered)}{" "}
                    delivered / {number(g.required)} required
                  </p>
                  <ul className="commodity-list">
                    {[...commodities]
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([name, v]) => (
                        <li key={name}>
                          <span>{name || "Unknown commodity"}</span>
                          <span className="numeric">
                            {number(v.remaining)} SCU remaining
                            <br />
                            <small>
                              {kind === "pickup"
                                ? number(v.awaiting) +
                                  " awaiting pickup · " +
                                  number(v.loaded) +
                                  " loaded · " +
                                  number(v.required) +
                                  " required"
                                : number(v.delivered) +
                                  " delivered / " +
                                  number(v.required) +
                                  " required · " +
                                  number(v.loaded) +
                                  " onboard"}
                            </small>
                          </span>
                        </li>
                      ))}
                  </ul>
                  <details className="stop-cargo-allocations">
                    <summary>Objective allocations & cargo actions</summary>
                    {g.rows.map(
                      ({ contract, objective: o }) =>
                        o && (
                          <div key={o.id}>
                            <strong>
                              {contract.name} · {o.commodity}
                            </strong>
                            <p>
                              {number(o.quantitySCU)} required ·{" "}
                              {number(awaitingPickup(o))} awaiting pickup ·{" "}
                              {number(loaded(o))} onboard ·{" "}
                              {number(o.deliveredSCU)} delivered ·{" "}
                              {number(remainingSCU(o))} remaining
                            </p>
                            <ProgressControls
                              contract={contract}
                              objective={o}
                              kind={kind}
                            />
                          </div>
                        ),
                    )}
                  </details>
                  {g.unknownCargo && (
                    <p className="warning-text">
                      Some cargo quantities are unknown.
                    </p>
                  )}
                  <p className="stop-related">
                    {kind === "pickup" ? "To" : "From"}:{" "}
                    {[...related].sort().join(" · ") ||
                      "Locations not recorded"}
                  </p>
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
                            <span>{number(relevant(c.id))} SCU remaining</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
    </>
  );
}
