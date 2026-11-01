import { useMemo } from "react";
import type { Contract } from "../../types/models";
import {
  groupByLocation,
  canonicalLocation,
  remainingSCU,
} from "../../stores/selectors";
import { number } from "../../utils/format";
import { EmptyState } from "../ui";
export function LocationStops({
  contracts,
  kind,
}: {
  contracts: Contract[];
  kind: "pickup" | "delivery";
}) {
  const groups = useMemo(
    () => groupByLocation(contracts, kind),
    [contracts, kind],
  );
  return (
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
              { required: number; remaining: number; delivered: number }
            >();
            const related = new Set<string>();
            for (const { objective: o } of g.rows) {
              if (!o) continue;
              const v = commodities.get(o.commodity) || {
                required: 0,
                remaining: 0,
                delivered: 0,
              };
              v.required += o.quantitySCU;
              v.remaining += remainingSCU(o);
              v.delivered += o.deliveredSCU;
              commodities.set(o.commodity, v);
              related.add(
                canonicalLocation(
                  kind === "pickup" ? o.destination : o.pickupLocation,
                  kind === "pickup" ? "delivery" : "pickup",
                ),
              );
            }
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
                  {g.contractCount !== 1 ? "s" : ""} · {number(g.required)}{" "}
                  required · {number(g.delivered)} delivered
                </p>
                <ul className="commodity-list">
                  {[...commodities]
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, v]) => (
                      <li key={name}>
                        <span>{name || "Unknown commodity"}</span>
                        <span className="numeric">
                          {number(v.remaining)} / {number(v.required)} SCU
                        </span>
                      </li>
                    ))}
                </ul>
                {g.unknownCargo && (
                  <p className="warning-text">
                    Some cargo quantities are unknown.
                  </p>
                )}
                <p className="stop-related">
                  {kind === "pickup" ? "To" : "From"}:{" "}
                  {[...related].sort().join(" · ") || "Locations not recorded"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
