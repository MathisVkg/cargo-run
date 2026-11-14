import { useState } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
export function CargoWorkflow() {
  const enabled = useCargoStore((s) => s.workflow.automaticCompletion),
    update = useCargoStore((s) => s.setWorkflow);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <>
      <section className="panel setting-card experimental-settings">
        <h2>Experimental Automation</h2>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={async (e) => {
              const value = e.target.checked;
              setBusy(true);
              setMessage("");
              try {
                await update({ automaticCompletion: value });
                setMessage(
                  value
                    ? "Beta enabled for new eligible events. Historical evidence was not replayed."
                    : "Manual completion enabled. Association prompts are hidden; saved evidence is retained.",
                );
              } catch (e) {
                setMessage(String(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          Automatic contract completion (Beta)
        </label>
        <p className="form-note">
          Off by default. When enabled, verified Game.log lifecycle evidence can
          complete or abandon a contract; uncertain matches require
          confirmation. Automatic OCR capture is configured independently in
          screenshot settings.
        </p>
        {message && <p role="status">{message}</p>}
      </section>
    </>
  );
}
