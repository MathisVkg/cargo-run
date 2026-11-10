import { ChecklistToggle } from "../../components/cargo/ChecklistToggle";
import { ProgressControls } from "../../components/cargo/ProgressControls";
import { loaded } from "../../types/progress";
import { recordedOnboard } from "../../stores/selectors";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Container,
  MapPin,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import {
  activeContracts,
  contractSCU,
  outstandingSCU,
  groupByLocation,
  progressLabel,
  remainingSCU,
} from "../../stores/selectors";
import { number } from "../../utils/format";
import { PageHeader, StatCard, EmptyState } from "../../components/ui";
import { ContractDetails } from "../../components/contracts/ContractDetails";
import type { CargoObjective, Contract } from "../../types/models";
export default function Manifest() {
  const contracts = useCargoStore((s) => s.contracts),
    shipId = useCargoStore((s) => s.selectedShipId),
    ships = useCargoStore((s) => s.ships);
  const inventory = useRef<HTMLElement>(null);
  const inventoryRequest = useCargoStore((s) => s.retainedInventoryRequest);
  useEffect(() => {
    if (inventoryRequest) {
      inventory.current?.scrollIntoView({ block: "start" });
      inventory.current?.focus({ preventScroll: true });
    }
  }, [inventoryRequest]);
  const [detail, setDetail] = useState<Contract | null>(null);
  const data = useMemo(() => {
    const active = activeContracts(contracts);
    return {
      active,
      required: active.reduce((n, c) => n + contractSCU(c), 0),
      remaining: active.reduce((n, c) => n + outstandingSCU(c), 0),
      commodities: new Set(
        active.flatMap((c) => c.cargoObjectives.map((o) => o.commodity)),
      ).size,
      pickups: groupByLocation(active, "pickup"),
      deliveries: groupByLocation(active, "delivery"),
    };
  }, [contracts]);
  return (
    <>
      <PageHeader
        eyebrow="FLEET OPERATIONS / CARGO"
        title="Cargo Manifest"
        description="A cargo checklist of required quantities and recorded delivery progress."
      />
      <div className="stats-grid manifest-stats">
        <StatCard
          label="Total Planned SCU"
          value={number(data.required)}
          detail="Required across active contracts"
          icon={<Container size={17} />}
        />
        <StatCard
          label="Outstanding SCU"
          value={number(data.remaining)}
          detail="Required minus delivered"
          icon={<Package size={17} />}
        />
        <StatCard
          label="Unique Commodities"
          value={data.commodities}
          detail="Distinct cargo types"
          icon={<Package size={17} />}
        />
        <StatCard
          label="Pickup Locations"
          value={data.pickups.length}
          detail="Collection groups"
          icon={<ArrowUpFromLine size={17} />}
        />
        <StatCard
          label="Delivery Locations"
          value={data.deliveries.length}
          detail="Delivery groups"
          icon={<MapPin size={17} />}
        />
      </div>
      <p className="planning-note">
        Recorded onboard: {number(recordedOnboard(contracts, shipId))} /{" "}
        {number(ships.find((s) => s.id === shipId)?.cargoCapacitySCU ?? 0)} SCU
        on selected ship. Expand an objective to record cargo or update its
        checklist.
      </p>
      {!data.active.length && (
        <EmptyState
          title="Manifest is empty"
          description="Add an active contract to plan its cargo."
        />
      )}
      {(["pickup", "delivery"] as const).map((kind) => (
        <details
          className="manifest-section manifest-disclosure"
          key={kind}
          open
        >
          <summary>
            <h2>
              {kind === "pickup" ? (
                <>
                  <ArrowUpFromLine size={18} /> Collection
                </>
              ) : (
                <>
                  <ArrowDownToLine size={18} /> Delivery
                </>
              )}
            </h2>
          </summary>
          {(kind === "pickup" ? data.pickups : data.deliveries).map((g) => (
            <section className="panel manifest-group" key={g.destination}>
              <div className="panel-heading">
                <h3>{g.destination}</h3>
                <span>
                  {g.contractCount} contracts · {number(g.scu)} SCU remaining
                </span>
              </div>
              <div className="table-scroll">
                <table className="cargo-table">
                  <thead>
                    <tr>
                      <th>Commodity</th>
                      <th>Contract reference</th>
                      <th>
                        {kind === "pickup" ? "Intended destination" : "Pickup"}
                      </th>
                      <th className="align-right">Required</th>
                      <th className="align-right">
                        {kind === "pickup" ? "Onboard" : "Delivered"}
                      </th>
                      <th className="align-right">Remaining</th>
                      <th>Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(({ contract: c, objective: o }) => (
                      <ManifestRow
                        key={c.id + ":" + (o?.id ?? "unknown")}
                        contract={c}
                        objective={o}
                        kind={kind}
                        onDetails={() => setDetail(c)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </details>
      ))}
      <section
        className="manifest-section"
        id="retained-inventory"
        ref={inventory}
        tabIndex={-1}
      >
        <h2>Retained onboard inventory</h2>
        <p className="form-note">
          All ships, including completed and abandoned contracts. Closed cargo
          remains onboard and uses capacity until explicitly unloaded. Select
          its ship to adjust it. History cleanup is blocked while closed cargo
          remains onboard.
        </p>
        {contracts
          .filter((c) => !c.supersededBy)
          .flatMap((c) =>
            c.cargoObjectives
              .filter(
                (o) =>
                  loaded(o) > 0 &&
                  (c.status !== "Active" || o.loadedShipId !== shipId),
              )
              .map((o) => (
                <article className="panel retained-cargo" key={o.id}>
                  <strong>
                    {c.name} · {c.status} · {o.commodity}
                  </strong>
                  <p>
                    {number(loaded(o))} SCU on{" "}
                    {ships.find((s) => s.id === o.loadedShipId)?.name ??
                      "Saved ship"}
                  </p>
                  <ProgressControls
                    contract={c}
                    objective={o}
                    kind="delivery"
                  />
                </article>
              )),
          )}
      </section>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function ManifestRow({
  contract: c,
  objective: o,
  kind,
  onDetails,
}: {
  contract: Contract;
  objective?: CargoObjective | null;
  kind: "pickup" | "delivery";
  onDetails(): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = "cargo-" + kind + "-" + (o?.id ?? c.id);
  return (
    <Fragment>
      <tr data-objective-id={o?.id}>
        <td>
          <strong>{o?.commodity || "Unknown cargo"}</strong>
        </td>
        <td>
          <button className="text-button" onClick={onDetails}>
            {c.name}
          </button>
        </td>
        <td>
          {(kind === "pickup" ? o?.destination : o?.pickupLocation) ||
            "Unknown location"}
        </td>
        <td className="numeric align-right">
          {o ? number(o.quantitySCU) : "—"}
        </td>
        <td className="numeric align-right">
          {o ? number(kind === "pickup" ? loaded(o) : o.deliveredSCU) : "—"}
        </td>
        <td className="numeric align-right">
          {o ? number(remainingSCU(o)) : "—"}
        </td>
        <td>
          {o ? (
            <button
              className="button small objective-expand"
              aria-label={"Cargo actions for " + o.commodity + " " + o.id}
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() => setExpanded(!expanded)}
            >
              {progressLabel(c, o)}{" "}
              <span aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
          ) : (
            "Awaiting objectives"
          )}
        </td>
      </tr>
      {expanded && o && (
        <tr className="objective-detail-row">
          <td colSpan={7}>
            <div className="objective-detail-content" id={id}>
              <div>
                <h4>
                  {kind === "pickup" ? "Pickup reminder" : "Delivery reminder"}
                </h4>
                <ChecklistToggle objective={o} kind={kind} />
                <p className="form-note">Checklist only · no cargo movement</p>
              </div>
              <div>
                <h4>Recorded cargo</h4>
                <ProgressControls contract={c} objective={o} kind={kind} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
