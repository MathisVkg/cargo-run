import { useEffect, useState } from "react";
import type { Contract } from "../../types/models";
import type { EvidenceLink } from "../../types/review";
import { Overlay } from "../ui/Overlay";
import { captureImage, useOcrStore } from "../../stores/useOcrStore";
import { ContractDrawer } from "./ContractDrawer";
import { useCargoStore } from "../../stores/useCargoStore";
import { date, money } from "../../utils/format";
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
    [abandon, setAbandon] = useState(false);
  const abandonContract = useCargoStore((s) => s.abandonContract);

  const refresh = useOcrStore((s) => s.refresh);
  const reload = () =>
    contract &&
    window.cargoRun
      .contractEvidence(contract.id)
      .then(setLinks)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    setLinks([]);
    setError("");
    setComplete(false);
    setEditing(false);
    setAbandon(false);
    void reload();
  }, [contract?.id]);
  return (
    <>
      <Overlay
        open={!!contract}
        onClose={onClose}
        title={contract?.name ?? "Contract details"}
        subtitle="CONTRACT & EVIDENCE"
      >
        <div className="drawer-body">
          {contract && (
            <>
              <h2>Overview</h2>
              <p>
                {contract.status} ·{" "}
                {(contract.sources ?? [contract.source]).join(" + ")} ·{" "}
                {contract.company ?? "Unknown company"}
              </p>
              <p>Accepted: {date(contract.acceptedAt)}</p>
              <p>
                Potential reward: {money(contract.payout)} · Confirmed earnings:{" "}
                {money(contract.confirmedEarnings)}
              </p>
              <h2>Cargo Objectives</h2>
              {contract.cargoObjectives.map((o) => (
                <p key={o.id}>
                  {o.commodity} · {o.pickupLocation || "Unknown pickup"} →{" "}
                  {o.destination} · {o.deliveredSCU} / {o.quantitySCU} SCU
                </p>
              ))}
              {!contract.missionId && contract.status === "Active" && (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={complete}
                      onChange={(e) => setComplete(e.target.checked)}
                    />
                    I confirm completion of this local contract. This does not
                    confirm earnings.
                  </label>
                  <button
                    className="button"
                    disabled={!complete}
                    onClick={() =>
                      void window.cargoRun
                        .completeContract(contract.id)
                        .then(onClose)
                        .catch((e) => setError(String(e)))
                    }
                  >
                    Complete local contract
                  </button>
                </>
              )}
              {contract.status === "Active" && (
                <div className="details-actions">
                  <button
                    className="button"
                    disabled={contract.source === "Log"}
                    onClick={() => setEditing(true)}
                  >
                    Edit contract
                  </button>
                  <button
                    className="button danger"
                    onClick={() => setAbandon(true)}
                  >
                    Abandon contract
                  </button>
                </div>
              )}
              <h2>Evidence</h2>
              <p className="form-note">
                Active linked screenshots are protected. Closed contract
                screenshots expire 30 days after closure. Unlinking removes
                protection; it preserves the contract and the review audit.
              </p>
              {!links.length && <p>No linked OCR observations.</p>}
              {links.map((l) => (
                <section className="evidence-record" key={l.captureId}>
                  <h3>
                    {l.attached ? "Linked evidence" : "Unlinked evidence"} ·{" "}
                    {date(l.capturedAt)}
                  </h3>
                  <p>
                    {l.source} · {l.title ?? "Untitled observation"} ·
                    Associated {date(l.associatedAt)}
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
                      <span>Inspect evidence screenshot</span>
                    </button>
                  ) : (
                    <p>
                      Screenshot unavailable or expired. Minimal structured
                      evidence and review history are preserved.
                    </p>
                  )}
                  <ul>
                    {l.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                  <p>
                    Manual corrections: {l.corrections.join(", ") || "None"}
                  </p>
                  <details>
                    <summary>
                      Advanced · Original OCR, reviewed fields and conflict
                      decisions
                    </summary>
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
                      className="button"
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
                </section>
              ))}
              <details>
                <summary>Advanced · Identity and field provenance</summary>
                <p>
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
      </Overlay>
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
            onClick={async () => {
              if (contract) {
                await abandonContract(contract.id);
                setAbandon(false);
                onClose();
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
