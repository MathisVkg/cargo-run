import { ProgressControls } from "../../components/cargo/ProgressControls";
import { loaded, awaitingPickup } from "../../types/progress";
import { recordedOnboard } from "../../stores/selectors";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { Contract } from "../../types/models";
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
        on selected ship. Unconfirmed loads are not verified empty. Individual
        allocations below retain objective identity; no grouped quantity is
        applied automatically.
      </p>
      {!data.active.length && (
        <EmptyState
          title="Manifest is empty"
          description="Add an active contract to plan its cargo."
        />
      )}
      {(["pickup", "delivery"] as const).map((kind) => (
        <section className="manifest-section" key={kind}>
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
                        {kind === "pickup" ? "Awaiting pickup" : "Onboard"}
                      </th>
                      <th className="align-right">
                        {kind === "pickup" ? "Loaded" : "Delivered"}
                      </th>
                      <th className="align-right">Remaining</th>
                      <th>Progress / actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map(({ contract: c, objective: o }) => (
                      <tr key={c.id + ":" + (o?.id ?? "unknown")}>
                        <td>
                          <strong>{o?.commodity ?? "Unknown cargo"}</strong>
                        </td>
                        <td>
                          <button
                            className="text-button"
                            onClick={() => setDetail(c)}
                          >
                            {c.name}
                          </button>
                        </td>
                        <td>
                          {kind === "pickup"
                            ? o?.destination || "Unresolved Destination"
                            : o?.pickupLocation || "Unknown pickup"}
                        </td>
                        <td className="align-right numeric">
                          {o ? number(o.quantitySCU) : "—"}
                        </td>
                        <td className="align-right numeric">
                          {o
                            ? number(
                                kind === "pickup"
                                  ? awaitingPickup(o)
                                  : loaded(o),
                              )
                            : "—"}
                        </td>
                        <td className="align-right numeric">
                          {o
                            ? number(
                                kind === "pickup" ? loaded(o) : o.deliveredSCU,
                              )
                            : "—"}
                        </td>
                        <td className="align-right numeric">
                          {o ? number(remainingSCU(o)) : "—"}
                        </td>
                        <td>
                          {o ? (
                            <>
                              {progressLabel(c, o)}
                              <ProgressControls
                                contract={c}
                                objective={o}
                                kind={kind}
                              />
                            </>
                          ) : (
                            "Awaiting objectives"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </section>
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
