import { useEffect, useState } from "react";
import { Box, HardDrive, CircleHelp } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { Navigation } from "./components/navigation/Navigation";
import { useCargoStore, initializeCargoStore } from "./stores/useCargoStore";
import Dashboard from "./pages/Dashboard";
import Manifest from "./pages/Manifest";
import History from "./pages/History";
import Settings from "./pages/Settings";
import ScanReview from "./pages/ScanReview";
import { initializeOcrStore } from "./stores/useOcrStore";
export default function App() {
  const page = useCargoStore((s) => s.page);
  const setPage = useCargoStore((s) => s.setPage);
  const sampleMode = useCargoStore((s) => s.sampleMode);
  const [nav, setNav] = useState(false);
  const ready = useCargoStore((s) => s.ready);
  const error = useCargoStore((s) => s.actionError);
  const dismissError = useCargoStore((s) => s.dismissError);
  useEffect(() => {
    const cargo = initializeCargoStore();
    const ocr = initializeOcrStore();
    return () => {
      cargo();
      ocr();
    };
  }, []);
  return (
    <div className="app-shell">
      <TopBar onMenu={() => setNav(true)} />
      <div className="workspace">
        <aside className="workspace-rail" aria-hidden="true">
          <Box size={20} />
          <span />
          <div>CR / OPERATIONS</div>
          <span />
        </aside>
        <main key={page} className="page-content">
          {error && (
            <div className="notice warning" role="alert">
              <span>{error}</span>
              <button className="button" onClick={dismissError}>
                Dismiss
              </button>
            </div>
          )}
          {!ready && (
            <div className="notice" role="status">
              Loading saved operations…
            </div>
          )}
          {sampleMode && (
            <div className="sample-banner">
              <span className="sample-dot" />
              SAMPLE DATA{" "}
              <span>
                Demonstration mode · remove samples before log tracking
              </span>
              <button onClick={() => setPage("Settings")}>
                Manage in Settings
              </button>
            </div>
          )}
          {page === "Dashboard" ? (
            <Dashboard />
          ) : page === "Manifest" ? (
            <Manifest />
          ) : page === "History" ? (
            <History />
          ) : page === "Scan Review" ? (
            <ScanReview />
          ) : (
            <Settings />
          )}
        </main>
      </div>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          LOCAL OPERATIONS <span className="status-divider">/</span>
          {page.toUpperCase()}
        </span>
        <span>
          <HardDrive size={12} />
          SQLite · Local storage
          <button
            onClick={() => setPage("Settings")}
            aria-label="Application information"
          >
            <CircleHelp size={13} />
          </button>
          <span className="status-divider">/</span>v0.3.2
        </span>
      </footer>
      <Navigation open={nav} onClose={() => setNav(false)} />
    </div>
  );
}
