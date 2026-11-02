import { useEffect, useState } from "react";
import type { Contract } from "../../types/models";
import type { LifecycleActivity } from "../../types/lifecycle";
import { useCargoStore } from "../../stores/useCargoStore";
import { date } from "../../utils/format";
export function LifecycleHistory({ contract }: { contract: Contract }) {
  const revision = useCargoStore((s) => s.revision),
    [rows, setRows] = useState<LifecycleActivity[]>([]);
  useEffect(() => {
    let active = true;
    void window.cargoRun
      .lifecycleHistory(contract.id)
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [contract.id, revision]);
  if (!rows.length && !contract.lifecycle) return null;
  return (
    <section aria-label="Mission lifecycle history">
      <h2>Mission Lifecycle</h2>
      <p>
        Closure preserves recorded cargo. Remaining onboard inventory can be
        unloaded or corrected in Manifest; closure does not confirm delivery or
        payout.
      </p>
      {rows.map((a) => (
        <div key={a.id}>
          <strong>{a.action}</strong> · {date(a.at)} · Verified Game.log
          identity
          <details>
            <summary>Advanced · Lifecycle evidence</summary>
            <pre className="ocr-raw">
              {JSON.stringify(
                { activity: a, association: contract.missionAssociation },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ))}
    </section>
  );
}
