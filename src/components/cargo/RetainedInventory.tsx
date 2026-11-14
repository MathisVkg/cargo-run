import { useEffect, useState } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
import { loaded } from "../../types/progress";
import { ProgressControls } from "./ProgressControls";
import { Overlay } from "../ui/Overlay";
import { ShipSelector } from "../ships/ShipSelector";
import { number } from "../../utils/format";
export function RetainedInventory() {
  const request = useCargoStore((s) => s.retainedInventoryRequest),
    contracts = useCargoStore((s) => s.contracts),
    ships = useCargoStore((s) => s.ships);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (request) setOpen(true);
  }, [request]);
  const rows = contracts
    .filter((c) => !c.supersededBy)
    .flatMap((c) =>
      c.cargoObjectives.filter((o) => loaded(o) > 0).map((o) => ({ c, o })),
    );
  return (
    <Overlay
      open={open}
      onClose={() => setOpen(false)}
      side="center"
      title="Retained onboard inventory"
    >
      <div className="dialog-body retained-recovery">
        <p>
          Saved physical records are separate from the Cargo Plan. Select the
          assigned ship to unload or correct quantities; cleanup remains blocked
          while closed cargo is onboard.
        </p>
        <ShipSelector />
        {!rows.length && <p>No retained onboard cargo.</p>}
        {rows.map(({ c, o }) => (
          <article className="panel retained-cargo" key={o.id}>
            <h3>
              {c.name} · {o.commodity}
            </h3>
            <p>
              {number(loaded(o))} SCU ·{" "}
              {ships.find((s) => s.id === o.loadedShipId)?.name ?? "Saved ship"}{" "}
              · {c.status}
            </p>
            <ProgressControls contract={c} objective={o} kind="delivery" />
          </article>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
    </Overlay>
  );
}
