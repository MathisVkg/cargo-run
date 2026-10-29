import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { Overlay } from "../ui/Overlay";
import { useCargoStore, validateDraft } from "../../stores/useCargoStore";
import type {
  Contract,
  ContractDraft,
  ObjectiveDraft,
} from "../../types/models";
const emptyStop = (): ObjectiveDraft => ({
  commodity: "",
  pickupLocation: "",
  destination: "",
  quantitySCU: Number.NaN,
});
const emptyDraft = (): ContractDraft => ({
  name: "",
  payout: null,
  objectives: [emptyStop()],
});
export function ContractDrawer({
  open,
  contract,
  onClose,
}: {
  open: boolean;
  contract: Contract | null;
  onClose(): void;
}) {
  const [draft, setDraft] = useState<ContractDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const save = useCargoStore((s) => s.saveContract);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(
        contract
          ? {
              name: contract.name,
              payout: contract.payout,
              company: contract.company ?? null,
              objectives: contract.cargoObjectives.map((o) => ({ ...o })),
            }
          : emptyDraft(),
      );
      setError(null);
    }
  }, [open, contract]);
  const updateStop = (index: number, update: Partial<ObjectiveDraft>) =>
    setDraft((prev) => ({
      ...prev,
      objectives: prev.objectives.map((o, i) =>
        i === index ? { ...o, ...update } : o,
      ),
    }));
  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={contract ? "Edit Contract" : "Add Contract"}
      subtitle="MANUAL ENTRY"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const validation = validateDraft(draft);
          if (validation) {
            setError(validation);
            return;
          }
          try {
            setSaving(true);
            await save(draft, contract?.id);
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save contract.",
            );
          } finally {
            setSaving(false);
          }
        }}
        className="contract-form"
      >
        <div className="drawer-body">
          <p className="form-intro">
            Plan the cargo. We’ll keep the manifest in sync.
          </p>
          <label>
            Contract name
            <input
              required
              maxLength={160}
              autoFocus
              placeholder="e.g. ArcCorp supply transfer"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Company (optional)
            <input
              value={draft.company ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, company: e.target.value || null })
              }
            />
          </label>
          <label>
            Payout (aUEC, optional)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={
                draft.payout === null || Number.isNaN(draft.payout)
                  ? ""
                  : draft.payout
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  payout: e.target.value === "" ? null : e.target.valueAsNumber,
                })
              }
            />
          </label>
          <div className="section-label">
            DELIVERY OBJECTIVES{" "}
            <span>{draft.objectives.length.toString().padStart(2, "0")}</span>
          </div>
          {draft.objectives.map((o, i) => (
            <fieldset className="objective-fields" key={i}>
              <legend>Delivery stop {i + 1}</legend>
              <label>
                Pickup location
                <input
                  required
                  maxLength={160}
                  placeholder="e.g. Everus Harbor"
                  value={o.pickupLocation}
                  onChange={(e) =>
                    updateStop(i, { pickupLocation: e.target.value })
                  }
                />
              </label>
              <label>
                Destination
                <input
                  required
                  maxLength={160}
                  placeholder="e.g. Area18"
                  value={o.destination}
                  onChange={(e) =>
                    updateStop(i, { destination: e.target.value })
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Commodity
                  <input
                    required
                    maxLength={100}
                    placeholder="e.g. Titanium"
                    value={o.commodity}
                    onChange={(e) =>
                      updateStop(i, { commodity: e.target.value })
                    }
                  />
                </label>
                <label>
                  Cargo quantity (SCU)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0"
                    value={Number.isNaN(o.quantitySCU) ? "" : o.quantitySCU}
                    onChange={(e) =>
                      updateStop(i, { quantitySCU: e.target.valueAsNumber })
                    }
                  />
                </label>
              </div>
              {contract?.source === "OCR" && (
                <label>
                  Delivered SCU
                  <input
                    type="number"
                    min="0"
                    max={o.quantitySCU}
                    step="any"
                    value={o.deliveredSCU ?? 0}
                    onChange={(e) =>
                      updateStop(i, { deliveredSCU: e.target.valueAsNumber })
                    }
                  />
                </label>
              )}
              {draft.objectives.length > 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      objectives: draft.objectives.filter((_, j) => i !== j),
                    })
                  }
                >
                  <Trash2 size={13} />
                  Remove stop {i + 1}
                </button>
              )}
            </fieldset>
          ))}
          <button
            type="button"
            className="button full-width"
            onClick={() =>
              setDraft({
                ...draft,
                objectives: [...draft.objectives, emptyStop()],
              })
            }
          >
            <Plus size={15} />
            Add delivery stop
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="form-note">
            Source: {contract?.source ?? "Manual"} · Edits are manual
            corrections saved locally.
          </p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            <Save size={15} />
            Save contract
          </button>
        </div>
      </form>
    </Overlay>
  );
}
