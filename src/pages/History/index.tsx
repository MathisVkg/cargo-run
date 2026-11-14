import { useState } from "react";
import { Search } from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { contractSCU } from "../../stores/selectors";
import { money, number, date } from "../../utils/format";
import { ContractLedger } from "../../components/contracts/ContractLedger";
import { EmptyState, Pagination } from "../../components/ui";
import { LocalDataManagement } from "../Settings/LocalDataManagement";
import { Overlay } from "../../components/ui/Overlay";
export default function History() {
  const runs = useCargoStore((s) => s.runs);
  const [runPage, setRunPage] = useState(0);
  const runPages = Math.max(1, Math.ceil(runs.length / 25)),
    runIndex = Math.min(runPage, runPages - 1);
  const contracts = useCargoStore((s) => s.contracts),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("All"),
    [page, setPage] = useState(0),
    [cleanup, setCleanup] = useState(false);
  const closed = contracts.filter(
      (c) => !c.supersededBy && c.status !== "Active",
    ),
    completed = closed.filter((c) => c.status === "Completed"),
    rows = closed.filter(
      (c) =>
        (status === "All" || c.status === status) &&
        [
          c.name,
          ...c.cargoObjectives.flatMap((o) => [
            o.commodity,
            o.pickupLocation,
            o.destination,
          ]),
        ].some((v) => v.toLowerCase().includes(query.toLowerCase())),
    ),
    pages = Math.max(1, Math.ceil(rows.length / 25)),
    current = Math.min(page, pages - 1);
  return (
    <>
      <header className="foundation-page-heading">
        <div>
          <p className="eyebrow">RECORDS</p>
          <h1>History</h1>
        </div>
        <button className="button danger" onClick={() => setCleanup(true)}>
          Clear history
        </button>
      </header>
      <div className="history-summary">
        <section>
          <small>Completed contracts</small>
          <strong>{number(completed.length)}</strong>
        </section>
        <section>
          <small>Completed SCU (known)</small>
          <strong>
            {number(completed.reduce((n, c) => n + contractSCU(c), 0))}
          </strong>
        </section>
        <section>
          <small>Confirmed earnings</small>
          <strong>
            {money(completed.reduce((n, c) => n + c.confirmedEarnings, 0))}
          </strong>
        </section>
      </div>
      <div className="history-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label="Search history"
            placeholder="Search contracts or locations"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="All">All closed statuses</option>
          <option>Completed</option>
          <option>Abandoned</option>
        </select>
      </div>
      {rows.length ? (
        <section className="panel">
          <ContractLedger
            contracts={rows.slice(current * 25, (current + 1) * 25)}
            history
          />
          <div className="panel-footer">
            <span>{rows.length} closed contracts</span>
            <Pagination page={current} pages={pages} onChange={setPage} />
          </div>
        </section>
      ) : (
        <EmptyState
          title="No history found"
          description="Completed and abandoned contracts appear here. Potential rewards are not confirmed earnings."
        />
      )}
      {runs.length > 0 && (
        <details className="saved-runs">
          <summary>Saved run snapshots · {runs.length}</summary>
          {runs.slice(runIndex * 25, (runIndex + 1) * 25).map((run) => (
            <details className="saved-run" key={run.id}>
              <summary>
                {date(run.finishedAt ?? run.startedAt)} ·{" "}
                {run.contractIds.length} contracts
              </summary>
              <p className="form-note">Immutable snapshot at run closure.</p>
              {run.contractSnapshots.map((c) => (
                <div key={c.id}>
                  <strong>{c.name}</strong>
                  <span>
                    {c.status} · {number(contractSCU(c))} SCU
                  </span>
                </div>
              ))}
            </details>
          ))}
          {runPages > 1 && (
            <Pagination
              page={runIndex}
              pages={runPages}
              onChange={setRunPage}
              label="Saved run pagination"
            />
          )}
        </details>
      )}
      <Overlay
        open={cleanup}
        onClose={() => setCleanup(false)}
        title="History cleanup"
        side="center"
        className="history-cleanup"
      >
        <div className="dialog-body">
          <LocalDataManagement historyOnly />
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setCleanup(false)}>
            Close
          </button>
        </div>
      </Overlay>
    </>
  );
}
