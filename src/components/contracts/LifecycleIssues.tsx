import { useState, useRef } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
import { date, number } from "../../utils/format";
export function LifecycleIssues() {
  const issues = useCargoStore((s) => s.lifecycleIssues),
    resolve = useCargoStore((s) => s.resolveLifecycle);
  const lock = useRef(false);
  const [selected, setSelected] = useState<Record<string, string>>({}),
    [confirmed, setConfirmed] = useState<Record<string, boolean>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!issues?.length) return null;
  return (
    <section
      className="panel lifecycle-issues"
      aria-label="Mission lifecycle reconciliation"
    >
      <h2>
        {issues.length} mission lifecycle{" "}
        {issues.length === 1 ? "event needs" : "events need"} association
      </h2>
      <p>
        Game.log reports a mission ended. Confirm which active contract it
        belongs to; title, reward and timing alone do not verify identity.
      </p>
      {issues.map((i) => (
        <details key={i.missionId}>
          <summary>
            {i.kind === "Completed" ? "Completion" : "Abandonment"} · {i.title}{" "}
            · Mission …{i.missionId.slice(-8)}
          </summary>
          <p>
            {date(i.eventAt)} ·{" "}
            {i.eventAt ? "Game.log event time" : "Event time unavailable"}.
            Cargo allocations will be preserved; no earnings are confirmed.
          </p>
          <label>
            Tracked contract
            <select
              aria-label={"Tracked contract for " + i.missionId}
              value={selected[i.missionId] ?? ""}
              onChange={(e) => {
                setSelected({ ...selected, [i.missionId]: e.target.value });
                setConfirmed({ ...confirmed, [i.missionId]: false });
              }}
            >
              <option value="">Choose an active contract</option>
              {i.candidates.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} · {number(c.required)} SCU required ·{" "}
                  {number(c.onboard)} onboard · …{c.id.slice(-8)}
                </option>
              ))}
            </select>
          </label>
          {selected[i.missionId] && (
            <p className="form-note">
              {i.candidates.find((c) => c.id === selected[i.missionId])?.reason}
              <br />
              Available identity evidence:{" "}
              {
                i.candidates.find((c) => c.id === selected[i.missionId])
                  ?.identityEvidence
              }
              <br />
              Automatic association unavailable:{" "}
              {
                i.candidates.find((c) => c.id === selected[i.missionId])
                  ?.automaticReason
              }
            </p>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={confirmed[i.missionId] ?? false}
              onChange={(e) =>
                setConfirmed({ ...confirmed, [i.missionId]: e.target.checked })
              }
            />
            These refer to the same in-game mission
          </label>
          <div className="lifecycle-actions">
            <button
              className="button primary"
              disabled={
                busy || !selected[i.missionId] || !confirmed[i.missionId]
              }
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                  await resolve({
                    missionId: i.missionId,
                    contractId: selected[i.missionId],
                    version: i.version,
                    confirmed: true,
                  });
                } catch (e) {
                  setError(String(e));
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              Associate and apply{" "}
              {i.kind === "Completed" ? "completion" : "abandonment"}
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                setError("");
                try {
                  await resolve({
                    missionId: i.missionId,
                    version: i.version,
                    dismiss: true,
                  });
                } catch (e) {
                  setError(String(e));
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              Dismiss issue
            </button>
          </div>
          <details>
            <summary>Advanced · Event identity</summary>
            <p>
              MissionId: {i.missionId}
              <br />
              EventId: {i.eventId}
            </p>
          </details>
        </details>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
