import { useState } from "react";
import { useCargoStore } from "../../stores/useCargoStore";
import { ShipSelector } from "../../components/ships/ShipSelector";
import { OcrSettings } from "./OcrSettings";
import { CargoWorkflow } from "./CargoWorkflow";
import { LogMonitoring } from "./LogMonitoring";
import { LocalDataManagement } from "./LocalDataManagement";
import { Overlay } from "../../components/ui/Overlay";
export default function Settings() {
  const database = useCargoStore((s) => s.databasePath),
    sample = useCargoStore((s) => s.sampleMode),
    removeSamples = useCargoStore((s) => s.clearSampleData),
    loadSamples = useCargoStore((s) => s.loadSamples),
    contracts = useCargoStore((s) => s.contracts),
    tracking = useCargoStore((s) => s.tracking),
    inventory = useCargoStore((s) => s.showRetainedInventory),
    [remove, setRemove] = useState(false);
  return (
    <>
      <header className="foundation-page-heading">
        <div>
          <p className="eyebrow">APPLICATION</p>
          <h1>Settings</h1>
        </div>
      </header>
      <div className="foundation-settings">
        <details className="settings-section" open>
          <summary>General</summary>
          <div className="settings-section-body">
            <h2>Ship preferences</h2>
            <p>
              Select a ship; favorites and recent ships are available in the
              picker. Existing cargo stays assigned to its recorded ship.
            </p>
            <ShipSelector />
            <h2>Window behavior</h2>
            <p>
              Frameless window with independent content scrolling. Four-section
              navigation always stays visible, including portrait windows.
            </p>
          </div>
        </details>
        <details className="settings-section" open>
          <summary>Capture &amp; OCR</summary>
          <div className="settings-section-body">
            <p>
              Add Contract captures the Star Citizen window once for review
              before saving. Shortcut and automatic capture retain the settings
              below.
            </p>
            <OcrSettings />
            <details className="settings-troubleshooting">
              <summary>OCR troubleshooting</summary>
              <OcrSettings section="advanced" />
            </details>
          </div>
        </details>
        <details className="settings-section">
          <summary>Automation</summary>
          <div className="settings-section-body">
            <CargoWorkflow />
            <LogMonitoring />
          </div>
        </details>
        <details className="settings-section">
          <summary>Data Management</summary>
          <div className="settings-section-body">
            <p className="log-path">{database}</p>
            <button className="button" onClick={inventory}>
              Open retained inventory
            </button>
            <LocalDataManagement />
            <details className="settings-capture-storage">
              <summary>Capture storage &amp; retention</summary>
              <OcrSettings section="storage" />
            </details>
            {!contracts.length && !tracking.enabled && !sample && (
              <button className="button" onClick={() => void loadSamples()}>
                Load demonstration contracts
              </button>
            )}
            {sample && (
              <button className="button danger" onClick={() => setRemove(true)}>
                Remove sample contracts
              </button>
            )}
          </div>
        </details>
        <details className="settings-section">
          <summary>About &amp; Diagnostics</summary>
          <div className="settings-section-body">
            <h2>Cargo Run 0.8.1</h2>
            <p>
              Local Windows companion · SQLite · offline OCR. Independent
              application, not affiliated with Cloud Imperium Games.
            </p>
            <LogMonitoring diagnosticsOnly />
          </div>
        </details>
      </div>
      <Overlay
        open={remove}
        onClose={() => setRemove(false)}
        title="Remove sample contracts?"
        side="center"
      >
        <div className="dialog-body">
          Only demonstration contracts are removed. Manual entries and saved
          runs remain.
        </div>
        <div className="dialog-actions">
          <button className="button" onClick={() => setRemove(false)}>
            Cancel
          </button>
          <button
            className="button danger"
            onClick={async () => {
              await removeSamples();
              setRemove(false);
            }}
          >
            Remove sample contracts
          </button>
        </div>
      </Overlay>
    </>
  );
}
