import { useEffect, useState, useSyncExternalStore } from "react";
import { HardDrive, CircleHelp } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { Sidebar } from "./components/navigation/Navigation";
import { useCargoStore, initializeCargoStore } from "./stores/useCargoStore";
import Dashboard from "./pages/Dashboard";
import Manifest from "./pages/Manifest";
import Contracts from "./pages/Contracts";
import History from "./pages/History";
import Settings from "./pages/Settings";
import ScanReview from "./pages/ScanReview";
import { initializeOcrStore } from "./stores/useOcrStore";
import { navigationModeForWidth } from "./utils/navigation";
const subscribeWidth = (callback: () => void) => {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
};
export default function App() {
  const width = useSyncExternalStore(subscribeWidth, () => window.innerWidth);
  const preferred = useCargoStore((s) => s.preferences.navigationMode);
  const setPreferences = useCargoStore((s) => s.setPreferences);
  const [narrowOpen, setNarrowOpen] = useState(false);
  const narrow = width < 1200;
  const navigationMode = navigationModeForWidth(width, preferred, narrowOpen);
  const page = useCargoStore((s) => s.page);
  const setPage = useCargoStore((s) => s.setPage);
  const sampleMode = useCargoStore((s) => s.sampleMode);
  useEffect(() => setNarrowOpen(false), [narrow]);
  const toggleNavigation = () => {
    if (narrow) {
      setNarrowOpen((v) => !v);
      return;
    } else
      void setPreferences({
        navigationMode: navigationMode === "hidden" ? "compact" : "hidden",
      });
  };
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
      <TopBar onMenu={toggleNavigation} navigationMode={navigationMode} />
      <div className="workspace">
        <Sidebar mode={navigationMode} width={width} />
        <main key={page} className="page-content">
          {error && (
            <div className="notice error" role="alert">
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
          ) : page === "Contracts" ? (
            <Contracts />
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
          {page === "Scan Review" ? "SCAN HISTORY" : page.toUpperCase()}
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
          <span className="status-divider">/</span>v0.6.2
        </span>
      </footer>
    </div>
  );
}
