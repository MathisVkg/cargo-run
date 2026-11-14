import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { useOcrStore } from "../../stores/useOcrStore";
import { activeContracts } from "../../stores/selectors";
import { scanPresentation } from "../../utils/captureReview";
import { ContractLedger } from "../../components/contracts/ContractLedger";
import { LifecycleIssues } from "../../components/contracts/LifecycleIssues";
import { EmptyState, Pagination } from "../../components/ui";
import { date } from "../../utils/format";
import { ContractStatus } from "../../components/ui/ContractStatus";
export default function Contracts() {
  const contracts = useCargoStore((s) => s.contracts),
    openEditor = useCargoStore((s) => s.openEditor),
    sample = useCargoStore((s) => s.sampleMode),
    captures = useOcrStore((s) => s.state)?.captures ?? [];
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0);
  const active = activeContracts(contracts).filter((c) =>
      [
        c.name,
        ...c.cargoObjectives.flatMap((o) => [
          o.pickupLocation,
          o.destination,
          o.commodity,
        ]),
      ].some((v) => v.toLowerCase().includes(query.toLowerCase())),
    ),
    unresolved = captures.filter((c) => !c.evidenceLink),
    pages = Math.max(1, Math.ceil(active.length / 25)),
    current = Math.min(page, pages - 1);
  return (
    <>
      <header className="foundation-page-heading">
        <div>
          <p className="eyebrow">OPERATIONS</p>
          <h1>Contracts</h1>
        </div>
        <button className="button primary" onClick={() => openEditor()}>
          <Plus size={16} />
          Add Contract
        </button>
      </header>
      {sample && (
        <p className="notice">
          Demonstration contracts. Remove samples in Settings before using live
          OCR.
        </p>
      )}
      <LifecycleIssues />
      {unresolved.length > 0 && (
        <details className="needs-review">
          <summary>
            <ContractStatus status="Needs review" />
            Needs review <span className="badge">{unresolved.length}</span>
          </summary>
          <ul>
            {unresolved.map((c) => (
              <li key={c.id} data-capture-id={c.id}>
                <div>
                  <strong>
                    {c.observation?.title.value ?? "Unrecognized capture"}
                  </strong>
                  <small>
                    {date(c.capturedAt)} · {scanPresentation(c).status}
                  </small>
                </div>
                <button
                  className="button small"
                  onClick={() => openEditor(undefined, c.id)}
                >
                  Review capture
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="contracts-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search contracts"
            placeholder="Search contracts, cargo or locations"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <span className="muted">{active.length} active</span>
      </div>
      {active.length ? (
        <section className="panel">
          <ContractLedger
            contracts={active.slice(current * 25, (current + 1) * 25)}
          />
          {pages > 1 && (
            <div className="panel-footer">
              <Pagination page={current} pages={pages} onChange={setPage} />
            </div>
          )}
        </section>
      ) : (
        <EmptyState
          title="No active contracts"
          description="Add an accepted contract with a screenshot or enter it manually."
        />
      )}
    </>
  );
}
