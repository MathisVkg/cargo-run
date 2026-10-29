import { ContractDetails } from "../../components/contracts/ContractDetails";
import type { Contract } from "../../types/models";
import { useState } from "react";
import {
  Files,
  Container,
  Wallet,
  Search,
  Flag,
  ChevronDown,
} from "lucide-react";
import { useCargoStore } from "../../stores/useCargoStore";
import { contractSCU, historyStats } from "../../stores/selectors";
import { date, money, number } from "../../utils/format";
import { PageHeader, StatCard, Badge, EmptyState } from "../../components/ui";
export default function History() {
  const contracts = useCargoStore((s) => s.contracts);
  const runs = useCargoStore((s) => s.runs);
  const [detail, setDetail] = useState<Contract | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const stats = historyStats(contracts);
  const query = search.trim().toLowerCase();
  const filtered = contracts.filter(
    (c) =>
      (status === "All" || c.status === status) &&
      [
        c.name,
        c.source,
        ...c.cargoObjectives.flatMap((o) => [
          o.destination,
          o.commodity,
          o.pickupLocation,
        ]),
      ].some((value) => value.toLowerCase().includes(query)),
  );
  return (
    <>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
      <PageHeader
        eyebrow="RECORDS / HISTORY"
        title="Contract History"
        description="A complete ledger of tracked cargo and closed operations."
      />
      <div className="stats-grid">
        <StatCard
          label="All-time Contracts Tracked"
          value={number(stats.contracts)}
          detail="Unique contracts, including active and abandoned"
          icon={<Files size={19} />}
        />
        <StatCard
          label="All-time SCU Tracked"
          value={
            <>
              {number(stats.scu)} <span className="stat-unit">SCU</span>
            </>
          }
          detail="Original quantities across unique contracts"
          icon={<Container size={19} />}
        />
        <StatCard
          label="All-time Earned"
          value={
            <>
              {number(stats.earned)} <span className="stat-unit">aUEC</span>
            </>
          }
          detail="Confirmed earnings from completed contracts only"
          icon={<Wallet size={19} />}
        />
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Contract ledger</h2>
            <p>
              Potential payouts and confirmed earnings are shown separately.
            </p>
          </div>
          <div className="table-filters">
            <div className="search-field">
              <Search size={15} />
              <input
                aria-label="Search history"
                placeholder="Search contracts or destinations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["All", "Active", "Completed", "Abandoned"].map((s) => (
                <option key={s} value={s}>
                  {s === "All" ? "All statuses" : s}
                </option>
              ))}
            </select>
          </div>
        </div>
        {filtered.length ? (
          <div className="table-scroll">
            <table className="cargo-table history-table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Destination</th>
                  <th className="align-right">SCU</th>
                  <th className="align-right">Payout / earned</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.name}</strong>
                      <button
                        className="text-button"
                        aria-label={"Details for " + c.name}
                        onClick={() => setDetail(c)}
                      >
                        Details / evidence
                      </button>
                      {c.dataOrigin === "Sample" && (
                        <small className="sample-tag">SAMPLE DATA</small>
                      )}
                    </td>
                    <td>
                      {[
                        ...new Set(c.cargoObjectives.map((o) => o.destination)),
                      ].join(", ") || "Unresolved Destination"}
                    </td>
                    <td className="numeric align-right">
                      {c.cargoObjectives.length
                        ? number(contractSCU(c))
                        : "Unknown"}
                    </td>
                    <td className="numeric align-right">
                      {money(c.payout)}
                      <small>
                        {money(
                          c.status === "Completed" ? c.confirmedEarnings : 0,
                        )}{" "}
                        earned
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          c.status === "Completed"
                            ? "green"
                            : c.status === "Abandoned"
                              ? "red"
                              : "amber"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                    <td>{(c.sources ?? [c.source]).join(" + ")}</td>
                    <td className="date-cell">
                      {date(c.completedAt ?? c.acceptedAt)}
                      <small>
                        {c.completedAt
                          ? c.status === "Abandoned"
                            ? "Abandoned"
                            : "Completed"
                          : "Accepted"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No contracts found"
            description="Try a different search or status filter."
          />
        )}
        <div className="panel-footer">
          {filtered.length} of {contracts.length} unique contracts · SQLite
          storage
        </div>
      </section>
      <section className="panel closed-runs">
        <div className="panel-heading">
          <div>
            <h2>
              <Flag size={17} />
              Closed runs <Badge>{runs.length}</Badge>
            </h2>
            <p>
              Run closure preserves contract statuses and never confirms
              earnings.
            </p>
          </div>
        </div>
        {runs.length ? (
          runs.map((run) => (
            <details className="run-record" key={run.id}>
              <summary>
                <ChevronDown size={16} />
                <strong>Run {run.id.slice(0, 8).toUpperCase()}</strong>
                <Badge tone="green">Finished</Badge>
                <span>{run.contractIds.length} contracts</span>
                <time>{date(run.finishedAt!)}</time>
              </summary>
              <div className="run-detail">
                <p>
                  Started {date(run.startedAt)} · Immutable snapshot at closure
                </p>
                {run.contractSnapshots.map((c) => (
                  <div className="run-contract" key={c.id}>
                    <span>
                      {c.name}
                      {c.dataOrigin === "Sample" && (
                        <span className="sample-tag">SAMPLE</span>
                      )}
                    </span>
                    <span>{number(contractSCU(c))} SCU</span>
                    <Badge
                      tone={
                        c.status === "Active"
                          ? "amber"
                          : c.status === "Completed"
                            ? "green"
                            : "red"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </details>
          ))
        ) : (
          <EmptyState
            title="No closed runs yet"
            description="Finish a run from the Dashboard to save its contract snapshot here."
          />
        )}
      </section>
    </>
  );
}
