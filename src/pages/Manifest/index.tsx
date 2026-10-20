import { Container, MapPin, Route } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { operationStats } from "../../stores/selectors";
import { number } from "../../utils/format";
import { PageHeader, StatCard } from "../../components/ui";
import { DestinationGroups } from "../../components/contracts/DestinationGroups";
export default function Manifest() {
  const contracts = useCargoStore((s) => s.contracts);
  const stats = operationStats(contracts);
  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS / MANIFEST"
        title="Cargo Manifest"
        description="Every commodity and delivery objective, organized by destination."
      />
      <div className="stats-grid">
        <StatCard
          label="Total Assigned Cargo"
          value={
            <>
              {number(stats.scu)} <span className="stat-unit">SCU</span>
            </>
          }
          detail="Outstanding cargo across active contracts"
          icon={<Container size={19} />}
        />
        <StatCard
          label="Unique Destinations"
          value={stats.destinations}
          detail="Delivery locations on this manifest"
          icon={<MapPin size={19} />}
        />
        <StatCard
          label="Total Route Distance"
          value="—"
          detail="Unavailable · route dataset planned for later"
          icon={<Route size={19} />}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Delivery manifest</h2>
            <p>
              Assigned quantities reflect outstanding cargo, excluding delivered
              SCU.
            </p>
          </div>
        </div>
        <DestinationGroups contracts={contracts} manifest />
        <div className="panel-footer">
          Delivery stops are listed alphabetically. No route optimization or
          distance calculation is applied.
        </div>
      </section>
    </>
  );
}
