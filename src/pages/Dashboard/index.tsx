import { useState } from "react";
import {
  Plus,
  Flag,
  Layers3,
  Container,
  Wallet,
  MapPin,
  TriangleAlert,
  ArrowDownWideNarrow,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { operationStats, groupByDestination } from "../../stores/selectors";
import { number, money } from "../../utils/format";
import { PageHeader, StatCard, Badge } from "../../components/ui";
import { DestinationGroups } from "../../components/contracts/DestinationGroups";
import { ContractDrawer } from "../../components/contracts/ContractDrawer";
import { FinishRunDialog } from "../../components/contracts/FinishRunDialog";
import type { Contract } from "../../types/models";
export default function Dashboard() {
  const contracts = useCargoStore((s) => s.contracts);
  const ships = useCargoStore((s) => s.ships);
  const shipId = useCargoStore((s) => s.selectedShipId);
  const currentRun = useCargoStore((s) => s.currentRun);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [finishing, setFinishing] = useState(false);
  const stats = operationStats(contracts);
  const ship = ships.find((s) => s.id === shipId)!;
  const over = stats.scu > ship.cargoCapacitySCU;
  const groups = groupByDestination(contracts);
  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS / DASHBOARD"
        title="Dashboard"
        description="Your cargo. Your contracts. One coordinated run."
      >
        <button
          className="button"
          disabled={!currentRun.contractIds.length}
          onClick={() => setFinishing(true)}
        >
          <Flag size={16} />
          Finish Run
        </button>
        <button
          className="button primary"
          onClick={() => {
            setEditing(null);
            setDrawer(true);
          }}
        >
          <Plus size={17} />
          Add Contract
        </button>
      </PageHeader>
      <div className="stats-grid">
        <StatCard
          label="Active Missions"
          value={
            <>
              {number(stats.missions)}{" "}
              <span className="stat-unit">contracts</span>
            </>
          }
          detail={"Across " + stats.destinations + " delivery destinations"}
          icon={<Layers3 size={19} />}
        />
        <StatCard
          label="Cargo Capacity"
          value={
            <>
              {number(stats.scu)}{" "}
              <span className="stat-unit">
                / {number(ship.cargoCapacitySCU)} SCU
              </span>
            </>
          }
          detail={
            over
              ? "Capacity exceeded by " +
                number(stats.scu - ship.cargoCapacitySCU) +
                " SCU"
              : ship.name +
                " · " +
                Math.round((stats.scu / ship.cargoCapacitySCU) * 100) +
                "% assigned"
          }
          icon={<Container size={19} />}
        >
          <div
            className={"capacity-track " + (over ? "over" : "")}
            role="progressbar"
            aria-label="Cargo capacity"
            aria-valuenow={stats.scu}
            aria-valuemin={0}
            aria-valuemax={Math.max(stats.scu, ship.cargoCapacitySCU)}
            aria-valuetext={
              number(stats.scu) +
              " of " +
              number(ship.cargoCapacitySCU) +
              " SCU"
            }
          >
            <span
              style={{
                width:
                  Math.min(100, (stats.scu / ship.cargoCapacitySCU) * 100) +
                  "%",
              }}
            />
          </div>
        </StatCard>
        <StatCard
          label="Potential Earnings"
          value={
            <>
              {number(stats.potential)} <span className="stat-unit">aUEC</span>
            </>
          }
          detail="Known payouts only · unknown amounts excluded"
          icon={<Wallet size={19} />}
        />
      </div>
      {over && (
        <div className="notice warning" role="status">
          <TriangleAlert size={18} />
          <p>
            Assigned cargo exceeds {ship.name} capacity. Plan additional trips
            or select a larger ship.
          </p>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Active contracts <Badge>{stats.missions}</Badge>
            </h2>
            <p>Grouped by delivery destination</p>
          </div>
          <span className="subtle-label">
            <ArrowDownWideNarrow size={14} />
            DESTINATION A–Z
          </span>
        </div>
        <DestinationGroups
          contracts={contracts}
          onEdit={(contract) => {
            setEditing(contract);
            setDrawer(true);
          }}
        />
        <div className="panel-footer">
          <span>
            <MapPin size={13} />
            {stats.destinations} destinations in manifest
          </span>
          <span>
            Destination potential is allocated by SCU; shared contracts count
            once.
          </span>
        </div>
      </section>
      <section className="route-strip">
        <div className="route-label">
          <span className="eyebrow">DELIVERY OVERVIEW</span>
          <strong>{groups.length} planned stops</strong>
        </div>
        <div className="route-stops">
          {groups.length ? (
            groups.map((g, i) => (
              <div className="route-stop" key={g.destination}>
                <span className="stop-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{g.destination}</strong>
                  <small>
                    {g.unknownCargo ? "Unknown SCU" : number(g.scu) + " SCU"} ·{" "}
                    {g.unknownPayouts
                      ? "Unknown payout"
                      : money(g.allocatedPayout)}
                  </small>
                </span>
              </div>
            ))
          ) : (
            <span className="muted">Awaiting cargo assignments</span>
          )}
        </div>
        <span className="route-note">
          Alphabetical overview
          <br />
          Route distance unavailable
        </span>
      </section>
      <ContractDrawer
        open={drawer}
        contract={editing}
        onClose={() => setDrawer(false)}
      />
      <FinishRunDialog open={finishing} onClose={() => setFinishing(false)} />
    </>
  );
}
