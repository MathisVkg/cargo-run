import { useState } from "react";
import { FileCheck2, Pencil, Ban } from "lucide-react";
import type { Contract } from "../../types/models";
import {
  contractSCU,
  outstandingSCU,
  uniqueObjectives,
  canonicalLocation,
} from "../../stores/selectors";
import { money, number } from "../../utils/format";
import { Badge, EmptyState } from "../ui";
import { Overlay } from "../ui/Overlay";
import { ContractDetails } from "./ContractDetails";
import { ContractDrawer } from "./ContractDrawer";
import { useCargoStore } from "../../stores/useCargoStore";
export function ContractCards({ contracts }: { contracts: Contract[] }) {
  const [detail, setDetail] = useState<Contract | null>(null),
    [edit, setEdit] = useState<Contract | null>(null),
    [abandon, setAbandon] = useState<Contract | null>(null);
  const abandonContract = useCargoStore((s) => s.abandonContract);
  if (!contracts.length)
    return (
      <EmptyState
        title="No active contracts"
        description="Add a contract or capture an accepted contract with OCR."
      />
    );
  return (
    <>
      <div className="contract-cards">
        {contracts.map((c) => {
          const objectives = uniqueObjectives(c),
            pickups = new Set(
              objectives.map((o) =>
                canonicalLocation(o.pickupLocation, "pickup"),
              ),
            ),
            deliveries = new Set(
              objectives.map((o) => canonicalLocation(o.destination)),
            ),
            commodities = [
              ...new Set(
                objectives.map((o) => o.commodity || "Unknown commodity"),
              ),
            ],
            hasEvidence =
              Object.values(c.fieldProvenance ?? {}).some((p) => p.captureId) ||
              c.sources?.includes("OCR") ||
              c.source === "OCR";
          return (
            <article className="panel contract-card" key={c.id}>
              <div className="contract-card-heading">
                <div>
                  <h3>{c.name}</h3>
                  <p>{c.company ?? "Company not recorded"}</p>
                </div>
                <Badge>{c.status}</Badge>
              </div>
              <div className="contract-card-numbers">
                <strong className="numeric">{money(c.payout)}</strong>
                <span>
                  {number(contractSCU(c))} SCU required ·{" "}
                  {number(outstandingSCU(c))} remaining
                </span>
              </div>
              <p className="commodity-summary">{commodities.join(" · ")}</p>
              <dl className="contract-locations">
                <div>
                  <dt>
                    {pickups.size} pickup{pickups.size !== 1 ? "s" : ""}
                  </dt>
                  <dd>{[...pickups].join(" · ") || "Unknown pickup"}</dd>
                </div>
                <div>
                  <dt>
                    {deliveries.size} destination
                    {deliveries.size !== 1 ? "s" : ""}
                  </dt>
                  <dd>
                    {[...deliveries].join(" · ") || "Unresolved destination"}
                  </dd>
                </div>
              </dl>
              <footer className="contract-card-footer">
                <div className="contract-card-footer__metadata">
                  <Badge>{(c.sources ?? [c.source]).join(" + ")}</Badge>
                  {hasEvidence && (
                    <span
                      className="contract-card-evidence"
                      title="OCR association recorded; inspect details for available evidence"
                    >
                      <FileCheck2 size={16} aria-hidden="true" />
                      <span>Evidence</span>
                    </span>
                  )}
                </div>
                <div className="contract-card-footer__actions">
                  <button
                    className="contract-card-action"
                    aria-label={"Details for " + c.name}
                    onClick={() => setDetail(c)}
                  >
                    Details
                  </button>
                  <button
                    className="contract-card-action icon-button"
                    disabled={c.source === "Log"}
                    aria-label={"Edit " + c.name}
                    title={
                      c.source === "Log"
                        ? "Managed by Game.log"
                        : "Edit contract"
                    }
                    onClick={() => setEdit(c)}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>
                  <button
                    className="contract-card-action icon-button danger-text"
                    title="Abandon contract"
                    aria-label={"Abandon " + c.name}
                    onClick={() => setAbandon(c)}
                  >
                    <Ban size={16} aria-hidden="true" />
                  </button>
                </div>
              </footer>
            </article>
          );
        })}
      </div>
      <ContractDetails contract={detail} onClose={() => setDetail(null)} />
      <ContractDrawer
        open={!!edit}
        contract={edit}
        onClose={() => setEdit(null)}
      />
      <Overlay
        open={!!abandon}
        onClose={() => setAbandon(null)}
        side="center"
        title="Abandon contract?"
      >
        <div className="dialog-body">
          “{abandon?.name}” will remain in History. No earnings will be
          recorded.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setAbandon(null)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={async () => {
              if (abandon) {
                await abandonContract(abandon.id);
                setAbandon(null);
              }
            }}
          >
            Abandon contract
          </button>
        </div>
      </Overlay>
    </>
  );
}
