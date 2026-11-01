import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "../../components/ui";
import { useCargoStore } from "../../stores/useCargoStore";
import { activeContracts } from "../../stores/selectors";
import { ContractCards } from "../../components/contracts/ContractCards";
import { ContractDrawer } from "../../components/contracts/ContractDrawer";
export default function Contracts() {
  const contracts = useCargoStore((s) => s.contracts),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [adding, setAdding] = useState(false);
  const results = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return activeContracts(contracts).filter(
      (c) =>
        (filter !== "unknown" || c.payout === null) &&
        (filter !== "local" || !c.missionId) &&
        [
          c.name,
          c.company ?? "",
          ...c.cargoObjectives.flatMap((o) => [
            o.commodity,
            o.pickupLocation,
            o.destination,
          ]),
        ].some((v) => v.toLocaleLowerCase().includes(q)),
    );
  }, [contracts, query, filter]);
  return (
    <>
      <PageHeader
        eyebrow="FLEET OPERATIONS / CONTRACTS"
        title="Contracts"
        description="Individual active records. Completed and abandoned contracts remain in History."
      >
        <button className="button primary" onClick={() => setAdding(true)}>
          <Plus size={16} />
          Add Contract
        </button>
      </PageHeader>
      <div className="contracts-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            aria-label="Search contracts"
            value={query}
            placeholder="Search title, commodity, pickup or destination"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sr-only" htmlFor="contract-filter">
          Active contract filter
        </label>
        <select
          id="contract-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All active</option>
          <option value="unknown">Unknown reward</option>
          <option value="local">No verified mission ID</option>
        </select>
        <span className="muted">{results.length} contracts</span>
      </div>
      <ContractCards contracts={results} />
      <ContractDrawer
        open={adding}
        contract={null}
        onClose={() => setAdding(false)}
      />
    </>
  );
}
