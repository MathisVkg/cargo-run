import { useRef, useState } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
import { date, number } from "../../utils/format";
export function LifecycleIssues() {
  const issues = useCargoStore((s) => s.lifecycleIssues),
    resolve = useCargoStore((s) => s.resolveLifecycle);
  const [selected, setSelected] = useState<Record<string, string>>({}),
    [choosing, setChoosing] = useState<Record<string, boolean>>({}),
    [confirmed, setConfirmed] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  if (!issues?.length) return null;
  return (
    <section
      className="panel lifecycle-issues"
      aria-label="Mission lifecycle reconciliation"
    >
      {issues.map((i) => {
        const id =
          selected[i.missionId] ??
          (i.candidates.length === 1 ? i.candidates[0].id : "");
        const candidate = i.candidates.find((c) => c.id === id);
        async function apply(dismiss = false) {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          setError("");
          try {
            await resolve({
              missionId: i.missionId,
              version: i.version,
              ...(dismiss
                ? { dismiss: true }
                : { contractId: id, confirmed: true }),
            });
          } catch (e) {
            setError(String(e));
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }
        return (
          <article key={i.missionId} data-mission-issue={i.missionId}>
            <h2>
              Mission {i.kind === "Completed" ? "completed" : "abandoned"} —
              confirmation needed
            </h2>
            <p>
              Cargo Run detected{" "}
              {i.kind === "Completed" ? "a completed" : "an abandoned"} mission
              but couldn't identify its tracked contract with enough confidence.
            </p>
            <p>
              <strong>{i.title}</strong> · {date(i.eventAt)}
            </p>
            {candidate && (
              <p>
                Suggested contract: <strong>{candidate.name}</strong> ·{" "}
                {number(candidate.required)} SCU
              </p>
            )}
            {(choosing[i.missionId] || !candidate) && (
              <label>
                Tracked contract
                <select
                  aria-label={"Tracked contract for " + i.missionId}
                  value={id}
                  disabled={busy}
                  onChange={(e) => {
                    setSelected({ ...selected, [i.missionId]: e.target.value });
                    setConfirmed({ ...confirmed, [i.missionId]: "" });
                  }}
                >
                  <option value="">Choose an active contract</option>
                  {i.candidates.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name} · {number(c.required)} SCU · …{c.id.slice(-8)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed[i.missionId] === i.version + ":" + id}
                disabled={busy || !candidate}
                onChange={(e) =>
                  setConfirmed({
                    ...confirmed,
                    [i.missionId]: e.target.checked ? i.version + ":" + id : "",
                  })
                }
              />
              These refer to the same in-game mission
            </label>
            <div className="lifecycle-actions">
              <button
                className="button primary"
                disabled={
                  busy ||
                  !candidate ||
                  confirmed[i.missionId] !== i.version + ":" + id
                }
                onClick={() => void apply()}
              >
                Confirm match
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  setChoosing({
                    ...choosing,
                    [i.missionId]: !choosing[i.missionId],
                  })
                }
              >
                Choose another contract
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void apply(true)}
              >
                Dismiss
              </button>
            </div>
            <details>
              <summary>Advanced details</summary>
              <p>
                {candidate?.reason}
                <br />
                Available identity evidence: {candidate?.identityEvidence}
                <br />
                Automatic association unavailable: {candidate?.automaticReason}
              </p>
              <p>
                MissionId: {i.missionId}
                <br />
                EventId: {i.eventId}
              </p>
              <p>
                Cargo allocations will be preserved; no earnings are confirmed.
              </p>
            </details>
          </article>
        );
      })}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
