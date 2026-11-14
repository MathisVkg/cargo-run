import { useCargoStore } from "../../stores/useCargoStore";
export function BottomNavigation() {
  const page = useCargoStore((s) => s.page),
    setPage = useCargoStore((s) => s.setPage);
  return (
    <nav className="bottom-navigation" aria-label="Main navigation">
      {(["Contracts", "Cargo", "History", "Settings"] as const).map((name) => (
        <button
          key={name}
          aria-current={page === name ? "page" : undefined}
          onClick={() => setPage(name)}
        >
          {name}
        </button>
      ))}
    </nav>
  );
}
