import { useMemo, useState } from "react";
import { Plus, Flag, Layers3, Container, Wallet, Rocket } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import {
  activeContracts,
  operationStats,
  contractSCU,
  planningCapacity,
  recordedOnboard,
} from "../../stores/selectors";
import { number } from "../../utils/format";
import { PageHeader, StatCard } from "../../components/ui";
import { ContractDrawer } from "../../components/contracts/ContractDrawer";
import { FinishRunDialog } from "../../components/contracts/FinishRunDialog";
import { ContractCards } from "../../components/contracts/ContractCards";
import { LocationStops } from "../../components/contracts/LocationStops";
export default function Dashboard() {
  const contracts = useCargoStore((s) => s.contracts),
    ships = useCargoStore((s) => s.ships),
    shipId = useCargoStore((s) => s.selectedShipId),
    run = useCargoStore((s) => s.currentRun),
    view = useCargoStore((s) => s.preferences.dashboardView),
    setPreferences = useCargoStore((s) => s.setPreferences);
  const [adding, setAdding] = useState(false),
    [finishing, setFinishing] = useState(false);
  const active = useMemo(() => activeContracts(contracts), [contracts]),
    stats = useMemo(() => operationStats(contracts), [contracts]),
    required = useMemo(
      () => active.reduce((n, c) => n + contractSCU(c), 0),
      [active],
    );
  const ship = ships.find((s) => s.id === shipId),
    capacity = ship?.cargoCapacitySCU ?? 0,
    onboard = recordedOnboard(contracts, shipId),
    plan = planningCapacity(stats.scu, capacity);
  return (
    <>
      <PageHeader
        eyebrow="FLEET OPERATIONS / OVERVIEW"
        title="Cargo Operations"
        description="Plan pickups and deliveries across your active contracts."
      >
        <button
          className="button"
          disabled={!run.contractIds.length}
          onClick={() => setFinishing(true)}
        >
          <Flag size={15} />
          Finish Run
        </button>
        <button className="button primary" onClick={() => setAdding(true)}>
          <Plus size={16} />
          Add Contract
        </button>
      </PageHeader>
      <div className="stats-grid operations-stats">
        <StatCard
          label="Active Contracts"
          value={number(stats.missions)}
          detail={stats.destinations + " delivery destinations"}
          icon={<Layers3 size={18} />}
        />
        <StatCard
          label="Potential Rewards"
          value={
            <>
              {number(stats.potential)} <span className="stat-unit">aUEC</span>
            </>
          }
          detail="Full payouts counted once · unknown rewards excluded"
          icon={<Wallet size={18} />}
        />
        <StatCard
          label="Planned Cargo"
          value={
            <>
              {number(stats.scu)} <span className="stat-unit">SCU</span>
            </>
          }
          detail={
            number(required) +
            " required · " +
            number(required - stats.scu) +
            " delivered"
          }
          icon={<Container size={18} />}
        />
        <StatCard
          label="Recorded Onboard"
          value={
            <>
              {number(onboard)} / {ship ? number(capacity) : "—"}{" "}
              <span className="stat-unit">SCU</span>
            </>
          }
          detail={
            (ship?.name ?? "Saved ship unavailable") +
            " · " +
            number(Math.max(0, capacity - onboard)) +
            " SCU recorded available"
          }
          icon={<Rocket size={18} />}
        >
          <div
            className={"capacity-track " + (plan.over ? "over" : "")}
            role="progressbar"
            aria-label="Planning utilization"
            aria-valuemin={0}
            aria-valuemax={Math.max(100, plan.utilization ?? 0)}
            aria-valuenow={plan.utilization ?? 0}
            aria-valuetext={
              plan.utilization === null
                ? "Capacity unavailable"
                : Math.round(plan.utilization) + "% planned"
            }
          >
            <span
              style={{ width: Math.min(100, plan.utilization ?? 0) + "%" }}
            />
          </div>
          <p className="capacity-detail">
            {plan.utilization === null
              ? "Capacity unknown"
              : Math.round(plan.utilization) + "% planning utilization"}{" "}
            · {number(plan.unallocated)} SCU unallocated
          </p>
        </StatCard>
      </div>
      <p className="planning-note">
        Onboard values are manual records; unrecorded or migrated cargo is
        unknown, not verified empty. Cargo on other ships remains assigned to
        those ships. Planning assumes all remaining cargo is carried together.
        Planned cargo is not physically loaded cargo; staged pickups and
        deliveries may use capacity differently.
      </p>
      {plan.over && (
        <div className="notice warning" role="status">
          Planned cargo exceeds selected capacity by{" "}
          {number(stats.scu - capacity)} SCU. Consider staged deliveries or
          additional trips.
        </div>
      )}
      <div className="view-toolbar">
        <div
          className="segmented-control"
          role="group"
          aria-label="Dashboard view"
        >
          <button
            aria-pressed={view === "location"}
            onClick={() => void setPreferences({ dashboardView: "location" })}
          >
            By Location
          </button>
          <button
            aria-pressed={view === "contract"}
            onClick={() => void setPreferences({ dashboardView: "contract" })}
          >
            By Contract
          </button>
        </div>
        <span className="muted">Active operations</span>
      </div>
      {view === "location" ? (
        <>
          <LocationStops contracts={active} kind="pickup" />
          <LocationStops contracts={active} kind="delivery" />
        </>
      ) : (
        <ContractCards contracts={active} />
      )}
      <ContractDrawer
        open={adding}
        contract={null}
        onClose={() => setAdding(false)}
      />
      <FinishRunDialog open={finishing} onClose={() => setFinishing(false)} />
    </>
  );
}
