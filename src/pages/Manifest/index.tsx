import { useMemo, useState } from "react";
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
  const contracts = useCargoStore((s) => s.contracts);
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
        Remaining quantities do not establish collection or onboard inventory.
        Progress labels describe only recorded evidence.
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
                      <th className="align-right">
                        {kind === "pickup" ? "To collect*" : "Required"}
                      </th>
                      <th className="align-right">Delivered</th>
                      <th className="align-right">Remaining</th>
                      <th>Progress</th>
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
                          {o ? number(o.deliveredSCU) : "—"}
                        </td>
                        <td className="align-right numeric">
                          {o ? number(remainingSCU(o)) : "—"}
                        </td>
                        <td>
                          {o ? progressLabel(c, o) : "Awaiting objectives"}
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
      <p className="form-note">
        * Collection quantities are contract requirements, not a verified amount
        still awaiting pickup. No collection state is tracked.
      </p>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
    </>
  );
}
