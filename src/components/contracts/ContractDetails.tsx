import { CompleteContractDialog } from "./CompleteContractDialog";
import { ChecklistToggle } from "../cargo/ChecklistToggle";
import { LifecycleHistory } from "./LifecycleHistory";
import { ProgressControls } from "../cargo/ProgressControls";
import { CargoActivityPanel } from "../cargo/CargoActivity";
import { loaded, awaitingPickup } from "../../types/progress";
import { useEffect, useState } from "react";
import type { Contract } from "../../types/models";
import type { EvidenceLink } from "../../types/review";
import { Overlay } from "../ui/Overlay";
import { Badge } from "../ui";
import { captureImage, useOcrStore } from "../../stores/useOcrStore";
import { ContractDrawer } from "./ContractDrawer";
import { useCargoStore } from "../../stores/useCargoStore";
import {
  contractSCU,
  outstandingSCU,
  uniqueObjectives,
  remainingSCU,
} from "../../stores/selectors";
import { date, money, number } from "../../utils/format";
export function ContractDetails({
  contract: selectedContract,
  onClose,
}: {
  contract: Contract | null;
  onClose(): void;
}) {
  const contract =
    useCargoStore((s) =>
      s.contracts.find((c) => c.id === selectedContract?.id),
    ) ?? selectedContract;
  const [links, setLinks] = useState<EvidenceLink[]>([]),
    [error, setError] = useState(""),
    [large, setLarge] = useState<string | null>(null),
    [complete, setComplete] = useState(false),
    [editing, setEditing] = useState(false),
    [abandon, setAbandon] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const abandonContract = useCargoStore((s) => s.abandonContract),
    refresh = useOcrStore((s) => s.refresh);
  const reload = () =>
    contract &&
    window.cargoRun
      .contractEvidence(contract.id)
      .then(setLinks)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    let active = true;
    setLinks([]);
    setError("");
    setComplete(false);
    setEditing(false);
    setAbandon(false);
    setLarge(null);
    if (contract)
      void window.cargoRun
        .contractEvidence(contract.id)
        .then((value) => {
          if (active) setLinks(value);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    return () => {
      active = false;
    };
  }, [contract?.id]);
  const required = contract ? contractSCU(contract) : 0,
    remaining = contract ? outstandingSCU(contract) : 0;
  return (
    <>
      <Overlay
        open={!!contract}
        onClose={onClose}
        title={contract?.name ?? "Contract details"}
        subtitle="CONTRACT & EVIDENCE"
        side="center"
        className="contract-details"
      >
        <div className="contract-details-body">
          {contract && (
            <>
              <section aria-label="Contract overview">
                <h2>Overview</h2>
                <dl className="details-overview">
                  <div>
                    <dt>Company</dt>
                    <dd>{contract.company || "Unknown company"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      <Badge>{contract.status}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>
                      {(contract.sources ?? [contract.source]).join(" + ")}
                    </dd>
                  </div>
                  <div>
                    <dt>Accepted</dt>
                    <dd>{date(contract.acceptedAt)}</dd>
                  </div>
                </dl>
                <dl className="details-stats">
                  <div>
                    <dt>Full potential payout</dt>
                    <dd>{money(contract.payout)}</dd>
                  </div>
                  <div>
                    <dt>Confirmed earnings</dt>
                    <dd>{money(contract.confirmedEarnings)}</dd>
                  </div>
                  <div>
                    <dt>Required SCU</dt>
                    <dd>{number(required)}</dd>
                  </div>
                  <div>
                    <dt>Delivered SCU</dt>
                    <dd>{number(required - remaining)}</dd>
                  </div>
                  <div>
                    <dt>Remaining SCU</dt>
                    <dd>{number(remaining)}</dd>
                  </div>
                </dl>
              </section>
              <LifecycleHistory contract={contract} />
              <CargoActivityPanel contract={contract} />
              <section aria-label="Cargo objectives">
                <h2>Cargo Objectives</h2>
                {!contract.cargoObjectives.length ? (
                  <p className="form-note">
                    No supported cargo objectives are recorded.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="cargo-table details-objectives">
                      <thead>
                        <tr>
                          <th>Commodity</th>
                          <th>Pickup</th>
                          <th>Destination</th>
                          <th className="align-right">Required SCU</th>
                          <th className="align-right">Loaded / Awaiting SCU</th>
                          <th className="align-right">Delivered SCU</th>
                          <th className="align-right">Remaining SCU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueObjectives(contract).map((o) => (
                          <tr key={o.id}>
                            <td>{o.commodity || "Unknown commodity"}</td>
                            <td>{o.pickupLocation || "Unknown pickup"}</td>
                            <td>{o.destination || "Unknown destination"}</td>
                            <td className="align-right numeric">
                              {number(o.quantitySCU)}
                            </td>
                            <td>
                              {number(loaded(o))} / {number(awaitingPickup(o))}
                              <p className="form-note">Checklist reminders</p>
                              <ChecklistToggle
                                objective={o}
                                kind="pickup"
                                disabled={contract.status !== "Active"}
                              />
                              <ChecklistToggle
                                objective={o}
                                kind="delivery"
                                disabled={contract.status !== "Active"}
                              />
                              <ProgressControls
                                contract={contract}
                                objective={o}
                                kind="delivery"
                              />
                            </td>
                            <td className="align-right numeric">
                              {number(o.deliveredSCU)}
                            </td>
                            <td className="align-right numeric">
                              {number(remainingSCU(o))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              <section aria-label="Contract evidence">
                <h2>Evidence</h2>
                <p className="form-note">
                  Active linked screenshots are protected. Closed contract
                  screenshots expire 30 days after closure. Unlinking preserves
                  the contract and review audit.
                </p>
                {!links.length && (
                  <p className="form-note">No linked OCR observations.</p>
                )}
                <div className="details-evidence">
                  {links.map((l) => (
                    <article className="evidence-record" key={l.captureId}>
                      <div className="evidence-heading">
                        <h3>{date(l.capturedAt)}</h3>
                        <Badge>
                          {l.attached ? "Linked evidence" : "Unlinked evidence"}
                        </Badge>
                      </div>
                      <p className="form-note">
                        {l.source} · {l.title ?? "Untitled observation"}
                      </p>
                      {l.imageAvailable ? (
                        <button
                          className="screenshot-preview"
                          aria-label="Inspect evidence screenshot"
                          onClick={() => setLarge(l.captureId)}
                        >
                          <img
                            src={captureImage(l.captureId, true)}
                            alt="OCR evidence thumbnail"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                              setError(
                                "Screenshot unavailable; structured evidence is preserved.",
                              );
                            }}
                          />
                          <span>Open full screenshot</span>
                        </button>
                      ) : (
                        <p className="form-note">
                          Screenshot unavailable or expired. Structured evidence
                          and review history are preserved.
                        </p>
                      )}
                      <details>
                        <summary>Advanced · Recognition and review</summary>
                        <p className="form-note">
                          Associated {date(l.associatedAt)} ·{" "}
                          {l.verified
                            ? "Verified association"
                            : "Unverified association"}
                        </p>
                        <ul className="warning-text">
                          {l.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                        <p className="form-note">
                          Manual corrections:{" "}
                          {l.corrections.join(", ") || "None"}
                        </p>
                        <pre className="ocr-raw">
                          {JSON.stringify(
                            {
                              rawText: l.rawText,
                              observation: l.observation,
                              original: l.original,
                              reviewed: l.reviewed,
                              conflicts: l.conflicts,
                              choices: l.choices,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </details>
                      {l.attached && (
                        <button
                          className="text-button"
                          onClick={() =>
                            void window.cargoRun
                              .unlinkEvidence({
                                contractId: contract.id,
                                captureId: l.captureId,
                              })
                              .then(async () => {
                                await refresh();
                                await reload();
                              })
                              .catch((e) => setError(String(e)))
                          }
                        >
                          Unlink evidence
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              </section>
              <details>
                <summary>Advanced · Identity and field provenance</summary>
                <p className="form-note">
                  ContractId: {contract.id} · MissionId:{" "}
                  {contract.missionId ?? "Unverified / local"}
                </p>
                <pre className="ocr-raw">
                  {JSON.stringify(contract.fieldProvenance ?? {}, null, 2)}
                </pre>
              </details>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions contract-details-actions">
          {contract?.status === "Active" && (
            <>
              <button
                className="button"
                disabled={contract.source === "Log" || submitting}
                onClick={() => setEditing(true)}
              >
                Edit contract
              </button>
              <button
                className="button"
                disabled={submitting}
                onClick={() => setComplete(true)}
              >
                Complete contract
              </button>
              <button
                className="button danger"
                disabled={submitting}
                onClick={() => setAbandon(true)}
              >
                Abandon contract
              </button>
            </>
          )}
          <button className="button" onClick={onClose}>
            Close
          </button>
        </div>
      </Overlay>
      <CompleteContractDialog
        contract={complete ? contract : null}
        onClose={() => setComplete(false)}
        onCompleted={onClose}
      />
      {editing && (
        <ContractDrawer
          open={editing}
          contract={contract}
          onClose={() => setEditing(false)}
        />
      )}
      <Overlay
        open={abandon}
        onClose={() => setAbandon(false)}
        side="center"
        title="Abandon contract?"
      >
        <div className="dialog-body">
          This contract will remain in History. No earnings will be recorded.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setAbandon(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            disabled={submitting}
            onClick={async () => {
              if (contract) {
                setSubmitting(true);
                try {
                  await abandonContract(contract.id);
                  setAbandon(false);
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              }
            }}
          >
            Confirm abandonment
          </button>
        </div>
      </Overlay>
      <Overlay
        open={!!large}
        onClose={() => setLarge(null)}
        title="Evidence screenshot"
        subtitle="LOCAL CAPTURE"
        side="center"
      >
        {large && (
          <div className="full-screenshot">
            <img src={captureImage(large)} alt="Full evidence screenshot" />
          </div>
        )}
      </Overlay>
    </>
  );
}
