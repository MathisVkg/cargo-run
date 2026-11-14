import { useEffect } from "react";
import { TopBar } from "./components/layout/TopBar";
import { BottomNavigation } from "./components/navigation/BottomNavigation";
import { useCargoStore, initializeCargoStore } from "./stores/useCargoStore";
import { initializeOcrStore } from "./stores/useOcrStore";
import Contracts from "./pages/Contracts";
import Cargo from "./pages/Cargo";
import History from "./pages/History";
import Settings from "./pages/Settings";
import { ContractEditor } from "./components/contracts/ContractEditor";
import { RetainedInventory } from "./components/cargo/RetainedInventory";
export default function App() {
  const page = useCargoStore((s) => s.page),
    ready = useCargoStore((s) => s.ready),
    error = useCargoStore((s) => s.actionError),
    dismiss = useCargoStore((s) => s.dismissError);
  useEffect(() => {
    const a = initializeCargoStore(),
      b = initializeOcrStore();
    return () => {
      a();
      b();
    };
  }, []);
  return (
    <div className="app-shell foundation-shell">
      <TopBar />
      <main className="page-content" key={page}>
        {!ready ? (
          <p role="status">Loading saved operations…</p>
        ) : (
          <>
            {error && (
              <div className="notice error" role="alert">
                <span>{error}</span>
                <button className="button small" onClick={dismiss}>
                  Dismiss
                </button>
              </div>
            )}
            {page === "Cargo" ? (
              <Cargo />
            ) : page === "History" ? (
              <History />
            ) : page === "Settings" ? (
              <Settings />
            ) : (
              <Contracts />
            )}
          </>
        )}
      </main>
      <BottomNavigation />
      <ContractEditor />
      <RetainedInventory />
    </div>
  );
}
