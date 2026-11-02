import { useEffect, useState } from "react";
import type { Contract } from "../../types/models";
import type { CargoActivity } from "../../types/progress";
import { useCargoStore } from "../../stores/useCargoStore";
import { number, date } from "../../utils/format";
export function CargoActivityPanel({ contract }: { contract: Contract }) {
  const revision = useCargoStore((s) => s.revision),
    [rows, setRows] = useState<CargoActivity[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void window.cargoRun
      .cargoActivity(contract.id)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [contract.id, revision]);
  return (
    <section aria-label="Cargo activity">
      <h2>Cargo Activity</h2>
      <p className="form-note">
        Latest 50 operations. Manual reports and supported delivery
        notifications do not verify physical inventory automatically.
      </p>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>No cargo operations recorded.</p>}
      <ol className="cargo-activity">
        {rows.map((a) => (
          <li key={a.id}>
            <strong>{a.action}</strong> ·{" "}
            {contract.cargoObjectives.find((o) => o.id === a.objectiveId)
              ?.commodity ?? "Retained objective"}{" "}
            · {a.source} · {date(a.at)}
            <p>
              Onboard {number(a.previous.loaded)} → {number(a.next.loaded)} SCU
              · Delivered {number(a.previous.delivered)} →{" "}
              {number(a.next.delivered)} SCU
            </p>
            <details>
              <summary>Advanced · Operation evidence</summary>
              <pre className="ocr-raw">{JSON.stringify(a, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
