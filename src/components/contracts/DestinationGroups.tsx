import { ContractDetails } from "./ContractDetails";
import { useState } from "react";
import { ChevronDown, MapPin, Pencil, Ban, ArrowRight } from "lucide-react";
import { groupByDestination } from "../../stores/selectors";
import { money, number } from "../../utils/format";
import { Badge, EmptyState } from "../ui";
import { Overlay } from "../ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import type { Contract } from "../../types/models";
export function DestinationGroups({
  contracts,
  manifest = false,
  onEdit,
}: {
  contracts: Contract[];
  manifest?: boolean;
  onEdit?(contract: Contract): void;
}) {
  const [detail, setDetail] = useState<Contract | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["Area18"]));
  const [abandon, setAbandon] = useState<Contract | null>(null);
  const abandonContract = useCargoStore((s) => s.abandonContract);
  const groups = groupByDestination(contracts);
  if (!groups.length)
    return (
      <EmptyState
        title="Cargo hold standing by"
        description="Add a contract to start organizing your next delivery run."
      />
    );
  return (
    <div className="destination-groups">
      {groups.map((g, i) => (
        <section className="destination-group" key={g.destination}>
          <h3>
            <button
              className="destination-toggle"
              aria-expanded={expanded.has(g.destination)}
              aria-controls={"destination-" + i}
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(g.destination)) next.delete(g.destination);
                  else next.add(g.destination);
                  return next;
                })
              }
            >
              <span
                className={
                  "chevron " + (expanded.has(g.destination) ? "expanded" : "")
                }
              >
                <ChevronDown size={17} />
              </span>
              <span className="destination-icon">
                <MapPin size={18} />
              </span>
              <span className="destination-name">
                {g.destination}
                <small>
                  {g.contractCount} linked contract
                  {g.contractCount !== 1 ? "s" : ""}
                </small>
              </span>
              <span className="group-total numeric">
                {g.unknownCargo ? "Unknown" : number(g.scu)} <small>SCU</small>
              </span>
              <span
                className="group-payout numeric"
                title="Contract payout allocated proportionally by required SCU"
              >
                {g.unknownPayouts && g.allocatedPayout === 0
                  ? "Unknown"
                  : money(g.allocatedPayout)}
                {g.unknownPayouts && g.allocatedPayout > 0 ? " + unknown" : ""}
                <small>allocated potential</small>
              </span>
            </button>
          </h3>
          {expanded.has(g.destination) && (
            <div id={"destination-" + i} className="table-scroll">
              <table className="cargo-table">
                <thead>
                  <tr>
                    <th>
                      {manifest
                        ? "Commodity / contract"
                        : "Contract / commodity"}
                    </th>
                    <th>{manifest ? "Route" : "Pickup location"}</th>
                    <th className="align-right">Assigned</th>
                    {!manifest && (
                      <th className="align-right">Contract payout</th>
                    )}
                    <th>Status</th>
                    <th>Source</th>
                    {onEdit && (
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map(({ contract: c, objective: o }) => (
                    <tr key={o?.id ?? c.id}>
                      <td>
                        <strong>
                          {manifest
                            ? (o?.commodity ?? "Unknown commodity")
                            : c.name}
                        </strong>
                        <small>
                          {manifest
                            ? c.name
                            : (o?.commodity ?? "Awaiting delivery objective")}
                          {c.dataOrigin === "Sample" && (
                            <span className="sample-tag">SAMPLE</span>
                          )}
                        </small>
                      </td>
                      <td>
                        <span>{o?.pickupLocation || "Unknown pickup"}</span>
                        {manifest && (
                          <small className="route-destination">
                            <ArrowRight size={12} />
                            {o?.destination || "Unresolved Destination"}
                          </small>
                        )}
                      </td>
                      <td className="align-right numeric">
                        {o
                          ? number(Math.max(0, o.quantitySCU - o.deliveredSCU))
                          : "Unknown"}{" "}
                        <span className="muted">SCU</span>
                        {o && (
                          <small>
                            Required {number(o.quantitySCU)} · Delivered{" "}
                            {number(o.deliveredSCU)}
                          </small>
                        )}
                      </td>
                      {!manifest && (
                        <td
                          className="align-right numeric"
                          title="Full contract payout; counted once in dashboard earnings"
                        >
                          {money(c.payout)}
                          {c.cargoObjectives.length > 1 && (
                            <small>shared across stops</small>
                          )}
                        </td>
                      )}
                      <td>
                        <Badge tone="amber">{c.status}</Badge>
                      </td>
                      <td>
                        <span className="source-label">
                          {(c.sources ?? [c.source]).join(" + ")}
                        </span>
                        <button
                          className="text-button"
                          aria-label={"Details for " + c.name}
                          onClick={() => setDetail(c)}
                        >
                          Details / evidence
                        </button>
                      </td>
                      {onEdit && (
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              disabled={c.source === "Log"}
                              title={
                                c.source === "Log"
                                  ? "Log contracts are updated from observed events"
                                  : "Edit manual contract"
                              }
                              aria-label={"Edit " + c.name}
                              onClick={() => onEdit(c)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-button"
                              aria-label={"Abandon " + c.name}
                              onClick={() => setAbandon(c)}
                            >
                              <Ban size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
      <Overlay
        open={!!abandon}
        onClose={() => setAbandon(null)}
        side="center"
        title="Abandon contract?"
        subtitle="CONTRACT ACTION"
      >
        <div className="dialog-body">
          <p>
            “{abandon?.name}” will leave the active manifest and remain in
            History as abandoned. No payout will be recorded.
          </p>
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setAbandon(null)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              if (abandon) abandonContract(abandon.id);
              setAbandon(null);
            }}
          >
            Abandon contract
          </button>
        </div>
      </Overlay>
    </div>
  );
}
