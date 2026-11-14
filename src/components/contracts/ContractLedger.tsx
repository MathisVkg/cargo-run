import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Contract } from "../../types/models";
import type { EvidenceLink } from "../../types/review";
import { useCargoStore } from "../../stores/useCargoStore";
import { contractSCU, canonicalLocation } from "../../stores/selectors";
import { money, number, date } from "../../utils/format";
import { captureImage } from "../../stores/useOcrStore";
import { ContractStatus } from "../ui/ContractStatus";
import { CompleteContractDialog } from "./CompleteContractDialog";
import { Overlay } from "../ui/Overlay";
export function locationSummary(c: Contract, kind: "pickup" | "delivery") {
  const values = [
    ...new Set(
      c.cargoObjectives.map((o) =>
        canonicalLocation(
          kind === "pickup" ? o.pickupLocation : o.destination,
          kind,
        ),
      ),
    ),
  ];
  return values.length > 1
    ? values[0] + " +" + (values.length - 1)
    : (values[0] ?? "Unknown");
}
export function ContractLedger({
  contracts,
  history = false,
}: {
  contracts: Contract[];
  history?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <div className="ledger-scroll">
      <table
        className={"contracts-ledger" + (history ? " history-ledger" : "")}
      >
        <thead>
          <tr>
            <th>Contract</th>
            {history && <th>Date</th>}
            <th>Pickup</th>
            <th>Destination</th>
            <th>{history ? "SCU" : "Objectives"}</th>
            <th>Status</th>
            {history && <th>Reward / confirmed</th>}
            <th>
              <span className="sr-only">Expand</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => (
            <LedgerEntry
              key={c.id}
              contract={c}
              history={history}
              expanded={expanded.has(c.id)}
              toggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(c.id)) n.delete(c.id);
                  else n.add(c.id);
                  return n;
                })
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
function LedgerEntry({
  contract: c,
  history,
  expanded,
  toggle,
}: {
  contract: Contract;
  history: boolean;
  expanded: boolean;
  toggle(): void;
}) {
  return (
    <>
      <tr data-contract-id={c.id}>
        <td data-label="Contract">
          <strong>{c.name}</strong>
        </td>
        {history && (
          <td data-label="Date">{date(c.completedAt ?? c.acceptedAt)}</td>
        )}
        <td data-label="Pickup">{locationSummary(c, "pickup")}</td>
        <td data-label="Destination">{locationSummary(c, "delivery")}</td>
        <td data-label={history ? "SCU" : "Objectives"} className="numeric">
          {history
            ? c.cargoObjectives.length
              ? number(contractSCU(c))
              : "Unknown"
            : c.cargoObjectives.length}
        </td>
        <td data-label="Status">
          <ContractStatus
            status={
              c.status === "Active" && !c.cargoObjectives.length
                ? "Needs review"
                : c.status
            }
          />
        </td>
        {history && (
          <td data-label="Reward / confirmed">
            <span>{money(c.payout)} potential</span>
            <small>{money(c.confirmedEarnings)} confirmed</small>
          </td>
        )}
        <td>
          <button
            className="icon-button ledger-expand"
            aria-expanded={expanded}
            aria-controls={"expanded-" + c.id}
            aria-label={(expanded ? "Collapse " : "Expand ") + c.name}
            onClick={toggle}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="contract-expanded-row">
          <td colSpan={history ? 8 : 6}>
            <div id={"expanded-" + c.id}>
              <ContractExpansion contract={c} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
export function ContractExpansion({ contract: c }: { contract: Contract }) {
  const openEditor = useCargoStore((s) => s.openEditor),
    abandon = useCargoStore((s) => s.abandonContract);
  const [links, setLinks] = useState<EvidenceLink[]>([]),
    [complete, setComplete] = useState(false),
    [abandoning, setAbandoning] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void window.cargoRun
      .contractEvidence(c.id)
      .then((r) => {
        if (live) setLinks(r);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [c.id]);
  return (
    <section
      className="contract-expansion"
      aria-label={"Details for " + c.name}
    >
      <div className="expansion-heading">
        <div>
          <h2>{c.name}</h2>
          <p>{c.company || "Contractor not recorded"}</p>
        </div>
        <div>
          <strong className="numeric">{money(c.payout)}</strong>
          <small>Potential reward</small>
        </div>
      </div>
      <div className="expanded-objectives">
        {c.cargoObjectives.length ? (
          c.cargoObjectives.map((o) => (
            <div key={o.id}>
              <strong>
                {o.commodity || "Unknown commodity"}{" "}
                <span className="numeric">{number(o.quantitySCU)} SCU</span>
              </strong>
              <p>
                {o.pickupLocation || "Unknown pickup"} →{" "}
                {o.destination || "Unknown destination"}
              </p>
            </div>
          ))
        ) : (
          <p>Objectives are not yet known.</p>
        )}
      </div>
      <div className="expansion-evidence">
        {links
          .filter((l) => l.attached)
          .map((l) => (
            <div key={l.captureId}>
              {l.imageAvailable ? (
                <button
                  className="evidence-thumbnail"
                  onClick={() => setImage(l.captureId)}
                >
                  <img
                    src={captureImage(l.captureId, true)}
                    alt={"Screenshot of " + (l.title ?? c.name)}
                  />
                  <span>Open screenshot</span>
                </button>
              ) : (
                <span className="muted">
                  Screenshot unavailable · saved evidence retained
                </span>
              )}
            </div>
          ))}
      </div>
      <footer className="expansion-footer">
        <small>Source: {(c.sources ?? [c.source]).join(" + ")}</small>
        {c.status === "Active" && (
          <div>
            <button className="button small" onClick={() => setComplete(true)}>
              Complete contract
            </button>
            <button
              className="button small"
              disabled={c.source === "Log"}
              title={c.source === "Log" ? "Managed by Game.log" : undefined}
              onClick={() => openEditor(c.id)}
            >
              Edit contract
            </button>
            <button
              className="button small danger"
              onClick={() => setAbandoning(true)}
            >
              Abandon contract
            </button>
          </div>
        )}
      </footer>
      {error && <p role="alert">{error}</p>}
      <CompleteContractDialog
        contract={complete ? c : null}
        onClose={() => setComplete(false)}
      />
      <Overlay
        open={abandoning}
        onClose={() => {
          if (!busy) setAbandoning(false);
        }}
        title="Abandon contract?"
        side="center"
      >
        <div className="dialog-body">
          This contract stays in History. Recorded cargo and confirmed earnings
          are preserved.
        </div>
        <div className="dialog-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => setAbandoning(false)}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await abandon(c.id);
                setAbandoning(false);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Confirm abandonment
          </button>
        </div>
      </Overlay>
      <Overlay
        open={!!image}
        onClose={() => setImage(null)}
        title="Contract screenshot"
        side="center"
      >
        <div className="full-screenshot">
          {image && (
            <img src={captureImage(image)} alt="Original contract screenshot" />
          )}
        </div>
      </Overlay>
    </section>
  );
}
