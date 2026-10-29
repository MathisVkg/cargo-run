import { useState } from "react";
import { Rocket, Database, Info, Trash2 } from "lucide-react";
import { PageHeader, Badge } from "../../components/ui";
import { Overlay } from "../../components/ui/Overlay";
import { useCargoStore } from "../../stores/useCargoStore";
import { LogMonitoring } from "./LogMonitoring";
import { OcrSettings } from "./OcrSettings";
export default function Settings() {
  const ships = useCargoStore((s) => s.ships);
  const databasePath = useCargoStore((s) => s.databasePath);
  const contracts = useCargoStore((s) => s.contracts);
  const loadSamples = useCargoStore((s) => s.loadSamples);
  const tracking = useCargoStore((s) => s.tracking);
  const selected = useCargoStore((s) => s.selectedShipId);
  const selectShip = useCargoStore((s) => s.selectShip);
  const sampleMode = useCargoStore((s) => s.sampleMode);
  const clear = useCargoStore((s) => s.clearSampleData);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <PageHeader
        eyebrow="SYSTEM / SETTINGS"
        title="Settings"
        description="Your local operations environment."
      />
      <div className="settings-grid">
        <OcrSettings />
        <LogMonitoring />
        <section className="panel setting-card">
          <div className="setting-icon">
            <Rocket size={21} />
          </div>
          <h2>Ships</h2>
          <p>Capacity updates across your current operations.</p>
          <label htmlFor="settings-ship">Demonstration ship</label>
          <select
            id="settings-ship"
            value={selected}
            onChange={(e) => selectShip(e.target.value)}
          >
            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.cargoCapacitySCU} SCU
              </option>
            ))}
          </select>
          <p className="form-note">
            Three demonstration records. Full ship database comes later.
          </p>
        </section>
        <section className="panel setting-card">
          <div className="setting-icon">
            <Database size={21} />
          </div>
          <h2>Storage &amp; Data</h2>
          <OcrSettings section="storage" />
          <p>
            Contracts, objectives, runs, ship selection, monitoring
            configuration, and event checkpoints are saved locally in SQLite.
          </p>
          <Badge tone="green">SQLite persistence active</Badge>
          <p className="log-path">{databasePath}</p>
          {!sampleMode &&
            !contracts.length &&
            !tracking.enabled &&
            tracking.accepted === 0 && (
              <button
                className="button sample-clear"
                onClick={() => void loadSamples()}
              >
                Load demonstration contracts
              </button>
            )}
          {sampleMode && (
            <button
              className="button sample-clear"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={14} />
              Remove sample contracts
            </button>
          )}
          <p className="form-note">
            Manual entries are preserved when sample contracts are removed.
            Closed run snapshots are retained. Sample and live tracking cannot
            run together.
          </p>
        </section>
        <details className="panel setting-card advanced-panel">
          <summary>Advanced &amp; Diagnostics</summary>
          <OcrSettings section="advanced" />
          <LogMonitoring diagnosticsOnly />
          <section className="app-info">
            <div className="setting-icon">
              <Info size={21} />
            </div>
            <div>
              <h2>
                Cargo Run <Badge>0.4.1</Badge>
              </h2>
              <p>Fleet Operations · SQLite, Game.log & local OCR prototype</p>
              <p className="form-note">
                Independent companion application. Not affiliated with Cloud
                Imperium Games or Roberts Space Industries.
              </p>
            </div>
          </section>
        </details>
      </div>
      <Overlay
        open={confirm}
        onClose={() => setConfirm(false)}
        side="center"
        title="Remove sample contracts?"
        subtitle="LOCAL DATA"
      >
        <div className="dialog-body">
          <p>
            This removes only sample contracts from the current ledger and
            manifest. Your manual entries and saved run snapshots remain in this
            database.
          </p>
          <p>Removed sample contracts do not return automatically.</p>
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={() => {
              clear();
              setConfirm(false);
            }}
          >
            Remove sample contracts
          </button>
        </div>
      </Overlay>
    </>
  );
}
